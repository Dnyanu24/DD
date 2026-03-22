from datetime import timedelta
import logging
import re
import hashlib
import secrets
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from fastapi.responses import FileResponse
from pydantic import BaseModel
from datetime import datetime
from pathlib import Path

from app.models import User, Company, Sector, CompanyJoinRequest, UserProfile, PasswordResetToken
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
PASSWORD_RESET_TOKEN_MINUTES = 30
PASSWORD_RESET_TOKEN_BYTES = 32


def _hash_reset_token(token: str) -> str:
    return hashlib.sha256((token or "").encode("utf-8")).hexdigest()

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
    display_name: str | None = None
    avatar_filename: str | None = None

    class Config:
        from_attributes = True


class CompanyUserResponse(BaseModel):
    id: int
    username: str
    role: str
    role_key: str
    company_id: int
    sector_id: int | None = None
    sector_name: str | None = None
    display_name: str | None = None
    email: str | None = None
    avatar_filename: str | None = None
    created_at: str | None = None


class CompanyUserUpdateRequest(BaseModel):
    role: str
    sector_id: int | None = None

class RegisterRequest(BaseModel):
    username: str
    password: str
    role: str
    company_id: str | None = None
    sector_id: int | None = None


class RegisterResponse(BaseModel):
    status: str
    message: str
    user: UserResponse | None = None
    request_id: int | None = None


class JoinRequestReviewRequest(BaseModel):
    action: str  # approve | reject
    sector_id: int | None = None


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = None
    email: str | None = None
    bio: str | None = None


class ForgotPasswordRequest(BaseModel):
    username_or_email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

# Role mapping from backend to frontend
ROLE_MAPPING = {
    'ceo': 'CEO',
    'admin': 'Admin',
    'data_analyst': 'Data Analyst',
    'sales_manager': 'Sales Manager',
    'sector_head': 'Sector Head',
    'student': 'Student',
    'individual': 'Individual',
}

# Frontend role to backend role mapping
FRONTEND_ROLE_MAPPING = {
    'CEO': ['ceo'],
    'Data Analyst': ['data_analyst'],
    'Sales Manager': ['sales_manager'],
    'Sector Head': ['sector_head'],
    'Admin': ['admin'],
}

