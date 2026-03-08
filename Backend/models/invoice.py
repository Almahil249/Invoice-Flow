"""Pydantic models for invoices and related entities."""

from __future__ import annotations
from datetime import date, datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class ProcessingStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETE = "complete"
    REVIEW_REQUIRED = "review_required"
    MANUAL_ENTRY_REQUIRED = "manual_entry_required"
    ERROR = "error"


class InvoiceStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    FLAGGED = "flagged"
    REJECTED = "rejected"


class EntryMethod(str, Enum):
    OCR_AUTO = "ocr_auto"
    MANUAL_ENTRY = "manual_entry"


class ManualEntryReason(str, Enum):
    HANDWRITTEN = "Handwritten receipt"
    POOR_QUALITY = "Poor image quality"
    OCR_FAILED = "OCR failed to extract"
    INCOMPLETE = "Incomplete printed details"
    OTHER = "Other"


# ── Request / Response Models ──


class UploadReceiptsRequest(BaseModel):
    user_name: str
    team: str


class UploadReceiptsResponse(BaseModel):
    success: bool
    job_ids: list[str] = []
    message: str = ""


class JobStatusResponse(BaseModel):
    job_id: str
    status: ProcessingStatus
    receipt_data: Optional[InvoiceData] = None
    message: str = ""


class InvoiceData(BaseModel):
    """Standardised extracted invoice data (matches requirements §4.3.4)."""
    store_name: str = ""
    invoice_number: str = ""
    tax_registration_number: str = ""
    invoice_date: Optional[date] = None
    amount_before_tax: float = 0.0
    amount_after_tax: float = 0.0
    vat_amount: float = 0.0
    currency: str = "AED"
    category: str = ""
    items_summary: str = ""


class OCRValidation(BaseModel):
    ocr_match: bool = False
    mismatched_fields: list[str] = []
    confidence_score: float = 0.0


class InvoiceRecord(BaseModel):
    """Full invoice record stored in Google Sheets."""
    invoice_id: str = ""
    user_id: str = ""
    user_name: str = ""
    team: str = ""
    submission_date: Optional[datetime] = None
    store_name: str = ""
    invoice_number: str = ""
    tax_registration_number: str = ""
    invoice_date: Optional[date] = None
    amount_before_tax: float = 0.0
    amount_after_tax: float = 0.0
    vat_amount: float = 0.0
    currency: str = "AED"
    category: str = ""
    items_summary: str = ""
    entry_method: EntryMethod = EntryMethod.OCR_AUTO
    manual_entry_reason: str = ""
    requires_review: bool = False
    ocr_confidence: Optional[float] = None
    original_image_url: str = ""
    highlighted_image_url: str = ""
    processing_status: ProcessingStatus = ProcessingStatus.PENDING
    status: InvoiceStatus = InvoiceStatus.PENDING
    notes: str = ""
    created_timestamp: Optional[datetime] = None


class ManualEntryRequest(BaseModel):
    """Manual entry form submission."""
    user_name: str
    team: str
    store_name: str = Field(..., min_length=2, max_length=100)
    tax_registration_number: str = Field("", max_length=20)
    invoice_number: str = Field(..., min_length=1, max_length=50)
    invoice_date: date
    amount_before_tax: float = Field(..., ge=0)
    amount_after_tax: float = Field(..., ge=0)
    currency: str = "AED"
    category: str = ""
    items_summary: str = ""
    notes: str = Field("", max_length=500)
    manual_entry_reason: ManualEntryReason = ManualEntryReason.OTHER
    manual_entry_reason_other: str = ""


class ReviewAction(str, Enum):
    APPROVE = "approve"
    FLAG = "flag"
    REJECT = "reject"


class ReviewRequest(BaseModel):
    action: ReviewAction
    corrected_data: Optional[dict] = None


class InvoiceFilter(BaseModel):
    """Query parameters for invoice search."""
    search: str = ""
    status: Optional[InvoiceStatus] = None
    team: str = ""
    category: str = ""
    entry_method: Optional[EntryMethod] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    amount_min: Optional[float] = None
    amount_max: Optional[float] = None
    page: int = 1
    page_size: int = 20


# Fix forward reference for JobStatusResponse
JobStatusResponse.model_rebuild()
