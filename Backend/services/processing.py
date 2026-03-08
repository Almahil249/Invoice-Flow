"""Processing orchestrator — dual OCR → LLM validation → storage pipeline (PostgreSQL)."""

from __future__ import annotations
import asyncio
import json
import logging
import io
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, date as date_type
from typing import Optional

# New dependencies
import pillow_heif
from PIL import Image

from services.ocr import google_vision, ocr_space, azure_cv, aws_textract
from services.llm import validate_dual_ocr, judge_multi_ocr, suggest_category
from services import google_drive
from config import settings
from database import async_session, Invoice, OCRAuditLog
from sqlalchemy import select

logger = logging.getLogger(__name__)

# Register HEIF opener
pillow_heif.register_heif_opener()

_executor = ThreadPoolExecutor(max_workers=4)


async def process_receipt(invoice_id: str, file_id: str) -> None:
    """
    Full processing pipeline (runs in background):
      1. Download image from Google Drive
      2. Convert HEIC to JPEG if needed
      3. Check file size
      4. Select OCR strategy (Vision + [OCR.space or AWS/Azure])
      5. LLM Validation & Judge
      6. Update PostgreSQL record
    """
    logger.info("[Invoice %s] Starting background processing...", invoice_id)

    ocr1_result = {}
    ocr2_result = {}
    ocr3_result = {} # For audit log
    ocr4_result = {} # For audit log - max 4 services now
    
    try:
        # ── Step 1: Download from Drive ──
        try:
            image_bytes = await asyncio.get_event_loop().run_in_executor(
                _executor, google_drive.download_file, file_id
            )
        except Exception as e:
            await _update_status(invoice_id, "error", f"Download failed: {str(e)}")
            return

        # ── Step 2: Convert HEIC to JPEG if needed ──
        # Also fix rotation if EXIF present
        try:
            image_bytes = await asyncio.get_event_loop().run_in_executor(
                _executor, _prepare_image, image_bytes
            )
        except Exception as e:
            await _update_status(invoice_id, "error", f"Image processing failed: {str(e)}")
            return

        file_size_mb = len(image_bytes) / (1024 * 1024)
        is_large_file = file_size_mb > 1.0

        # ── Step 3: Run OCRs ──
        loop = asyncio.get_event_loop()
        
        # Always run Google Vision (Best general purpose)
        future_vision = loop.run_in_executor(_executor, google_vision.extract_text, image_bytes)
        
        tasks = [future_vision]
        ocr_services = ["Google Vision"]

        if is_large_file:
            # > 1MB: Skip OCR.space, use AWS + Azure
            logger.info("[Invoice %s] Large file (%.2f MB). Using Vision + AWS + Azure.", invoice_id, file_size_mb)
            future_aws = loop.run_in_executor(_executor, aws_textract.extract_text, image_bytes)
            future_azure = loop.run_in_executor(_executor, azure_cv.extract_text, image_bytes)
            tasks.extend([future_aws, future_azure])
            ocr_services.extend(["AWS Textract", "Azure CV"])
        else:
            # <= 1MB: Use OCR.space (Free/Cheap)
            logger.info("[Invoice %s] Small file. Using Vision + OCR.space.", invoice_id)
            future_ocrspace = loop.run_in_executor(_executor, ocr_space.extract_text, image_bytes)
            tasks.append(future_ocrspace)
            ocr_services.append("OCR.space")

        results = await asyncio.gather(*tasks)
        
        # Map results back to variables for logging/audit
        # Vision is always index 0
        vision_res = results[0]
        ocr1_result = vision_res
        
        # Determine secondary results
        secondary_res = None
        tertiary_res = None
        
        if is_large_file:
            # results: [Vision, AWS, Azure]
            aws_res = results[1]
            azure_res = results[2]
            ocr2_result = aws_res
            ocr3_result = azure_res
            
            # Initial validation with Vision vs AWS (or Azure?)
            # Let's use Vision vs AWS as primary pair
            ocr1_text = vision_res.get("raw_text", "")
            ocr2_text = aws_res.get("raw_text", "")
        else:
            # results: [Vision, OCR.space]
            space_res = results[1]
            ocr2_result = space_res
            ocr1_text = vision_res.get("raw_text", "")
            ocr2_text = space_res.get("raw_text", "")

        # ── Step 3.5: Debug Logging ──
        if settings.debug_mode:
            logger.info("========== DEBUG: OCR OUTPUTS ==========")
            logger.info(f"OCR 1 ({'Vision'}): {ocr1_text[:500]}...")
            logger.info(f"OCR 2 ({'AWS/Azure' if is_large_file else 'OCR.space'}): {ocr2_text[:500]}...")
            if is_large_file and len(results) > 2:
                 logger.info(f"OCR 3 (Azure - Backup): {results[2].get('raw_text', '')[:500]}...")
            logger.info("========================================")

        # ── Step 4: LLM Validation ──
        # Check if we have valid text
        if not ocr1_text.strip() and not ocr2_text.strip():
             # Both failed logic?
             # If large file, we have Azure too.
             if is_large_file and results[2].get("raw_text"):
                 # Use Azure as backup
                 ocr2_text = results[2].get("raw_text", "")
        
        llm_result = await loop.run_in_executor(
            _executor,
            validate_dual_ocr,
            ocr1_text,
            ocr2_text,
        )

        status = llm_result.get("status", "")
        receipt_data = llm_result.get("receipt_data", {})
        validation = llm_result.get("validation", {})

        # ── Step 5: Judge (Tie-breaker) if needed ──
        if status == "mismatch_detected":
            logger.info("[Invoice %s] Mismatch. Running Judge...", invoice_id)
            
            # Gather all available outputs
            valid_outputs = []
            if vision_res.get("raw_text"): valid_outputs.append(vision_res.get("raw_text"))
            
            if is_large_file:
                 if aws_res.get("raw_text"): valid_outputs.append(aws_res.get("raw_text"))
                 if azure_res.get("raw_text"): valid_outputs.append(azure_res.get("raw_text"))
            else:
                 if space_res.get("raw_text"): valid_outputs.append(space_res.get("raw_text"))
                 # If mismatch on small file, maybe run AWS/Azure now?
                 # Yes, let's run AWS + Azure to break tie if not already run
                 if len(valid_outputs) < 3: # We only have Vision + Space
                     logger.info("[Invoice %s] Running extra OCRs (AWS/Azure) for judge...", invoice_id)
                     ft_aws = loop.run_in_executor(_executor, aws_textract.extract_text, image_bytes)
                     ft_azure = loop.run_in_executor(_executor, azure_cv.extract_text, image_bytes)
                     extra_results = await asyncio.gather(ft_aws, ft_azure)
                     
                     ocr3_result = extra_results[0] # AWS
                     ocr4_result = extra_results[1] # Azure
                     
                     if ocr3_result.get("raw_text"): valid_outputs.append(ocr3_result.get("raw_text"))
                     if ocr4_result.get("raw_text"): valid_outputs.append(ocr4_result.get("raw_text"))

            if valid_outputs:
                llm_result = await loop.run_in_executor(
                    _executor,
                    judge_multi_ocr,
                    valid_outputs
                )
                status = llm_result.get("status", "review_required")
                receipt_data = llm_result.get("receipt_data", {})
                validation = llm_result.get("validation", {})
            else:
                status = "manual_entry_required"
        
        # ── Step 6: Category Suggestion (if missing) ──
        if not receipt_data.get("category") or receipt_data.get("category") == "Other":
            store = receipt_data.get("store_name", "")
            items = receipt_data.get("items_summary", "")
            if store:
                cat = await loop.run_in_executor(_executor, suggest_category, store, items)
                if cat:
                    receipt_data["category"] = cat

        # ── Step 7: Update DB ──
        await _save_results(invoice_id, status, receipt_data, validation, ocr1_result, ocr2_result, ocr3_result, ocr4_result)

    except Exception as e:
        logger.error("[Invoice %s] Processing Error: %s", invoice_id, str(e), exc_info=True)
        await _update_status(invoice_id, "error", str(e))


