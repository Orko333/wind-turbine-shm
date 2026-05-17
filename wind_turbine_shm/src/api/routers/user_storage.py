"""
Per-user key-value storage endpoint.

Frontend pages (config, admin, reports) previously held their state in
localStorage because they have no dedicated backend tables. This router
gives them a real, persistent home: each authenticated user gets their own
JSON namespace, and any (namespace, key) pair survives across reloads,
devices, and Space restarts (as long as the SQLite DB does).

It's deliberately schemaless — the frontend POSTs whatever JSON object it
wants and reads it back. The backend just owns persistence and ownership.
"""

from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import Column, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Session
from loguru import logger
import json

from ...database.config import get_db, Base, engine
from ...database.models import User
from ..dependencies import get_current_user


router = APIRouter(prefix="/storage", tags=["storage"])


# ---------------------------------------------------------------------------
# Model — created on first import. Adding a new table is safe on SQLite.
# ---------------------------------------------------------------------------

class UserStorage(Base):
    __tablename__ = "user_storage"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), nullable=False, index=True)
    namespace = Column(String(64), nullable=False, index=True)
    key = Column(String(128), nullable=False, index=True)
    value = Column(Text, nullable=False)  # JSON-encoded
    __table_args__ = (UniqueConstraint("user_id", "namespace", "key", name="uq_user_ns_key"),)


try:
    Base.metadata.create_all(bind=engine, tables=[UserStorage.__table_args__[0].table or UserStorage.__table__])  # type: ignore[attr-defined]
except Exception:
    try:
        UserStorage.__table__.create(bind=engine, checkfirst=True)
    except Exception as e:
        logger.warning(f"user_storage table create failed: {e}")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class StorageItem(BaseModel):
    key: str
    value: Any


class StorageWrite(BaseModel):
    value: Any


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/{namespace}")
async def list_namespace(
    namespace: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Return all keys for the current user in this namespace as a flat dict."""
    rows = (
        db.query(UserStorage)
        .filter(UserStorage.user_id == str(current_user.id))
        .filter(UserStorage.namespace == namespace)
        .all()
    )
    out: Dict[str, Any] = {}
    for r in rows:
        try:
            out[r.key] = json.loads(r.value)
        except Exception:
            out[r.key] = None
    return out


@router.get("/{namespace}/{key}")
async def get_item(
    namespace: str,
    key: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    row = (
        db.query(UserStorage)
        .filter(UserStorage.user_id == str(current_user.id))
        .filter(UserStorage.namespace == namespace)
        .filter(UserStorage.key == key)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="key not found")
    try:
        return json.loads(row.value)
    except Exception:
        return None


@router.put("/{namespace}/{key}")
async def set_item(
    namespace: str,
    key: str,
    body: StorageWrite,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    serialized = json.dumps(body.value)
    row = (
        db.query(UserStorage)
        .filter(UserStorage.user_id == str(current_user.id))
        .filter(UserStorage.namespace == namespace)
        .filter(UserStorage.key == key)
        .first()
    )
    if row:
        row.value = serialized
    else:
        row = UserStorage(
            user_id=str(current_user.id),
            namespace=namespace,
            key=key,
            value=serialized,
        )
        db.add(row)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"user_storage write failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    return {"status": "ok"}


@router.delete("/{namespace}/{key}")
async def delete_item(
    namespace: str,
    key: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    row = (
        db.query(UserStorage)
        .filter(UserStorage.user_id == str(current_user.id))
        .filter(UserStorage.namespace == namespace)
        .filter(UserStorage.key == key)
        .first()
    )
    if row:
        db.delete(row)
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))
    return {"status": "ok"}


@router.post("/{namespace}/bulk")
async def bulk_set(
    namespace: str,
    items: List[StorageItem],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, int]:
    written = 0
    for item in items:
        serialized = json.dumps(item.value)
        row = (
            db.query(UserStorage)
            .filter(UserStorage.user_id == str(current_user.id))
            .filter(UserStorage.namespace == namespace)
            .filter(UserStorage.key == item.key)
            .first()
        )
        if row:
            row.value = serialized
        else:
            db.add(UserStorage(
                user_id=str(current_user.id),
                namespace=namespace,
                key=item.key,
                value=serialized,
            ))
        written += 1
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    return {"written": written}
