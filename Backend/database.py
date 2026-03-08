"""
Database layer — SQLAlchemy models and async session management.

Tables:
  - invoices: Main invoice/receipt records
  - ocr_audit_logs: OCR comparison records
  - users: Team members
  - categories: Invoice categories
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import AsyncGenerator, Optional

from sqlalchemy import (
    Boolean, Column, DateTime, Enum, Float, Integer, String, Text, Date,
    create_engine, func, select,
)
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from config import settings


# ── Async Engine + Session ──

import ssl as _ssl

_ssl_ctx = _ssl.create_default_context()
_ssl_ctx.check_hostname = False
_ssl_ctx.verify_mode = _ssl.CERT_NONE

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
    connect_args={"ssl": _ssl_ctx},
)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: yield an async database session."""
    async with async_session() as session:
        yield session


# ── Base ──

class Base(DeclarativeBase):
    pass


# ── Models ──

def _gen_id() -> str:
    return uuid.uuid4().hex[:8]


class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    invoice_id: Mapped[str] = mapped_column(String(20), unique=True, default=lambda: f"INV-{uuid.uuid4().hex[:6].upper()}")
    user_name: Mapped[str] = mapped_column(String(100), default="")
    team: Mapped[str] = mapped_column(String(100), default="")
    submission_date: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    store_name: Mapped[str] = mapped_column(String(200), default="")
    invoice_number: Mapped[str] = mapped_column(String(100), default="")
    tax_registration_number: Mapped[str] = mapped_column(String(50), default="")
    invoice_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    amount_before_tax: Mapped[float] = mapped_column(Float, default=0.0)
    amount_after_tax: Mapped[float] = mapped_column(Float, default=0.0)
    vat_amount: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(10), default="AED")
    category: Mapped[str] = mapped_column(String(100), default="")
    items_summary: Mapped[str] = mapped_column(Text, default="")
    entry_method: Mapped[str] = mapped_column(String(20), default="ocr_auto")  # ocr_auto | manual_entry
    manual_entry_reason: Mapped[str] = mapped_column(String(200), default="")
    requires_review: Mapped[bool] = mapped_column(Boolean, default=False)
    ocr_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    original_image_url: Mapped[str] = mapped_column(Text, default="")
    highlighted_image_url: Mapped[str] = mapped_column(Text, default="")
    processing_status: Mapped[str] = mapped_column(String(30), default="pending")  # pending | processing | complete | review_required | manual_entry_required | error
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | approved | flagged | rejected
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    def to_dict(self) -> dict:
        return {
            "invoice_id": self.invoice_id,
            "user_name": self.user_name,
            "team": self.team,
            "submission_date": self.submission_date.isoformat() if self.submission_date else "",
            "store_name": self.store_name,
            "invoice_number": self.invoice_number,
            "tax_registration_number": self.tax_registration_number,
            "invoice_date": self.invoice_date.isoformat() if self.invoice_date else "",
            "amount_before_tax": self.amount_before_tax,
            "amount_after_tax": self.amount_after_tax,
            "vat_amount": self.vat_amount,
            "currency": self.currency,
            "category": self.category,
            "items_summary": self.items_summary,
            "entry_method": self.entry_method,
            "manual_entry_reason": self.manual_entry_reason,
            "requires_review": self.requires_review,
            "ocr_confidence": self.ocr_confidence,
            "original_image_url": self.original_image_url,
            "highlighted_image_url": self.highlighted_image_url,
            "processing_status": self.processing_status,
            "status": self.status,
            "notes": self.notes,
            "image_link": self.original_image_url,  # Last column for CSV export
        }


class OCRAuditLog(Base):
    __tablename__ = "ocr_audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    invoice_id: Mapped[str] = mapped_column(String(20), index=True)
    ocr1_result: Mapped[str] = mapped_column(Text, default="")
    ocr2_result: Mapped[str] = mapped_column(Text, default="")
    ocr3_result: Mapped[str] = mapped_column(Text, default="")
    llm_decision: Mapped[str] = mapped_column(Text, default="")
    mismatch_fields: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_name: Mapped[str] = mapped_column(String(100), unique=True)
    team: Mapped[str] = mapped_column(String(100))
    membership_number: Mapped[str] = mapped_column(String(50), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    description: Mapped[str] = mapped_column(Text, default="")
    count: Mapped[int] = mapped_column(Integer, default=0)


class AdminUser(Base):
    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(200), nullable=False)
    name: Mapped[str] = mapped_column(String(100), default="")
    role: Mapped[str] = mapped_column(String(20), default="admin")  # super_admin | admin
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "email": self.email,
            "name": self.name,
            "role": self.role,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else "",
        }


# ── Table creation helper ──

async def create_tables():
    """Create all tables if they don't exist."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def seed_super_admin():
    """Insert the super admin user if not already present."""
    import bcrypt

    async with async_session() as db:
        # Check if ANY super admin exists — .first() safely handles 0, 1, or many rows.
        result = await db.execute(
            select(AdminUser).where(AdminUser.role == "super_admin")
        )
        existing = result.scalars().first()
        
        if existing:
            return  # A super admin already exists, so we don't need to seed.

        # Only seed if NO super admin exists at all.
        # We rely on env vars for the initial seed credentials.
        if not settings.super_admin_email or settings.super_admin_email == "admin@example.com":
            import logging
            logger = logging.getLogger(__name__)
            logger.warning("⚠️ Super admin seeding skipped: No existing super admin found, and SUPER_ADMIN_EMAIL is not set.")
            return

        hashed = bcrypt.hashpw(settings.super_admin_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        super_admin = AdminUser(
            email=settings.super_admin_email,
            password_hash=hashed,
            name=settings.super_admin_name or "Super Admin",
            role="super_admin",
            is_active=True,
        )
        db.add(super_admin)
        await db.commit()
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"✅ Super admin seeded: {settings.super_admin_email}")
