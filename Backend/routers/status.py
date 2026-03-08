"""Status router — poll processing job status."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from database import async_session, Invoice
from sqlalchemy import select

router = APIRouter(prefix="/api", tags=["Status"])


@router.get("/status/{invoice_id}")
async def job_status(invoice_id: str):
    """Check the processing status of a receipt job (Invoice)."""
    async with async_session() as db:
        result = await db.execute(select(Invoice).where(Invoice.invoice_id == invoice_id))
        invoice = result.scalar_one_or_none()
        
    if not invoice:
        raise HTTPException(404, f"Invoice {invoice_id} not found")

    response = {
        "job_id": invoice.invoice_id,
        "status": invoice.processing_status,
        "message": invoice.notes, # Notes often contain error messages or status updates
        "receipt_data": invoice.to_dict(),
    }

    return response
