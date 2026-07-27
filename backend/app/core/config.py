from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment / .env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database: mysql+pymysql://USER:PASSWORD@HOST:3306/DATABASE
    DATABASE_URL: str = "mysql+pymysql://root:@localhost:3306/smarthos"

    # Secondary DB for RAG reads (smarthos_sec). When set, assistant retrieval
    # uses this database instead of DATABASE_URL.
    RAG_DATABASE_URL: str | None = None

    # Live hoshealth (legacy CHUIR) for bidirectional clinical sync.
    # Example: host=10.10.10.2 user=hoshealth_smart3 db=hoshealth
    CHUIR_SOURCE_HOST: str | None = None
    CHUIR_SOURCE_PORT: int = 3306
    CHUIR_SOURCE_USER: str | None = None
    CHUIR_SOURCE_PASSWORD: str | None = None
    CHUIR_SOURCE_DB: str = "hoshealth"
    HOSHEALTH_BIDI_ENABLED: bool = False

    SECRET_KEY: str = "change-this-secret-key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Comma-separated origins, e.g. http://rheuma.local,http://localhost:3000
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:19006"

    # When false, the /api/chat routes are not registered and no Ollama
    # connection is attempted. Use for sites deployed without an AI host.
    AI_ASSISTANT_ENABLED: bool = True

    OLLAMA_HOST: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "gemma4:e4b"

    # development | production
    APP_ENV: str = "development"

    # When true, SQLAlchemy create_all runs on startup (use migrations in production)
    CREATE_TABLES_ON_STARTUP: bool | None = None

    @field_validator("OLLAMA_HOST", mode="before")
    @classmethod
    def strip_trailing_slash(cls, v: str) -> str:
        return v.rstrip("/") if isinstance(v, str) else v

    @property
    def is_production(self) -> bool:
        return self.APP_ENV.lower() == "production"

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def create_tables_on_startup(self) -> bool:
        if self.CREATE_TABLES_ON_STARTUP is not None:
            return self.CREATE_TABLES_ON_STARTUP
        return not self.is_production

    @property
    def rag_database_url(self) -> str:
        return self.RAG_DATABASE_URL or self.DATABASE_URL

    @property
    def use_rag_secondary(self) -> bool:
        return bool(self.RAG_DATABASE_URL) and self.RAG_DATABASE_URL != self.DATABASE_URL

    @property
    def chu_ir_source_configured(self) -> bool:
        return bool(self.CHUIR_SOURCE_HOST and self.CHUIR_SOURCE_USER)


settings = Settings()
