"""Image validation and processing utilities."""

from __future__ import annotations
from pathlib import Path

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf"}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


def validate_file(filename: str, size_bytes: int) -> tuple[bool, str]:
    """
    Validate an uploaded file.

    Returns:
        (is_valid, error_message)
    """
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        return False, f"Unsupported file type: {ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"

    if size_bytes > MAX_FILE_SIZE_BYTES:
        mb = size_bytes / (1024 * 1024)
        return False, f"File too large ({mb:.1f} MB). Maximum: 10 MB"

    if size_bytes == 0:
        return False, "File is empty"

    return True, ""


def get_mimetype(filename: str) -> str:
    """Return MIME type based on file extension."""
    ext = Path(filename).suffix.lower()
    mime_map = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".pdf": "application/pdf",
    }
    return mime_map.get(ext, "application/octet-stream")
