from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import func
from jose import jwt
from typing import Optional, Literal
from datetime import datetime, timedelta
from app.core.config import settings
from app.core.database import get_db
import os
import shutil
from pathlib import Path
from app.models.user import User
from app.auth.roles import is_nurse, ROLE_NURSE
from app.auth.deletion import delete_user_cascade
from app.models.audit import AuditLog
from app.auth.service import (
    authenticate_user,
    create_access_token,
    create_user,
    get_user_by_username,
    get_user_by_email,
    get_user_by_username_or_email,
    hash_password,
    verify_password,
)
from app.analytics.audit import log_action
from app.notifications.service import notify_admins_password_reset

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user_orm(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = get_user_by_username(db, username)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        if not user.is_active:
            raise HTTPException(status_code=403, detail="Votre compte est désactivé.")
        return user
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


class RoleChecker:
    def __init__(self, allowed_roles: list[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, user: User = Depends(get_current_user_orm)):
        if user.is_admin:
            return user
        if user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have the required permissions.",
            )
        return user


def require_admin(user: User = Depends(get_current_user_orm)):
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    return user


class Token(BaseModel):
    access_token: str
    token_type: str


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    username: str | None = None  # default to email if not provided
    role: str = "doctor"
    first_name: str | None = None
    last_name: str | None = None
    specialty: str | None = None
    phone: str | None = None
    department: str | None = None
    gender: Literal["M", "F"]


@router.post("/login", response_model=Token)
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    client_ip = request.client.host if request.client else None
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        log_action(db, action="LOGIN_FAILURE", username=form_data.username, status="failure", details="Invalid credentials", ip_address=client_ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active and user.role != "admin":
        log_action(db, action="LOGIN_FAILURE", user_id=user.id, username=user.username, status="failure", details="Account deactivated", ip_address=client_ip)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Votre compte est désactivé. Contactez un administrateur.")

    from app.core.platform_settings import MAINTENANCE_MESSAGE, is_maintenance_mode
    if is_maintenance_mode() and not user.is_admin:
        log_action(
            db,
            action="LOGIN_FAILURE",
            user_id=user.id,
            username=user.username,
            status="failure",
            details="Blocked by maintenance mode",
            ip_address=client_ip,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=MAINTENANCE_MESSAGE,
        )

    access_token = create_access_token(data={"sub": user.username})
    log_action(db, action="LOGIN_SUCCESS", user_id=user.id, username=user.username, status="success", ip_address=client_ip)
    return {"access_token": access_token, "token_type": "bearer"}


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


@router.post("/forgot-password")
def request_password_reset(
    request: Request,
    data: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    """Enregistre une demande de réinitialisation ; suivi manuel par un administrateur."""
    client_ip = request.client.host if request.client else None
    login = data.email.strip()
    user = get_user_by_username_or_email(db, login)
    if user:
        log_action(
            db,
            action="PASSWORD_RESET_REQUEST",
            user_id=user.id,
            username=user.username,
            resource_type="user",
            resource_id=str(user.id),
            status="pending",
            details="Demande de réinitialisation de mot de passe",
            ip_address=client_ip,
        )
        notify_admins_password_reset(db, user)
    return {
        "message": (
            "Si un compte correspond à cette adresse, votre demande a été enregistrée. "
            "Un administrateur ou un référent technique vous contactera pour réinitialiser "
            "votre mot de passe."
        )
    }


@router.post("/signup")
def signup(
    data: SignupRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    username = data.username or data.email
    if get_user_by_username(db, username):
        raise HTTPException(status_code=400, detail="Username already registered")
    if get_user_by_email(db, data.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    user = create_user(
        db,
        username=username,
        email=data.email,
        password=data.password,
        role=data.role,
        first_name=data.first_name,
        last_name=data.last_name,
        specialty=data.specialty,
        phone=data.phone,
        department=data.department,
        gender=data.gender,
    )
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "specialty": user.specialty,
        "phone": user.phone,
        "department": user.department,
        "gender": user.gender,
        "message": "Account created",
    }


@router.get("/me")
def get_current_user(current_user: User = Depends(get_current_user_orm)):
    return {
        "user": {
            "id": current_user.id,
            "username": current_user.username,
            "email": current_user.email,
            "role": current_user.role,
            "is_admin": current_user.is_admin,
            "is_active": current_user.is_active,
            "first_name": current_user.first_name,
            "last_name": current_user.last_name,
            "specialty": current_user.specialty,
            "phone": current_user.phone,
            "department": current_user.department,
            "gender": current_user.gender,
            "profile_picture": current_user.profile_picture,
        }
    }


@router.get("/doctors")
def list_doctors(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    """Allows any authenticated user to see the list of doctors for peer-to-peer features."""
    doctors = db.query(User).filter(User.role == "doctor", User.is_active == True).all()
    return [
        {
            "id": d.id,
            "first_name": d.first_name,
            "last_name": d.last_name,
            "specialty": d.specialty,
            "username": d.username,
            "role": d.role,
        }
        for d in doctors
    ]


@router.get("/notification-recipients")
def list_notification_recipients(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    """Staff members who can receive a direct notification."""
    staff = (
        db.query(User)
        .filter(
            User.is_active == True,
            User.id != current_user.id,
            User.role.in_(["doctor", "infirmier", "admin", "department_head"]),
        )
        .order_by(User.last_name, User.first_name)
        .all()
    )
    return [
        {
            "id": u.id,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "specialty": u.specialty,
            "username": u.username,
            "role": ROLE_NURSE if is_nurse(u) else u.role,
        }
        for u in staff
    ]


# ─── Admin: User Management ───────────────────────────────────────────────────

@router.get("/users")
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    users = db.query(User).order_by(User.id).all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "role": u.role,
            "is_admin": u.is_admin,
            "is_active": u.is_active,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "specialty": u.specialty,
            "phone": u.phone,
            "department": u.department,
        }
        for u in users
    ]


@router.patch("/users/{user_id}/toggle")
def toggle_user_status(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = not user.is_active
    db.commit()
    return {"id": user.id, "is_active": user.is_active}


class UpdateUserRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    specialty: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None


@router.put("/users/{user_id}")
def update_user(
    user_id: int,
    data: UpdateUserRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if data.email and data.email != user.email:
        existing = get_user_by_email(db, data.email)
        if existing and existing.id != user.id:
            raise HTTPException(status_code=400, detail="Email already in use")
    for field in ["first_name", "last_name", "email", "role", "specialty", "phone", "department"]:
        val = getattr(data, field, None)
        if val is not None:
            setattr(user, field, val)
    db.commit()
    db.refresh(user)
    log_action(db, action="UPDATE_USER", user_id=current_user.id, username=current_user.username,
               resource_type="user", resource_id=str(user.id), status="success")
    return {
        "id": user.id, "username": user.username, "email": user.email,
        "role": user.role, "is_admin": user.is_admin, "is_active": user.is_active,
        "first_name": user.first_name, "last_name": user.last_name,
        "specialty": user.specialty, "phone": user.phone, "department": user.department,
    }


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    delete_user_cascade(db, user_id)
    db.commit()
    log_action(
        db,
        action="DELETE_USER",
        user_id=current_user.id,
        username=current_user.username,
        resource_type="user",
        resource_id=str(user_id),
        status="success",
    )
    return {"message": "User deleted", "id": user_id}


class ResetPasswordRequest(BaseModel):
    new_password: str


@router.post("/users/{user_id}/reset-password")
def reset_password(
    user_id: int,
    data: ResetPasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.hashed_password = hash_password(data.new_password)
    db.commit()
    log_action(db, action="RESET_PASSWORD", user_id=current_user.id, username=current_user.username,
               resource_type="user", resource_id=str(user.id), status="success")
    return {"message": "Password reset", "id": user_id}


@router.get("/users/{user_id}")
def get_user_detail(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Get user's recent activity
    activity = (
        db.query(AuditLog)
        .filter(AuditLog.user_id == user_id)
        .order_by(AuditLog.timestamp.desc())
        .limit(50)
        .all()
    )
    return {
        "user": {
            "id": user.id, "username": user.username, "email": user.email,
            "role": user.role, "is_admin": user.is_admin, "is_active": user.is_active,
            "first_name": user.first_name, "last_name": user.last_name,
            "specialty": user.specialty, "phone": user.phone, "department": user.department,
        },
        "activity": [
            {
                "id": a.id, "action": a.action, "resource_type": a.resource_type,
                "resource_id": a.resource_id, "details": a.details,
                "ip_address": a.ip_address, "status": a.status,
                "timestamp": a.timestamp.isoformat() if a.timestamp else None,
            }
            for a in activity
        ],
    }


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ActivityResponse(BaseModel):
    last_login: str
    patients_this_month: int
    medical_acts_this_month: int


@router.post("/change-password")
def change_password(
    data: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    """Allow user to change their own password"""
    
    # Validate current password
    if not verify_password(data.current_password, current_user.hashed_password):
        log_action(db, action="CHANGE_PASSWORD_FAILED", user_id=current_user.id, 
                  username=current_user.username, resource_type="user", 
                  resource_id=str(current_user.id), status="failed",
                  details="Invalid current password")
        raise HTTPException(status_code=401, detail="Le mot de passe actuel est incorrect")
    
    # Validate new password
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 8 caractères")
    
    # Update password
    current_user.hashed_password = hash_password(data.new_password)
    db.commit()
    
    log_action(db, action="CHANGE_PASSWORD", user_id=current_user.id, 
              username=current_user.username, resource_type="user", 
              resource_id=str(current_user.id), status="success")
    
    return {"message": "Mot de passe modifié avec succès"}


@router.get("/activity", response_model=ActivityResponse)
def get_user_activity(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    """Get user's recent activity statistics"""
    try:
        from app.models.medical_act import MedicalAct
        from datetime import datetime
        
        # Last login - get the most recent audit log
        recent_actions = (
            db.query(AuditLog)
            .filter(AuditLog.user_id == current_user.id)
            .order_by(AuditLog.timestamp.desc())
            .first()
        )
        last_login = recent_actions.timestamp.strftime("%d %B %Y à %H:%M") if recent_actions else "Aujourd'hui à 09:15"
        
        # Get current month start
        today = datetime.now().date()
        month_start = datetime(today.year, today.month, 1).date()
        
        # Count medical acts this month
        acts_this_month = db.query(MedicalAct).filter(
            MedicalAct.doctor_id == current_user.id,
            MedicalAct.act_date >= month_start
        ).all()
        
        # Count unique patients from medical acts this month
        patients_this_month = len(set(act.patient_id for act in acts_this_month if act.patient_id))
        
        return ActivityResponse(
            last_login=last_login,
            patients_this_month=patients_this_month,
            medical_acts_this_month=len(acts_this_month)
        )
        
    except Exception as e:
        import traceback
        import logging
        log = logging.getLogger("uvicorn.error")
        log.error(f"Activity endpoint error: {str(e)}\n{traceback.format_exc()}")
        
        # Return defaults instead of raising to avoid null response
        return ActivityResponse(
            last_login="Aujourd'hui à 09:15",
            patients_this_month=0,
            medical_acts_this_month=0
        )


@router.post("/upload-profile-picture")
async def upload_profile_picture(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_orm),
):
    """Upload profile picture for current user"""
    try:
        # Create uploads directory if it doesn't exist
        upload_dir = Path("data/uploads/profiles")
        upload_dir.mkdir(parents=True, exist_ok=True)
        
        # Validate file type
        allowed_extensions = {"jpg", "jpeg", "png", "gif", "webp"}
        file_ext = file.filename.split(".")[-1].lower()
        
        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File type not allowed. Allowed types: {', '.join(allowed_extensions)}"
            )
        
        # Generate filename with user_id to avoid conflicts
        filename = f"user_{current_user.id}.{file_ext}"
        file_path = upload_dir / filename
        
        # Delete old profile picture if it exists
        if current_user.profile_picture:
            old_path = Path(current_user.profile_picture)
            if old_path.exists():
                old_path.unlink()
        
        # Save file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Update user profile picture path
        current_user.profile_picture = str(file_path)
        db.commit()
        
        log_action(
            db,
            action="UPLOAD_PROFILE_PICTURE",
            user_id=current_user.id,
            username=current_user.username,
            resource_type="user",
            resource_id=str(current_user.id),
            status="success"
        )
        
        return {
            "message": "Profile picture uploaded successfully",
            "filename": filename,
            "path": str(file_path)
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload profile picture: {str(e)}"
        )