CANONICAL_ROLE_MAP = {
    "ceo": "ceo",
    "admin": "admin",
    "data_analyst": "data_analyst",
    "sales_manager": "sales_manager",
    "sector_head": "sector_head",
    "student": "student",
    "individual": "individual",
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


def _to_backend_role(role_value: str) -> str:
    """
    Accepts frontend role labels ("CEO", "Data Analyst") or backend keys ("ceo", "data_analyst").
    """
    normalized = (role_value or "").strip()
    if not normalized:
        return ""
    # Try direct canonicalization first.
    backend = _normalize_role(normalized)
    if backend:
        return backend
    # Fallback: map common frontend labels.
    for backend_key, frontend_label in ROLE_MAPPING.items():
        if str(frontend_label).lower() == normalized.lower():
            return backend_key
    return ""

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
    
    profile = db.query(UserProfile).filter(UserProfile.user_id == user.id).first()

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "role": frontend_role,
            "company_id": user.company_id,
            "sector_id": user.sector_id,
            "display_name": profile.display_name if profile else None,
            "avatar_filename": profile.avatar_filename if profile else None,
        }
    }

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get current authenticated user"""
    frontend_role = ROLE_MAPPING.get(current_user.role, current_user.role)
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    
    return {
        "id": current_user.id,
        "username": current_user.username,
        "role": frontend_role,
        "company_id": current_user.company_id,
        "sector_id": current_user.sector_id,
        "display_name": profile.display_name if profile else None,
        "avatar_filename": profile.avatar_filename if profile else None,
    }


@router.get("/profile")
def get_profile(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    return {
        "user_id": current_user.id,
        "username": current_user.username,
        "display_name": profile.display_name if profile else None,
        "email": profile.email if profile else None,
        "bio": profile.bio if profile else None,
        "avatar_filename": profile.avatar_filename if profile else None,
    }


@router.put("/profile")
def update_profile(
    payload: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if not profile:
        profile = UserProfile(user_id=current_user.id)
        db.add(profile)
        db.flush()

    if payload.display_name is not None:
        profile.display_name = payload.display_name.strip() or None
    if payload.email is not None:
        profile.email = payload.email.strip() or None
    if payload.bio is not None:
        profile.bio = payload.bio.strip() or None
    profile.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(profile)
    return {"message": "Profile updated"}


@router.post("/profile/avatar")
def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    content_type = (file.content_type or "").lower()
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported")

    uploads_root = Path(__file__).resolve().parents[1] / "uploads" / "avatars"
    uploads_root.mkdir(parents=True, exist_ok=True)
    suffix = Path(file.filename or "").suffix or ".png"
    safe_name = f"user_{current_user.id}_{int(datetime.utcnow().timestamp())}{suffix}"
    dest = uploads_root / safe_name

    with dest.open("wb") as out:
        out.write(file.file.read())

    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if not profile:
        profile = UserProfile(user_id=current_user.id)
        db.add(profile)
        db.flush()
    profile.avatar_filename = safe_name
    profile.updated_at = datetime.utcnow()
    db.commit()

    return {"message": "Avatar uploaded", "avatar_filename": safe_name}


@router.get("/profile/avatar/{avatar_filename}")
def get_avatar(avatar_filename: str):
    uploads_root = Path(__file__).resolve().parents[1] / "uploads" / "avatars"
    path = (uploads_root / avatar_filename).resolve()
    if not str(path).startswith(str(uploads_root.resolve())):
        raise HTTPException(status_code=400, detail="Invalid avatar path")
    if not path.exists():
        raise HTTPException(status_code=404, detail="Avatar not found")
    return FileResponse(str(path))


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """
    Generate a password reset token.

    This project currently doesn't send emails. For now, the token is returned in the response
    so the frontend can complete the reset flow.
    """
    identifier = (payload.username_or_email or "").strip()
    if not identifier:
        raise HTTPException(status_code=400, detail="username_or_email is required")

    user = db.query(User).filter(User.username == identifier).first()
    if not user:
        # Try email from profile
        profile = db.query(UserProfile).filter(UserProfile.email == identifier).first()
        if profile:
            user = db.query(User).filter(User.id == profile.user_id).first()

    # Always return a generic response to avoid user enumeration.
    if not user:
        return {"message": "If the account exists, a reset token was generated."}

    raw_token = secrets.token_urlsafe(PASSWORD_RESET_TOKEN_BYTES)
    token_hash = _hash_reset_token(raw_token)
    expires_at = datetime.utcnow() + timedelta(minutes=PASSWORD_RESET_TOKEN_MINUTES)

    row = PasswordResetToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
        used_at=None,
    )
    db.add(row)
    db.commit()

    return {
        "message": "If the account exists, a reset token was generated.",
        "reset_token": raw_token,
        "expires_in_minutes": PASSWORD_RESET_TOKEN_MINUTES,
    }


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    token = (payload.token or "").strip()
    new_password = (payload.new_password or "").strip()

    if not token or not new_password:
        raise HTTPException(status_code=400, detail="token and new_password are required")
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    token_hash = _hash_reset_token(token)
    now = datetime.utcnow()

    row = (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
        )
        .order_by(PasswordResetToken.created_at.desc())
        .first()
    )

    if not row or not row.expires_at or row.expires_at < now:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    user = db.query(User).filter(User.id == row.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid reset token")

    user.password_hash = get_password_hash(new_password)
    row.used_at = now
    db.commit()

    return {"message": "Password updated successfully"}

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

    company_id = None
    if role not in ["student", "individual"]:
        company_id = _parse_company_code(request.company_id or "")

    company = None
    if role in ["student", "individual"]:
        company = Company(
            name=f"personal_{request.username}",
            description="Personal workspace",
        )
        db.add(company)
        db.flush()
    else:
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

    if role in ["student", "individual"]:
        new_user = User(
            username=request.username,
            password_hash=get_password_hash(request.password),
            role=role,
            company_id=company.id,
            sector_id=None,
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
            "message": "Account created successfully.",
            "user": {
                "id": new_user.id,
                "username": new_user.username,
                "role": frontend_role,
                "company_id": new_user.company_id,
                "sector_id": new_user.sector_id
            },
            "request_id": None
        }

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
        {"value": "Student", "label": "Student"},
        {"value": "Individual", "label": "Individual"},
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


@router.get("/company/users", response_model=List[CompanyUserResponse])
def list_company_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in ["ceo", "admin"]:
        raise HTTPException(status_code=403, detail="Only CEO/Admin can view users")

    users = (
        db.query(User)
        .filter(User.company_id == current_user.company_id)
        .order_by(User.created_at.desc())
        .all()
    )

    sector_ids = sorted({u.sector_id for u in users if u.sector_id is not None})
    sector_map = {}
    if sector_ids:
        sector_map = {s.id: s.name for s in db.query(Sector).filter(Sector.id.in_(sector_ids)).all()}

    profile_map = {
        p.user_id: p
        for p in db.query(UserProfile).filter(UserProfile.user_id.in_([u.id for u in users])).all()
    } if users else {}

    out: List[CompanyUserResponse] = []
    for u in users:
        frontend_role = ROLE_MAPPING.get(u.role, u.role)
        profile = profile_map.get(u.id)
        out.append(
            {
                "id": u.id,
                "username": u.username,
                "role": frontend_role,
                "role_key": u.role,
                "company_id": u.company_id,
                "sector_id": u.sector_id,
                "sector_name": sector_map.get(u.sector_id) if u.sector_id is not None else None,
                "display_name": profile.display_name if profile else None,
                "email": profile.email if profile else None,
                "avatar_filename": profile.avatar_filename if profile else None,
                "created_at": u.created_at.isoformat() if getattr(u, "created_at", None) else None,
            }
        )
    return out


@router.patch("/company/users/{user_id}", response_model=CompanyUserResponse)
def update_company_user(
    user_id: int,
    payload: CompanyUserUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in ["ceo", "admin"]:
        raise HTTPException(status_code=403, detail="Only CEO/Admin can update users")

    user = db.query(User).filter(User.id == int(user_id), User.company_id == current_user.company_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    backend_role = _to_backend_role(payload.role)
    if not backend_role:
        raise HTTPException(status_code=400, detail="Invalid role")

    sector_id = payload.sector_id
    if backend_role == "sector_head":
        if sector_id is None:
            raise HTTPException(status_code=400, detail="Sector Head requires sector_id")
        sector = db.query(Sector).filter(Sector.id == int(sector_id), Sector.company_id == current_user.company_id).first()
        if not sector:
            raise HTTPException(status_code=400, detail="Invalid sector_id for this company")
        user.sector_id = int(sector_id)
    else:
        user.sector_id = None

    # Prevent having multiple CEO/admin accounts if that's your intended policy.
    if backend_role in ["ceo", "admin"] and user.role not in ["ceo", "admin"]:
        existing = db.query(User).filter(
            User.company_id == current_user.company_id,
            User.role.in_(["ceo", "admin"]),
            User.id != user.id,
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="A CEO/Admin already exists for this company")

    user.role = backend_role
    db.commit()
    db.refresh(user)

    profile = db.query(UserProfile).filter(UserProfile.user_id == user.id).first()
    sector_name = None
    if user.sector_id is not None:
        sector = db.query(Sector).filter(Sector.id == user.sector_id).first()
        sector_name = sector.name if sector else None
    return {
        "id": user.id,
        "username": user.username,
        "role": ROLE_MAPPING.get(user.role, user.role),
        "role_key": user.role,
        "company_id": user.company_id,
        "sector_id": user.sector_id,
        "sector_name": sector_name,
        "display_name": profile.display_name if profile else None,
        "email": profile.email if profile else None,
        "avatar_filename": profile.avatar_filename if profile else None,
        "created_at": user.created_at.isoformat() if getattr(user, "created_at", None) else None,
    }
