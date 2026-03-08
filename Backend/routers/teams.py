"""Teams router — dynamic user/team management (PostgreSQL)."""

from __future__ import annotations
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, User

router = APIRouter(prefix="/api", tags=["Teams"])


class MemberCreate(BaseModel):
    user_name: str
    team: str
    membership_number: str = ""


# ── Public: get team/member list ──

@router.get("/teams")
async def list_teams(db: AsyncSession = Depends(get_db)):
    """Return all teams and members, grouped by team name."""
    result = await db.execute(select(User).order_by(User.team, User.user_name))
    users = result.scalars().all()

    teams: dict[str, list[str]] = defaultdict(list)
    for u in users:
        teams[u.team].append(u.user_name)

    # Fallback: if DB is empty, return static data
    if not teams:
        import json
        import os
        fallback_path = os.path.join(
            os.path.dirname(os.path.dirname(__file__)),
            "teams.json",
        )
        try:
            with open(fallback_path, "r") as f:
                return json.load(f)
        except Exception:
            return {}

    return dict(teams)


# ── Admin: manage members ──

@router.post("/admin/teams/member")
async def add_member(body: MemberCreate, db: AsyncSession = Depends(get_db)):
    """Add a new team member."""
    # Check for duplicate
    result = await db.execute(
        select(User).where(User.user_name == body.user_name, User.team == body.team)
    )
    if result.scalar_one_or_none():
        raise HTTPException(409, f"Member '{body.user_name}' already exists in team '{body.team}'")

    user = User(
        user_name=body.user_name,
        team=body.team,
        membership_number=body.membership_number,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"success": True, "user_id": user.id, "user_name": user.user_name, "team": user.team}


@router.delete("/admin/teams/member/{user_id}")
async def remove_member(user_id: int, db: AsyncSession = Depends(get_db)):
    """Remove a team member by ID."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, f"User {user_id} not found")

    await db.delete(user)
    await db.commit()
    return {"success": True, "message": f"Removed {user.user_name} from {user.team}"}
