from datetime import timedelta
import logging
import re
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel
from datetime import datetime

from app.models import User, Company, Sector, CompanyJoinRequest
from app.dependencies import (
    authenticate_user,
    create_access_token,
    verify_password,
    get_password_hash,
    security,
    get_current_user,
    get_db
)


# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Pydantic models for request/response
class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    user: dict

class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    company_id: int
    sector_id: int | None = None

    class Config:
        from_attributes = True

class RegisterRequest(BaseModel):
    username: str
    password: str
    role: str
    company_id: str
    sector_id: int | None = None


class RegisterResponse(BaseModel):
    status: str
    message: str
    user: UserResponse | None = None
    request_id: int | None = None


class JoinRequestReviewRequest(BaseModel):
    action: str  # approve | reject
    sector_id: int | None = None

# Role mapping from backend to frontend
ROLE_MAPPING = {
    'ceo': 'CEO',
    'admin': 'CEO',
    'data_analyst': 'Data Analyst',
    'sales_manager': 'Sales Manager',
    'sector_head': 'Sector Head',
}

# Frontend role to backend role mapping
FRONTEND_ROLE_MAPPING = {
    'CEO': ['ceo', 'admin'],
    'Data Analyst': ['data_analyst'],
    'Sales Manager': ['sales_manager'],
    'Sector Head': ['sector_head'],
}

CANONICAL_ROLE_MAP = {
    "ceo": "ceo",
    "admin": "admin",
    "data_analyst": "data_analyst",
    "sales_manager": "sales_manager",
    "sector_head": "sector_head",
    "data analyst": "data_analyst",
    "sales manager": "sales_manager",
    "sector head": "sector_head",
}

COMPANY_CODE_PATTERN = re.compile(r"^company_(\d+)$", re.IGNORECASE)

def _normalize_role(role: str) -> str:
    normalized = (role or "").strip().lower().replace("-", "_")
    normalized = normalized.replace(" ", "_")
    return CANONICAL_ROLE_MAP.get(normalized, "")


def _parse_company_code(company_code: str) -> int:
    value = (company_code or "").strip()
    match = COMPANY_CODE_PATTERN.match(value)
    if not match:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid company_id format. Use pattern like company_01"
        )
    return int(match.group(1))