def _prepare_image(image_bytes: bytes) -> bytes:
    """Convert HEIC/PDF to JPEG for OCR services.

    - PDF: render page 1 at 300 DPI via PyMuPDF
    - HEIC/RGBA/other: convert to JPEG via Pillow
    - JPEG/PNG: pass through unchanged
    """
    # ── PDF detection (magic bytes: %PDF) ──
    if image_bytes[:5] == b"%PDF-":
        try:
            import fitz  # PyMuPDF

            doc = fitz.open(stream=image_bytes, filetype="pdf")
            page = doc[0]  # First page (invoices are typically single-page)
            # Render at 300 DPI for high-quality OCR
            mat = fitz.Matrix(300 / 72, 300 / 72)
            pix = page.get_pixmap(matrix=mat)
            jpeg_bytes = pix.tobytes("jpeg")
            doc.close()
            logger.info("PDF converted to JPEG (%d bytes → %d bytes)", len(image_bytes), len(jpeg_bytes))
            return jpeg_bytes
        except Exception as e:
            logger.error("PDF-to-image conversion failed: %s", e)
            return image_bytes  # Return original; AWS Textract can still handle raw PDF

    # ── Regular image handling (HEIC, RGBA, etc.) ──
    try:
        image = Image.open(io.BytesIO(image_bytes))

        # Convert if not supported format for OCR
        if image.format not in ["JPEG", "PNG"]:
            output = io.BytesIO()
            # Convert to RGB if needed (e.g. RGBA to JPEG)
            if image.mode in ("RGBA", "P"):
                image = image.convert("RGB")
            image.save(output, format="JPEG", quality=90)
            return output.getvalue()

        return image_bytes
    except Exception as e:
        logger.warning("Image conversion warning: %s", e)
        return image_bytes  # Return original if conversion fails (might still work)


