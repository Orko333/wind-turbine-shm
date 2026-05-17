"""
Admin panel endpoints — real DB-backed user management, audit log, and
fleet-wide system health.

Replaces the in-memory fixture data the frontend was previously using.
Audit log records are written by other routers (auth, settings) through
the `record_audit_event` helper.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import Column, DateTime, Integer, String, Text, Boolean
from sqlalchemy.orm import Session
from loguru import logger

from ...auth.security import hash_password
from ...database.config import Base, engine, get_db
from ...database.models import User
from ..dependencies import get_current_user


router = APIRouter(prefix="/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Tables — created on import
# ---------------------------------------------------------------------------

class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"
    __table_args__ = {"extend_existing": True}
    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    user_id = Column(String(36), nullable=True, index=True)
    user_name = Column(String(255), nullable=True)
    action = Column(String(32), nullable=False, index=True)
    resource = Column(String(255), nullable=True)
    status = Column(String(16), default="success")
    ip_address = Column(String(64), nullable=True)
    details = Column(Text, nullable=True)


class UserProfile(Base):
    """Per-user profile extensions (status, 2FA flag, last_login)."""
    __tablename__ = "user_profile"
    __table_args__ = {"extend_existing": True}
    user_id = Column(String(36), primary_key=True)
    status = Column(String(16), default="active")
    mfa_enabled = Column(Boolean, default=False)
    last_login = Column(DateTime, nullable=True)


for tbl in (AdminAuditLog, UserProfile):
    try:
        tbl.__table__.create(bind=engine, checkfirst=True)
    except Exception as e:
        logger.warning(f"{tbl.__tablename__} create failed: {e}")


# ---------------------------------------------------------------------------
# Helper — call from anywhere in the app
# ---------------------------------------------------------------------------

def record_audit_event(
    db: Session,
    *,
    action: str,
    user_id: Optional[str] = None,
    user_name: Optional[str] = None,
    resource: Optional[str] = None,
    status: str = "success",
    ip_address: Optional[str] = None,
    details: Optional[str] = None,
) -> None:
    """Persist a single audit row. Best-effort — silent on failure."""
    try:
        row = AdminAuditLog(
            action=action,
            user_id=user_id,
            user_name=user_name,
            resource=resource,
            status=status,
            ip_address=ip_address,
            details=details,
        )
        db.add(row)
        db.commit()
    except Exception as e:
        db.rollback()
        logger.warning(f"audit write failed: {e}")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class UserOut(BaseModel):
    id: str
    name: str
    email: str
    role: str
    status: str
    mfa_enabled: bool
    last_login: Optional[str]
    created_at: str


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    role: str = "operator"
    status: str = "active"
    mfa_enabled: bool = False
    password: str = "ChangeMe123!"


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    mfa_enabled: Optional[bool] = None


class AuditLogOut(BaseModel):
    id: int
    timestamp: str
    user_id: Optional[str]
    user_name: Optional[str]
    action: str
    resource: Optional[str]
    status: str
    ip_address: Optional[str]
    details: Optional[str]


# ---------------------------------------------------------------------------
# Authorization helper
# ---------------------------------------------------------------------------

def _ensure_admin(user: User):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")


def _user_to_out(u: User, profile: Optional[UserProfile]) -> UserOut:
    return UserOut(
        id=str(u.id),
        name=u.username or u.email,
        email=u.email,
        role=u.role or "engineer",
        status=(profile.status if profile else "active"),
        mfa_enabled=(profile.mfa_enabled if profile else False),
        last_login=(profile.last_login.isoformat() if profile and profile.last_login else None),
        created_at=u.created_at.isoformat() if u.created_at else "",
    )


# ---------------------------------------------------------------------------
# /admin/users — CRUD
# ---------------------------------------------------------------------------

@router.get("/users", response_model=List[UserOut])
async def list_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[UserOut]:
    _ensure_admin(current_user)
    users = db.query(User).order_by(User.created_at.asc()).all()
    profiles: Dict[str, UserProfile] = {
        p.user_id: p
        for p in db.query(UserProfile).filter(UserProfile.user_id.in_([str(u.id) for u in users])).all()
    }
    return [_user_to_out(u, profiles.get(str(u.id))) for u in users]


@router.post("/users", response_model=UserOut, status_code=201)
async def create_user(
    body: UserCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    _ensure_admin(current_user)
    existing = db.query(User).filter((User.email == body.email) | (User.username == body.name)).first()
    if existing:
        raise HTTPException(status_code=409, detail="User with this email or name already exists")
    u = User(
        username=body.name,
        email=body.email,
        hashed_password=hash_password(body.password),
        role=body.role,
    )
    db.add(u)
    db.flush()
    p = UserProfile(user_id=str(u.id), status=body.status, mfa_enabled=body.mfa_enabled)
    db.add(p)
    record_audit_event(
        db, action="CREATE", user_id=str(current_user.id),
        user_name=current_user.username, resource=f"user:{u.email}",
    )
    db.commit()
    return _user_to_out(u, p)


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: str,
    body: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    _ensure_admin(current_user)
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if body.name is not None:
        u.username = body.name
    if body.role is not None:
        u.role = body.role
    p = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if not p:
        p = UserProfile(user_id=user_id)
        db.add(p)
    if body.status is not None:
        p.status = body.status
    if body.mfa_enabled is not None:
        p.mfa_enabled = body.mfa_enabled
    record_audit_event(
        db, action="EDIT", user_id=str(current_user.id),
        user_name=current_user.username, resource=f"user:{u.email}",
    )
    db.commit()
    return _user_to_out(u, p)


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    _ensure_admin(current_user)
    if str(current_user.id) == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    email_snapshot = u.email
    db.query(UserProfile).filter(UserProfile.user_id == user_id).delete()
    db.delete(u)
    record_audit_event(
        db, action="DELETE", user_id=str(current_user.id),
        user_name=current_user.username, resource=f"user:{email_snapshot}",
    )
    db.commit()
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# /admin/audit-logs
# ---------------------------------------------------------------------------

@router.get("/audit-logs", response_model=List[AuditLogOut])
async def list_audit_logs(
    action: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 200,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[AuditLogOut]:
    _ensure_admin(current_user)
    q = db.query(AdminAuditLog).order_by(AdminAuditLog.timestamp.desc())
    if action:
        q = q.filter(AdminAuditLog.action == action)
    if status:
        q = q.filter(AdminAuditLog.status == status)
    rows = q.limit(min(1000, max(1, limit))).all()
    return [
        AuditLogOut(
            id=r.id,
            timestamp=r.timestamp.isoformat() if r.timestamp else "",
            user_id=r.user_id,
            user_name=r.user_name,
            action=r.action,
            resource=r.resource,
            status=r.status,
            ip_address=r.ip_address,
            details=r.details,
        )
        for r in rows
    ]


# ---------------------------------------------------------------------------
# /admin/health — fleet-wide system health (real signal)
# ---------------------------------------------------------------------------

@router.get("/health")
async def admin_health(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    _ensure_admin(current_user)

    users_total = db.query(User).count()
    audit_count = db.query(AdminAuditLog).count()

    return {
        "api_status": "ok",
        "db_status": "ok",
        "users_total": users_total,
        "audit_records": audit_count,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