@router.post("/login", response_model=LoginResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):

    """Authenticate user and return JWT token"""
    logger.info(f"Login attempt for username: {request.username}")
    user = authenticate_user(db, request.username, request.password)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Map backend role to frontend role
    frontend_role = ROLE_MAPPING.get(user.role, user.role)
    
    # Create access token
    access_token_expires = timedelta(minutes=30)
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role},
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "role": frontend_role,
            "company_id": user.company_id,
            "sector_id": user.sector_id
        }
    }

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user"""
    frontend_role = ROLE_MAPPING.get(current_user.role, current_user.role)
    
    return {
        "id": current_user.id,
        "username": current_user.username,
        "role": frontend_role,
        "company_id": current_user.company_id,
        "sector_id": current_user.sector_id
    }

@router.post("/register", response_model=RegisterResponse)
def register(request: RegisterRequest, db: Session = Depends(get_db)):

    """Register a new user"""
    logger.info(f"Register request received: username={request.username}, role={request.role}, company_id={request.company_id}")
    
    # Check if user already exists
    existing_user = db.query(User).filter(User.username == request.username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists"
        )
    
    role = _normalize_role(request.role)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid role"
        )

    company_id = _parse_company_code(request.company_id)

    company = db.query(Company).filter(Company.id == company_id).first()
    if not company and role in ["ceo", "admin"]:
        company = Company(
            id=company_id,
            name=request.company_id,
            description="Created during CEO registration"
        )
        db.add(company)
        db.flush()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid company_id. Company not found."
        )

    sector_id = request.sector_id
    if role == "sector_head":
        if sector_id is None:
            sector = db.query(Sector).filter(Sector.company_id == company.id).first()
            if sector:
                sector_id = sector.id
    else:
        sector_id = None

    if sector_id is not None:
        sector_exists = db.query(Sector).filter(Sector.id == sector_id).first()
        if not sector_exists:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid sector_id"
            )

    if role in ["ceo", "admin"]:
        existing_company_ceo = db.query(User).filter(
            User.company_id == company.id,
            User.role.in_(["ceo", "admin"])
        ).first()
        if existing_company_ceo:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="CEO already exists for this company. Register as another role and request approval."
            )

        new_user = User(
            username=request.username,
            password_hash=get_password_hash(request.password),
            role=role,
            company_id=company.id,
            sector_id=None
        )
        try:
            db.add(new_user)
            db.commit()
            db.refresh(new_user)
        except IntegrityError:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Registration failed due to database constraints"
            )

        frontend_role = ROLE_MAPPING.get(new_user.role, new_user.role)
        return {
            "status": "approved",
            "message": "CEO account created successfully.",
            "user": {
                "id": new_user.id,
                "username": new_user.username,
                "role": frontend_role,
                "company_id": new_user.company_id,
                "sector_id": new_user.sector_id
            },
            "request_id": None
        }

    pending = db.query(CompanyJoinRequest).filter(
        CompanyJoinRequest.username == request.username,
        CompanyJoinRequest.status == "pending"
    ).first()
    if pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A pending join request already exists for this username."
        )

    join_request = CompanyJoinRequest(
        username=request.username,
        password_hash=get_password_hash(request.password),
        requested_role=role,
        company_id=company.id,
        sector_id=sector_id,
        status="pending"
    )
    db.add(join_request)
    db.commit()
    db.refresh(join_request)

    return {
        "status": "pending",
        "message": "Join request submitted. Wait for CEO approval.",
        "user": None,
        "request_id": join_request.id
    }

@router.get("/roles")
def get_roles():
    """Get available roles for frontend"""
    return [
        {"value": "CEO", "label": "CEO"},
        {"value": "Data Analyst", "label": "Data Analyst"},
        {"value": "Sales Manager", "label": "Sales Manager"},
        {"value": "Sector Head", "label": "Sector Head"},
    ]


@router.get("/join-requests")
def get_join_requests(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role not in ["ceo", "admin"]:
        raise HTTPException(status_code=403, detail="Only CEO/Admin can view join requests")

    rows = db.query(CompanyJoinRequest).filter(
        CompanyJoinRequest.company_id == current_user.company_id
    ).order_by(CompanyJoinRequest.created_at.desc()).all()

    return [
        {
            "id": row.id,
            "username": row.username,
            "requested_role": ROLE_MAPPING.get(row.requested_role, row.requested_role),
            "requested_role_key": row.requested_role,
            "company_id": row.company_id,
            "sector_id": row.sector_id,
            "status": row.status,
            "reviewed_by": row.reviewed_by,
            "reviewed_at": row.reviewed_at.isoformat() if row.reviewed_at else None,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]


@router.post("/join-requests/{request_id}/review")
def review_join_request(
    request_id: int,
    review: JoinRequestReviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role not in ["ceo", "admin"]:
        raise HTTPException(status_code=403, detail="Only CEO/Admin can review join requests")

    join_request = db.query(CompanyJoinRequest).filter(
        CompanyJoinRequest.id == request_id,
        CompanyJoinRequest.company_id == current_user.company_id
    ).first()
    if not join_request:
        raise HTTPException(status_code=404, detail="Join request not found")
    if join_request.status != "pending":
        raise HTTPException(status_code=400, detail="Join request already reviewed")

    action = (review.action or "").strip().lower()
    if action not in ["approve", "reject"]:
        raise HTTPException(status_code=400, detail="Invalid action. Use approve or reject.")

    if action == "reject":
        join_request.status = "rejected"
        join_request.reviewed_by = current_user.id
        join_request.reviewed_at = datetime.utcnow()
        db.commit()
        return {"status": "rejected", "message": "Join request rejected."}

    existing_user = db.query(User).filter(User.username == join_request.username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists. Cannot approve this request.")

    final_sector_id = review.sector_id if review.sector_id is not None else join_request.sector_id
    if join_request.requested_role == "sector_head":
        if final_sector_id is None:
            raise HTTPException(status_code=400, detail="Sector Head approval requires sector_id")
        sector = db.query(Sector).filter(
            Sector.id == final_sector_id,
            Sector.company_id == current_user.company_id
        ).first()
        if not sector:
            raise HTTPException(status_code=400, detail="Invalid sector_id for this company")
    else:
        final_sector_id = None

    new_user = User(
        username=join_request.username,
        password_hash=join_request.password_hash,
        role=join_request.requested_role,
        company_id=join_request.company_id,
        sector_id=final_sector_id
    )
    db.add(new_user)
    db.flush()

    join_request.status = "approved"
    join_request.sector_id = final_sector_id
    join_request.reviewed_by = current_user.id
    join_request.reviewed_at = datetime.utcnow()
    db.commit()

    return {"status": "approved", "message": "Join request approved and user created."}
