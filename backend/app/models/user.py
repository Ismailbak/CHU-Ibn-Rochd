from sqlalchemy import Column, Integer, String, Boolean
from sqlalchemy.orm import relationship
from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, index=True)
    email = Column(String(255), unique=True, index=True)
    hashed_password = Column(String(255))
    is_active = Column(Boolean, default=True)
    role = Column(String(50), default="doctor")
    is_admin = Column(Boolean, default=False)
    first_name = Column(String(100), nullable=True)
    last_name = Column(String(100), nullable=True)
    specialty = Column(String(100), nullable=True)
    phone = Column(String(30), nullable=True)
    department = Column(String(100), nullable=True)
    gender = Column(String(10), nullable=True)
    profile_picture = Column(String(255), nullable=True)
    
    # Relationships
    chat_sessions = relationship("ChatSession", back_populates="user")
