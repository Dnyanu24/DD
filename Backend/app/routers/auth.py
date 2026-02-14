from datetime import timedelta
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel

from app.database import SessionLocal
from app.models import User, Company, Sector
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
    company_id: int = 1
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

def _normalize_role(role: str) -> str:
    normalized = (role or "").strip().lower().replace("-", "_")
    normalized = normalized.replace(" ", "_")
    return CANONICAL_ROLE_MAP.get(normalized, "")

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

@router.post("/register", response_model=UserResponse)
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

    company = db.query(Company).filter(Company.id == request.company_id).first()
    if not company:
        # Bootstrap a default company for fresh SQLite databases.
        company = Company(name="Default Company", description="Auto-created default company")
        db.add(company)
        db.flush()

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

    # Create new user
    new_user = User(
        username=request.username,
        password_hash=get_password_hash(request.password),
        role=role,
        company_id=company.id,
        sector_id=sector_id
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
        "id": new_user.id,
        "username": new_user.username,
        "role": frontend_role,
        "company_id": new_user.company_id,
        "sector_id": new_user.sector_id
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
