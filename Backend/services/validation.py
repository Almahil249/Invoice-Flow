from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from database import Invoice
from typing import Optional
from datetime import date

async def check_duplicate(
    db: AsyncSession,
    invoice_number: str,
    invoice_date: Optional[date],
    amount_after_tax: float,
    current_invoice_id: Optional[str] = None
) -> bool:
    """
    Check if an invoice with the same number, date, and amount exists.
    Returns True if a duplicate is found.
    """
    if not invoice_number or amount_after_tax is None:
        return False

    query = select(Invoice).where(
        and_(
            Invoice.invoice_number == invoice_number,
            Invoice.amount_after_tax == amount_after_tax
        )
    )
    
    if invoice_date:
        query = query.where(Invoice.invoice_date == invoice_date)
        
    if current_invoice_id:
        query = query.where(Invoice.invoice_id != current_invoice_id)
        
    result = await db.execute(query.limit(1))
    existing = result.scalars().first()
    
    return existing is not None
