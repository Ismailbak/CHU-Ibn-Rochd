from datetime import datetime, timedelta
from jose import jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.user import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_user_by_username(db: Session, username: str):
    return db.query(User).filter(User.username == username).first()


def get_user_by_email(db: Session, email: str):
    return db.query(User).filter(User.email == email).first()


def get_user_by_username_or_email(db: Session, login: str):
    """Login can be username or email."""
    user = get_user_by_username(db, login)
    if user:
        return user
    return get_user_by_email(db, login)


def authenticate_user(db: Session, username: str, password: str):
    user = get_user_by_username_or_email(db, username)
    if user and verify_password(password, user.hashed_password):
        return user
    return None


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_user(
    db: Session,
    username: str,
    email: str,
    password: str,
    role: str = "doctor",
    is_admin: bool = False,
    first_name: str = None,
    last_name: str = None,
    specialty: str = None,
    phone: str = None,
    department: str = None,
    gender: str = None,
):
    hashed = hash_password(password)
    user = User(
        username=username,
        email=email,
        hashed_password=hashed,
        role=role,
        is_admin=is_admin,
        first_name=first_name,
        last_name=last_name,
        specialty=specialty,
        phone=phone,
        department=department,
        gender=gender,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
