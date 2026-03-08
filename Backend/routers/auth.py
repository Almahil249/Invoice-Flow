"""Auth router — login, token verification, admin user management."""

from __future__ import annotations
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, AdminUser
from utils.auth import verify_password, hash_password, create_access_token, decode_access_token

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


# ── Request / Response Models ──

class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    token: str
    user: dict


class CreateAdminRequest(BaseModel):
    email: str
    password: str
    name: str = ""


# ── Helpers ──

async def get_current_user(
    authorization: str = Header(...),
    db: AsyncSession = Depends(get_db),
) -> AdminUser:
    """Extract and verify the current user from the Authorization header."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Invalid authorization header")

    token = authorization.split(" ", 1)[1]
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(401, "Invalid or expired token")

    email = payload.get("sub")
    if not email:
        raise HTTPException(401, "Invalid token payload")

    result = await db.execute(select(AdminUser).where(AdminUser.email == email))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(401, "User not found or inactive")

    return user


# ── Endpoints ──

@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate admin user and return JWT token."""
    result = await db.execute(select(AdminUser).where(AdminUser.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")

    if not user.is_active:
        raise HTTPException(403, "Account is disabled")

    token = create_access_token({"sub": user.email, "role": user.role})

    return LoginResponse(
        token=token,
        user=user.to_dict(),
    )


@router.get("/me")
async def get_me(current_user: AdminUser = Depends(get_current_user)):
    """Get the currently authenticated user's profile."""
    return current_user.to_dict()


@router.post("/create-admin")
async def create_admin(
    body: CreateAdminRequest,
    current_user: AdminUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new admin user. Only super_admin can do this."""
    if current_user.role != "super_admin":
        raise HTTPException(403, "Only super admin can create new admin users")

    # Check if email already exists
    existing = await db.execute(select(AdminUser).where(AdminUser.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(409, "An admin with this email already exists")

    new_admin = AdminUser(
        email=body.email,
        password_hash=hash_password(body.password),
        name=body.name,
        role="admin",
        is_active=True,
    )
    db.add(new_admin)
    await db.commit()
    await db.refresh(new_admin)

    return {"success": True, "admin": new_admin.to_dict()}


@router.get("/admins")
async def list_admins(
    current_user: AdminUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all admin users. Only super_admin can view this."""
    if current_user.role != "super_admin":
        raise HTTPException(403, "Only super admin can list admin users")

    result = await db.execute(select(AdminUser).order_by(AdminUser.created_at.desc()))
    admins = result.scalars().all()
    return {"admins": [a.to_dict() for a in admins]}


@router.delete("/admins/{admin_id}")
async def delete_admin(
    admin_id: int,
    current_user: AdminUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete an admin user. Only super_admin can do this. Cannot delete super_admin."""
    if current_user.role != "super_admin":
        raise HTTPException(403, "Only super admin can delete admin users")

    result = await db.execute(select(AdminUser).where(AdminUser.id == admin_id))
    admin = result.scalar_one_or_none()
    if not admin:
        raise HTTPException(404, "Admin not found")

    if admin.role == "super_admin":
        raise HTTPException(403, "Cannot delete the super admin")

    await db.delete(admin)
    await db.commit()
    return {"success": True}
