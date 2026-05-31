from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.dependencies import get_current_user
from app.models import DashboardLayout, User

router = APIRouter()


class DashboardLayoutPayload(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    layout: Dict[str, Any]


class DashboardLayoutResponse(BaseModel):
    id: int
    title: str
    layout: Dict[str, Any]
    created_by: int
    created_at: Optional[str]
    updated_at: Optional[str]


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _role_key(user: User) -> str:
    return (getattr(user, "role", "") or "").strip().lower().replace(" ", "_")


def _serialize_layout(row: DashboardLayout) -> Dict[str, Any]:
    return {
        "id": row.id,
        "title": row.title,
        "layout": row.layout if isinstance(row.layout, dict) else {},
        "created_by": row.created_by,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _can_manage(row: DashboardLayout, user: User) -> bool:
    return row.created_by == user.id or _role_key(user) in {"ceo", "admin"}


@router.get("/", response_model=List[DashboardLayoutResponse])
async def list_dashboard_layouts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(DashboardLayout).filter(DashboardLayout.company_id == current_user.company_id)
    if _role_key(current_user) not in {"ceo", "admin"}:
        query = query.filter(DashboardLayout.created_by == current_user.id)

    rows = query.order_by(DashboardLayout.updated_at.desc()).all()
    return [_serialize_layout(row) for row in rows]


@router.post("/", response_model=DashboardLayoutResponse)
async def create_dashboard_layout(
    payload: DashboardLayoutPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = DashboardLayout(
        company_id=current_user.company_id,
        title=payload.title.strip(),
        layout=payload.layout,
        created_by=current_user.id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _serialize_layout(row)


@router.put("/{layout_id}", response_model=DashboardLayoutResponse)
async def update_dashboard_layout(
    layout_id: int,
    payload: DashboardLayoutPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.query(DashboardLayout).filter(
        DashboardLayout.id == layout_id,
        DashboardLayout.company_id == current_user.company_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Dashboard layout not found")
    if not _can_manage(row, current_user):
        raise HTTPException(status_code=403, detail="You cannot update this dashboard")

    row.title = payload.title.strip()
    row.layout = payload.layout
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _serialize_layout(row)


@router.delete("/{layout_id}")
async def delete_dashboard_layout(
    layout_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.query(DashboardLayout).filter(
        DashboardLayout.id == layout_id,
        DashboardLayout.company_id == current_user.company_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Dashboard layout not found")
    if not _can_manage(row, current_user):
        raise HTTPException(status_code=403, detail="You cannot delete this dashboard")

    db.delete(row)
    db.commit()
    return {"message": "Dashboard deleted", "id": layout_id}
