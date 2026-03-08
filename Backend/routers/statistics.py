"""Statistics router — dashboard metrics and analytics (PostgreSQL)."""

from __future__ import annotations
from collections import Counter
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, Invoice
from config import HIDDEN_TEAMS

router = APIRouter(prefix="/api/admin", tags=["Admin Statistics"])


@router.get("/statistics")
async def get_statistics(
    db: AsyncSession = Depends(get_db),
    team: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    """Compute dashboard statistics from PostgreSQL data."""
    # Base query
    query = select(Invoice)
    if team:
        query = query.where(Invoice.team == team)
    else:
        # Exclude hidden teams from aggregate statistics
        query = query.where(Invoice.team.notin_(HIDDEN_TEAMS))
    if date_from:
        query = query.where(Invoice.invoice_date >= date_from)
    if date_to:
        query = query.where(Invoice.invoice_date <= date_to)

    result = await db.execute(query)
    all_invoices = result.scalars().all()

    # ── Compute metrics ──
    total_invoices = len(all_invoices)
    total_amount = sum(inv.amount_after_tax or 0 for inv in all_invoices)
    pending_review = sum(1 for inv in all_invoices if inv.status == "pending")
    flagged = sum(1 for inv in all_invoices if inv.status == "flagged")
    approved = sum(1 for inv in all_invoices if inv.status == "approved")
    manual_entries = sum(1 for inv in all_invoices if inv.entry_method == "manual_entry")
    ocr_auto = sum(1 for inv in all_invoices if inv.entry_method == "ocr_auto")

    # OCR accuracy: % of OCR-processed receipts that didn't need review
    ocr_processed = [inv for inv in all_invoices if inv.entry_method == "ocr_auto"]
    ocr_no_review = sum(1 for inv in ocr_processed if not inv.requires_review)
    ocr_accuracy = (ocr_no_review / len(ocr_processed) * 100) if ocr_processed else 0

    # Category breakdown
    cat_counter: Counter = Counter()
    cat_amount: dict[str, float] = {}
    for inv in all_invoices:
        cat = inv.category or "Other"
        cat_counter[cat] += 1
        cat_amount[cat] = cat_amount.get(cat, 0) + (inv.amount_after_tax or 0)

    category_breakdown = [
        {"category": cat, "count": cat_counter[cat], "amount": round(cat_amount[cat], 2)}
        for cat in cat_counter
    ]

    # Team performance
    team_data: dict[str, dict] = {}
    for inv in all_invoices:
        t = inv.team or "Unknown"
        if t not in team_data:
            team_data[t] = {"team": t, "invoices": 0, "amount": 0.0}
        team_data[t]["invoices"] += 1
        team_data[t]["amount"] += inv.amount_after_tax or 0

    team_performance = list(team_data.values())

    # Monthly trend
    month_data: dict[str, dict] = {}
    for inv in all_invoices:
        if inv.invoice_date:
            month = inv.invoice_date.strftime("%Y-%m")
            if month not in month_data:
                month_data[month] = {"month": month, "invoices": 0, "amount": 0.0}
            month_data[month]["invoices"] += 1
            month_data[month]["amount"] += inv.amount_after_tax or 0

    monthly_trend = sorted(month_data.values(), key=lambda x: x["month"])

    # Manual entry reasons
    reason_counter: Counter = Counter()
    for inv in all_invoices:
        if inv.entry_method == "manual_entry":
            reason = inv.manual_entry_reason or "Unknown"
            reason_counter[reason] += 1

    manual_entry_reasons = [
        {"reason": r, "count": c} for r, c in reason_counter.most_common()
    ]

    return {
        "totalInvoices": total_invoices,
        "totalAmount": round(total_amount, 2),
        "pendingReview": pending_review,
        "flaggedInvoices": flagged,
        "approvedThisMonth": approved,
        "manualEntries": manual_entries,
        "ocrAutoEntries": ocr_auto,
        "ocrAccuracy": round(ocr_accuracy, 1),
        "categoryBreakdown": category_breakdown,
        "teamPerformance": team_performance,
        "monthlyTrend": monthly_trend,
        "manualEntryReasons": manual_entry_reasons,
    }
