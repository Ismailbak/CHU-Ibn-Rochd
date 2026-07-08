from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings


def _mysql_url(url: str) -> str:
    if "sqlite" in url:
        return url
    if "mysql" in url and "charset=" not in url:
        separator = "&" if "?" in url else "?"
        return f"{url}{separator}charset=utf8mb4"
    return url


def _build_engine(url: str):
    connect_args = {}
    if "sqlite" in url:
        connect_args["check_same_thread"] = False
    return create_engine(
        _mysql_url(url),
        connect_args=connect_args,
        pool_pre_ping=True,
    )


engine = _build_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

rag_engine = _build_engine(settings.rag_database_url)
RAGSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=rag_engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_rag_db():
    db = RAGSessionLocal()
    try:
        yield db
    finally:
        db.close()
