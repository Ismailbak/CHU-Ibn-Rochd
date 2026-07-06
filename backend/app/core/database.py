from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

database_url = settings.DATABASE_URL
connect_args = {}
if "sqlite" in database_url:
    connect_args["check_same_thread"] = False
elif "mysql" in database_url and "charset=" not in database_url:
    separator = "&" if "?" in database_url else "?"
    database_url = f"{database_url}{separator}charset=utf8mb4"

engine = create_engine(
    database_url,
    connect_args=connect_args,
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