async def _update_status(invoice_id: str, status: str, error_msg: str = ""):
    async with async_session() as db:
        result = await db.execute(select(Invoice).where(Invoice.invoice_id == invoice_id))
        invoice = result.scalar_one_or_none()
        if invoice:
            invoice.processing_status = status
            if error_msg:
                invoice.notes = f"{invoice.notes}\nError: {error_msg}".strip()
            await db.commit()


async def _save_results(
    invoice_id: str, 
    status: str, 
    data: dict, 
    validation: dict, 
    ocr1: dict, 
    ocr2: dict, 
    ocr3: dict,
    ocr4: dict
):
    async with async_session() as db:
        result = await db.execute(select(Invoice).where(Invoice.invoice_id == invoice_id))
        invoice = result.scalar_one_or_none()
        if not invoice:
            return

        # Parse date
        parsed_date = None
        raw_date = data.get("invoice_date", "")
        if raw_date:
            try:
                parsed_date = date_type.fromisoformat(raw_date)
            except ValueError:
                pass
        
        # Safe extraction (handle None or missing keys)
        amount_before = data.get("amount_before_tax") or 0.0
        amount_after = data.get("amount_after_tax") or 0.0
        vat_amount = data.get("vat_amount") or 0.0

        # Validate consistency if all values are present (non-zero)
        if vat_amount and amount_after and amount_before:
            expected = amount_after - amount_before
            if abs(vat_amount - expected) > 0.05:
                status = "mismatch_detected"
                validation.setdefault("mismatched_fields", []).append("vat_calculation")

        # Calculate VAT if missing but others present
        if not vat_amount and amount_after and amount_before:
            vat_amount = amount_after - amount_before

        # Check for duplicates
        from services.validation import check_duplicate
        is_duplicate = False
        if await check_duplicate(db, data.get("invoice_number", ""), parsed_date, amount_after, current_invoice_id=invoice.invoice_id):
            is_duplicate = True
            # Overwrite status to rejected if duplicate, even if other mismatches exist
            status = "rejected"
            validation.setdefault("mismatched_fields", []).append("duplicate_invoice")
            invoice.notes = (invoice.notes or "") + "\nDuplicate: Invoice number, date, and amount match an existing record."

        invoice.store_name = data.get("store_name", "") or ""
        invoice.invoice_number = data.get("invoice_number", "") or ""
        invoice.tax_registration_number = data.get("tax_registration_number", "") or ""
        invoice.invoice_date = parsed_date
        invoice.amount_before_tax = amount_before
        invoice.amount_after_tax = amount_after
        invoice.vat_amount = vat_amount
        invoice.currency = data.get("currency", "AED")
        invoice.category = data.get("category", "Other")
        invoice.items_summary = data.get("items_summary", "") or ""
        
        invoice.ocr_confidence = validation.get("confidence_score", 0)
        invoice.requires_review = (status == "review_required" or status == "mismatch_detected")
        invoice.processing_status = "complete" if status == "success" else status
        
        if status == "success":
            invoice.status = "approved"
        elif status == "review_required" or status == "mismatch_detected":
            invoice.status = "flagged"
        elif status == "rejected":
            invoice.status = "rejected"
        else:
             invoice.status = "pending"
        
        if status == "manual_entry_required":
             invoice.processing_status = "manual_entry_required"
             invoice.status = "pending" # Needs manual intervention

        # Save Audit Log
        audit = OCRAuditLog(
            invoice_id=invoice_id,
            ocr1_result=json.dumps(ocr1, default=str),
            ocr2_result=json.dumps(ocr2, default=str),
            ocr3_result=json.dumps(ocr3, default=str),
            llm_decision=json.dumps({"status": status, "data": data, "validation": validation}, default=str),
            mismatch_fields=", ".join(validation.get("mismatched_fields", [])),
        )
        db.add(audit)
        
        await db.commit()
        logger.info("[Invoice %s] Results saved. Status: %s", invoice_id, status)
