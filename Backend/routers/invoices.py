"""Invoices router — admin CRUD, review, search, and CSV export (PostgreSQL)."""

from __future__ import annotations
import logging
import csv
import io
import os
import uuid
from datetime import datetime, date as date_type
from typing import Optional

# Mime-type lookup from file extension
_MIME_MAP = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".pdf": "application/pdf",
}

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings, HIDDEN_TEAMS
from database import get_db, Invoice, OCRAuditLog
from services import google_drive
from services.llm import suggest_category

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["Admin Invoices"])


@router.post("/upload")
async def upload_receipts(
    user_name: str = Form(...),
    team: str = Form(...),
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload receipt images for OCR processing (no local file saved)."""
    results = []
    for file in files:
        content = await file.read()
        ext = os.path.splitext(file.filename or "file")[1]
        file_name = f"receipt_{uuid.uuid4().hex}{ext}"
        mimetype = _MIME_MAP.get(ext.lower(), "application/octet-stream")

        # Upload directly to Google Drive from memory
        image_url = ""
        try:
            drive_result = google_drive.upload_image(
                image_bytes=content, team=team, member=user_name,
                file_name=file_name, mimetype=mimetype, subfolder="original"
            )
            image_url = drive_result.get("webViewLink", "")
        except Exception as e:
            logger.error("Google Drive upload failed for team=%s user=%s: %s", team, user_name, str(e))

        invoice = Invoice(
            user_name=user_name,
            team=team,
            store_name="Pending OCR",
            entry_method="ocr_auto",
            original_image_url=image_url,
            processing_status="pending",
            status="pending",
        )
        db.add(invoice)
        await db.commit()
        await db.refresh(invoice)
        results.append(invoice.invoice_id)

    return {"success": True, "invoice_ids": results, "count": len(results)}


@router.get("/invoices/{invoice_id}/audit-log")
async def get_audit_log(
    invoice_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve OCR audit log for a specific invoice."""
    result = await db.execute(
        select(OCRAuditLog).where(OCRAuditLog.invoice_id == invoice_id)
    )
    audit = result.scalar_one_or_none()
    if not audit:
        raise HTTPException(404, f"No audit log found for invoice {invoice_id}")

    return {
        "invoice_id": audit.invoice_id,
        "ocr1_result": audit.ocr1_result,
        "ocr2_result": audit.ocr2_result,
        "ocr3_result": audit.ocr3_result,
        "llm_decision": audit.llm_decision,
        "mismatch_fields": audit.mismatch_fields,
        "created_at": audit.created_at.isoformat() if audit.created_at else "",
    }



_SORTABLE_COLUMNS = {
    "invoice_id": Invoice.invoice_id,
    "user_name": Invoice.user_name,
    "team": Invoice.team,
    "store_name": Invoice.store_name,
    "amount_after_tax": Invoice.amount_after_tax,
    "invoice_date": Invoice.invoice_date,
    "status": Invoice.status,
    "created_at": Invoice.created_at,
}


@router.get("/invoices")
async def list_invoices(
    db: AsyncSession = Depends(get_db),
    search: str = "",
    status: Optional[str] = None,
    team: Optional[str] = None,
    category: Optional[str] = None,
    entry_method: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    amount_min: Optional[float] = None,
    amount_max: Optional[float] = None,
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """Retrieve invoices with comprehensive filtering and sorting."""
    query = select(Invoice)

    # Text search
    if search and search.strip():
        s = f"%{search.strip()}%"
        query = query.where(
            or_(
                Invoice.invoice_id.ilike(s),
                Invoice.store_name.ilike(s),
                Invoice.user_name.ilike(s),
                Invoice.invoice_number.ilike(s),
                Invoice.tax_registration_number.ilike(s),
            )
        )

    # Filters
    if status and status.strip() and status.strip() != "all":
        query = query.where(Invoice.status == status.strip())
    if team and team.strip() and team.strip() != "all":
        query = query.where(Invoice.team == team.strip())
    else:
        # Exclude hidden teams from the default invoice list
        query = query.where(Invoice.team.notin_(HIDDEN_TEAMS))
    if category and category.strip() and category.strip() != "all":
        query = query.where(Invoice.category == category.strip())
    if entry_method and entry_method.strip() and entry_method.strip() != "all":
        query = query.where(Invoice.entry_method == entry_method.strip())
    if date_from and date_from.strip():
        try:
            query = query.where(Invoice.invoice_date >= date_type.fromisoformat(date_from.strip()))
        except ValueError:
            pass
    if date_to and date_to.strip():
        try:
            query = query.where(Invoice.invoice_date <= date_type.fromisoformat(date_to.strip()))
        except ValueError:
            pass
    if amount_min is not None:
        query = query.where(Invoice.amount_after_tax >= amount_min)
    if amount_max is not None:
        query = query.where(Invoice.amount_after_tax <= amount_max)

    # Count total
    count_q = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_q)
    total = total_result.scalar() or 0

    # Sorting (whitelist prevents injection)
    sort_col = _SORTABLE_COLUMNS.get(sort_by, Invoice.created_at)
    order = sort_col.asc() if sort_order == "asc" else sort_col.desc()
    query = query.order_by(order)

    # Paginate
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    invoices = result.scalars().all()

    return {
        "invoices": [inv.to_dict() for inv in invoices],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size if total > 0 else 0,
    }


@router.post("/review/{invoice_id}")
async def review_invoice(
    invoice_id: str,
    action: str = Form(...),
    corrected_data: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
):
    """Approve, flag, or reject an invoice."""
    status_map = {"approve": "approved", "flag": "flagged", "reject": "rejected"}
    new_status = status_map.get(action)
    if not new_status:
        raise HTTPException(400, f"Invalid action: {action}")

    result = await db.execute(select(Invoice).where(Invoice.invoice_id == invoice_id))
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(404, f"Invoice {invoice_id} not found")

    invoice.status = new_status

    if corrected_data:
        import json
        try:
            corrections = json.loads(corrected_data)
            for key, value in corrections.items():
                if hasattr(invoice, key):
                    # Ensure invoice_date is a date object
                    if key == "invoice_date" and isinstance(value, str):
                        try:
                            value = date_type.fromisoformat(value)
                        except ValueError:
                            pass
                    setattr(invoice, key, value)
        except json.JSONDecodeError:
            pass

    await db.commit()
    return {"success": True, "invoice_id": invoice_id, "status": new_status}


@router.patch("/invoices/{invoice_id}")
async def update_invoice(
    invoice_id: str,
    updates: dict,
    db: AsyncSession = Depends(get_db),
):
    """Update specific fields of an invoice."""
    result = await db.execute(select(Invoice).where(Invoice.invoice_id == invoice_id))
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(404, f"Invoice {invoice_id} not found")

    for key, value in updates.items():
        if hasattr(invoice, key) and key not in ("id", "invoice_id"):
            # Ensure invoice_date is a date object
            if key == "invoice_date" and isinstance(value, str):
                try:
                    value = date_type.fromisoformat(value)
                except ValueError:
                    # If invalid date format, maybe log or skip? 
                    # For now, let's skip setting it to avoid crashing commit if format is bad,
                    # but if it was valid ISO format it will work.
                    # The error suggests it IS a valid ISO string '2026-02-14', just needs to be object.
                    pass
            setattr(invoice, key, value)

    await db.commit()
    return {"success": True}


@router.delete("/invoices/{invoice_id}")
async def delete_invoice(
    invoice_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete an invoice and its associated audit logs."""
    result = await db.execute(select(Invoice).where(Invoice.invoice_id == invoice_id))
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(404, f"Invoice {invoice_id} not found")

    # Delete from Google Drive if URL exists
    file_url = invoice.original_image_url
    if file_url:
        import re
        # Extract file ID from URL (d/FILE_ID/view or id=FILE_ID)
        file_id = None
        match = re.search(r"/d/([a-zA-Z0-9_-]+)", file_url)
        if match:
            file_id = match.group(1)
        else:
            match = re.search(r"id=([a-zA-Z0-9_-]+)", file_url)
            if match:
                file_id = match.group(1)

        if file_id:
            try:
                # Assuming google_drive is imported from services
                if google_drive.delete_file(file_id):
                    logger.info(f"Deleted Drive file {file_id} for invoice {invoice_id}")
                else:
                    logger.warning(f"Failed to delete Drive file {file_id} for invoice {invoice_id}")
            except Exception as e:
                logger.error(f"Error deleting Drive file {file_id}: {str(e)}")

    # Delete audit logs first (manual cascade if not handled by DB FK)
    await db.execute(
        select(OCRAuditLog).where(OCRAuditLog.invoice_id == invoice_id)
    )
    # The default cascade might not be set up in SQLAlchemy models, so explicit delete is safer or rely on DB
    # Let's just delete the invoice, assuming cascade is set or we don't strictly need to wipe generic logs right now
    # valid approach: delete invoice, if FK constraint fails, we'd need to delete children first.
    # checking models: no explicit cascade relationship defined in python.
    
    # Explicitly delete audit logs to be safe
    from sqlalchemy import delete
    await db.execute(delete(OCRAuditLog).where(OCRAuditLog.invoice_id == invoice_id))
    await db.delete(invoice)
    await db.commit()
    
    return {"success": True, "message": f"Invoice {invoice_id} deleted"}


@router.post("/manual-entry")
async def manual_entry(
    user_name: str = Form(...),
    team: str = Form(...),
    store_name: str = Form(...),
    tax_registration_number: str = Form(""),
    invoice_number: str = Form(...),
    invoice_date: str = Form(...),
    amount_before_tax: float = Form(...),
    amount_after_tax: float = Form(...),
    currency: str = Form("AED"),
    category: str = Form(""),
    items_summary: str = Form(""),
    notes: str = Form(""),
    manual_entry_reason: str = Form(...),
    vat_amount: Optional[float] = Form(None),
    file: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
):
    """Submit a manual entry with optional receipt image."""
    # Validate VAT if provided
    if vat_amount is not None:
        expected_vat = amount_after_tax - amount_before_tax
        if abs(vat_amount - expected_vat) > 0.05:
            raise HTTPException(
                status_code=400,
                detail=f"VAT mismatch: Provided {vat_amount}, expected {expected_vat:.2f} (Total - Net)"
            )
    else:
        vat_amount = amount_after_tax - amount_before_tax

    # Auto-suggest category if not provided
    if not category:
        try:
            category = suggest_category(store_name, items_summary)
        except Exception:
            category = "Other"

    # Upload image to Google Drive directly from memory if provided
    image_url = ""
    if file:
        content = await file.read()
        ext = os.path.splitext(file.filename or "file")[1]
        file_name = f"manual_{uuid.uuid4().hex}{ext}"
        mimetype = _MIME_MAP.get(ext.lower(), "application/octet-stream")
        try:
            drive_result = google_drive.upload_image(
                image_bytes=content, team=team, member=user_name,
                file_name=file_name, mimetype=mimetype, subfolder="original"
            )
            image_url = drive_result.get("webViewLink", "")
        except Exception as e:
            logger.error("Google Drive upload failed (manual entry) for team=%s user=%s: %s", team, user_name, str(e))

    # Parse the date
    parsed_date = None
    try:
        parsed_date = date_type.fromisoformat(invoice_date)
    except ValueError:
        pass

    # Check for duplicates
    from services.validation import check_duplicate
    is_duplicate = False
    duplicate_note = ""
    
    if await check_duplicate(db, invoice_number, parsed_date, amount_after_tax):
        is_duplicate = True
        duplicate_note = "Duplicate: Invoice number, date, and amount match an existing record."

    invoice = Invoice(
        user_name=user_name,
        team=team,
        store_name=store_name,
        invoice_number=invoice_number,
        tax_registration_number=tax_registration_number,
        invoice_date=parsed_date,
        amount_before_tax=amount_before_tax,
        amount_after_tax=amount_after_tax,
        vat_amount=round(vat_amount, 2),
        currency=currency,
        category=category,
        items_summary=items_summary,
        entry_method="manual_entry",
        manual_entry_reason=manual_entry_reason,
        requires_review=False,
        original_image_url=image_url,
        processing_status="complete",
        status="rejected" if is_duplicate else "pending",
        notes=f"{notes}\n{duplicate_note}".strip() if duplicate_note else notes,
    )

    db.add(invoice)
    await db.commit()
    await db.refresh(invoice)

    return {"success": True, "invoice_id": invoice.invoice_id}


@router.get("/export/csv")
async def export_csv(
    db: AsyncSession = Depends(get_db),
    search: Optional[str] = None,
    status: Optional[str] = None,
    team: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    amount_min: Optional[float] = None,
    amount_max: Optional[float] = None,
):
    """Export filtered invoices as CSV with image_link as the last column."""
    query = select(Invoice)

    if search and search.strip():
        s = f"%{search.strip()}%"
        query = query.where(
            or_(
                Invoice.invoice_id.ilike(s),
                Invoice.store_name.ilike(s),
                Invoice.user_name.ilike(s),
                Invoice.invoice_number.ilike(s),
                Invoice.tax_registration_number.ilike(s),
            )
        )

    if status and status.strip() and status.strip() != "all":
        query = query.where(Invoice.status == status.strip())
    if team and team.strip() and team.strip() != "all":
        query = query.where(Invoice.team == team.strip())
    else:
        # Exclude hidden teams from the default CSV export
        query = query.where(Invoice.team.notin_(HIDDEN_TEAMS))
    if date_from and date_from.strip():
        try:
            query = query.where(Invoice.invoice_date >= date_type.fromisoformat(date_from.strip()))
        except ValueError:
            pass
    if date_to and date_to.strip():
        try:
            query = query.where(Invoice.invoice_date <= date_type.fromisoformat(date_to.strip()))
        except ValueError:
            pass
    if amount_min is not None:
        query = query.where(Invoice.amount_after_tax >= amount_min)
    if amount_max is not None:
        query = query.where(Invoice.amount_after_tax <= amount_max)

    query = query.order_by(Invoice.created_at.desc())
    
    # Execute query
    result = await db.execute(query)
    invoices = result.scalars().all()

    if not invoices:
        raise HTTPException(404, "No invoices match the filter")

    # CSV Headers
    csv_columns = [
        "invoice_id", "user_name", "team", "submission_date", "store_name",
        "invoice_number", "tax_registration_number", "invoice_date",
        "amount_before_tax", "amount_after_tax", "vat_amount", "currency",
        "category", "items_summary", "entry_method", "manual_entry_reason",
        "requires_review", "ocr_confidence", "processing_status", "status",
        "notes", "image_link",
    ]

    async def generate_csv():
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=csv_columns, extrasaction="ignore")
        
        # Write header
        writer.writeheader()
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)

        # Write rows
        for inv in invoices:
            row = inv.to_dict()
            # Ensure image_link is populated if keys differ
            if "original_image_url" in row and "image_link" not in row:
                 row["image_link"] = row["original_image_url"]
            
            # Format numbers as Excel-safe text formulas (='1234') to prevent precision loss on very large digits
            if row.get("invoice_number"):
                row["invoice_number"] = f'="{row["invoice_number"]}"'
            if row.get("tax_registration_number"):
                row["tax_registration_number"] = f'="{row["tax_registration_number"]}"'
            
            writer.writerow(row)
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)

    filename = f"invoices_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        generate_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
