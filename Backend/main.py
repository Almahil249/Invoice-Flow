"""
InvoiceFlow Backend — FastAPI Application Entry Point.

Run with:
    cd invoice-flow-backend
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import create_tables, seed_super_admin
from routers import upload, status, invoices, statistics, auth, teams
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create database tables and seed super admin."""
    await create_tables()
    await seed_super_admin()
    yield


app = FastAPI(
    title="InvoiceFlow API",
    description="Invoice processing system with dual OCR, LLM validation, and PostgreSQL storage.",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS — allow the Vite frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router)
app.include_router(upload.router)
app.include_router(status.router)
app.include_router(invoices.router)
app.include_router(statistics.router)
app.include_router(teams.router)


@app.get("/")
async def root():
    return {
        "service": "InvoiceFlow API",
        "version": "2.0.0",
        "storage": "PostgreSQL (Supabase)",
        "status": "running",
    }


@app.get("/health")
async def health():
    return {"status": "ok"}
