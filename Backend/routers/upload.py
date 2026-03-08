"""Upload router — receipt submission and processing."""

from __future__ import annotations
import os

from fastapi import APIRouter, UploadFile, File, Form, BackgroundTasks, HTTPException

from config import settings
from utils.image import validate_file
from services.processing import process_receipt

router = APIRouter(prefix="/api", tags=["Upload"])


@router.post("/upload-receipts")
async def upload_receipts(
    background_tasks: BackgroundTasks,
    user_name: str = Form(...),
    team: str = Form(...),
    files: list[UploadFile] = File(...),
):
    """
    Upload one or multiple receipt images.

    1. Uploads immediately to Google Drive.
    2. Creates a database record (status: processing).
    3. Triggers background OCR processing.

    Returns invoice IDs for tracking.
    """
    if not files:
        raise HTTPException(400, "No files uploaded")

    if len(files) > 20:
        raise HTTPException(400, "Maximum 20 files per batch")

    results = []
    errors = []

    from services import google_drive
    from database import async_session, Invoice
    import uuid

    for upload in files:
        # Validate file
        content = await upload.read()
        is_valid, error = validate_file(upload.filename or "", len(content))
        if not is_valid:
            errors.append({"file": upload.filename, "error": error})
            continue

        # Get file extension
        file_ext = os.path.splitext(upload.filename or "file")[1]
        file_name = f"invoice_{uuid.uuid4().hex[:8]}{file_ext}" # Generate a temp name or use invoice_id later?
        # Actually better to use a UUID for the filename to avoid collisions before we have the invoice_id?
        # But we want the filename to match the invoice_id.
        # Let's generate a unique ID for the file processing here.
        
        # We can create the Invoice object first to get the ID, but we need the image URL for the Invoice object.
        # But we need the upload to get the URL.
        # So we can generate a UUID, upload, then create Invoice.
        
        temp_id = uuid.uuid4().hex[:8]
        request_file_name = f"invoice_{temp_id}{file_ext}"

        # Upload to Google Drive
        mimetype = upload.content_type or "application/octet-stream"
        
        try:
            drive_result = google_drive.upload_image(
                image_bytes=content,
                team=team,
                member=user_name,
                file_name=request_file_name,
                mimetype=mimetype,
                subfolder="original",
            )
            file_id = drive_result.get("id")
            web_view_link = drive_result.get("webViewLink", "")
            
            if not file_id:
                raise Exception("Failed to get file ID from Drive upload")

        except Exception as e:
            errors.append({"file": upload.filename, "error": f"Drive upload failed: {str(e)}"})
            continue

        # Create DB record
        async with async_session() as db:
            invoice = Invoice(
                user_name=user_name,
                team=team,
                original_image_url=web_view_link,
                processing_status="processing",
                status="pending",
                notes=f"",
                entry_method="ocr_auto"
            )
            db.add(invoice)
            await db.commit()
            await db.refresh(invoice)
            invoice_id = invoice.invoice_id

        # Trigger logic
        background_tasks.add_task(process_receipt, invoice_id, file_id)
        
        results.append({
            "invoice_id": invoice_id,
            "file": upload.filename,
            "status": "processing"
        })

    return {
        "success": len(results) > 0,
        "invoices": results,
        "errors": errors,
        "message": f"{len(results)} receipt(s) uploaded and queued for processing",
    }
