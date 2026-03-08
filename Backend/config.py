"""Application configuration loaded from environment variables."""


from pathlib import Path
from pydantic_settings import BaseSettings

# Resolve paths relative to the project root (where config.py lives)
PROJECT_DIR = Path(__file__).resolve().parent
ENV_FILE = PROJECT_DIR / ".env"


class Settings(BaseSettings):
    """All configuration values, loaded from .env and environment."""

    # ── PostgreSQL (Supabase) ──
    postgres_url: str = ""
    postgres_url_non_pooling: str = ""
    postgres_database: str = "postgres"
    postgres_host: str = ""
    postgres_user: str = "postgres"
    postgres_password: str = ""

    # ── OCR.space ──
    ocr_space_key: str = ""

    # ── Google Drive ──
    google_drive_folder_id: str = ""

    # ── Google OAuth 2.0 (Drive) ──
    client_id: str = ""
    project_id: str = ""
    auth_uri: str = "https://accounts.google.com/o/oauth2/auth"
    token_uri: str = "https://oauth2.googleapis.com/token"
    auth_provider_x509_cert_url: str = "https://www.googleapis.com/oauth2/v1/certs"
    client_secret: str = ""
    redirect_uris: str = "http://localhost"
    google_token_json: str = ""

    # ── Azure Computer Vision ──
    ms_az_key_1: str = ""
    ms_az_key_2: str = ""
    ms_az_region: str = "eastus"
    ms_az_endpoint: str = ""

    # ── AWS (Textract) ──
    aws_access_key: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "us-east-1"

    # ── LLM (Google Gemini) ──
    gemini_api_key: str = ""
    gemini_model: str = ""

    # ── JWT ──
    jwt_secret: str = ""

    # ── Super Admin Seed ──
    super_admin_email: str = ""
    super_admin_password: str = ""
    super_admin_name: str = "Super Admin"

    # ── App ──
    debug_mode: bool = False
    backend_port: int = 8000
    cors_origins: str = "http://localhost:8080"
    max_file_size_mb: int = 10

    @property
    def database_url(self) -> str:
        """Return the async database URL for SQLAlchemy."""
        url = self.postgres_url_non_pooling or self.postgres_url
        if not url:
            # Build from individual components
            url = (
                f"postgresql://{self.postgres_user}:{self.postgres_password}"
                f"@{self.postgres_host}:5432/{self.postgres_database}"
            )
        # Convert postgres:// to postgresql+asyncpg:// for async driver
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        # Strip sslmode param — asyncpg doesn't support it as a URL param.
        # SSL is handled via connect_args in database.py instead.
        import re
        url = re.sub(r'[?&]sslmode=[^&]*', '', url)
        # Also strip supa=base-pooler.x and pgbouncer=true
        url = re.sub(r'[?&]supa=[^&]*', '', url)
        url = re.sub(r'[?&]pgbouncer=[^&]*', '', url)
        # Clean up dangling ? or & at end
        url = url.rstrip('?&')
        return url

    @property
    def database_url_sync(self) -> str:
        """Return the sync database URL (for Alembic migrations etc.)."""
        url = self.postgres_url_non_pooling or self.postgres_url
        if not url:
            url = (
                f"postgresql://{self.postgres_user}:{self.postgres_password}"
                f"@{self.postgres_host}:5432/{self.postgres_database}"
            )
        return url

    class Config:
        env_file = str(ENV_FILE)
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()

# Teams whose invoices are hidden from aggregate views (dashboard, statistics,
# default invoice list) but still processed by OCR and visible when the team
# is explicitly selected in the filter dropdown.
HIDDEN_TEAMS: set[str] = {"ADSC"}
