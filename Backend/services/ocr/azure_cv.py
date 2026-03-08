"""Azure Computer Vision OCR service (OCR #2)."""

from __future__ import annotations
import httpx

from config import settings


def extract_text(image_bytes: bytes) -> dict:
    """
    Run Azure Computer Vision OCR on raw image bytes.

    Returns:
        dict with keys: raw_text, confidence, service
    """
    endpoint = settings.ms_az_endpoint.rstrip("/")
    url = f"{endpoint}/vision/v3.2/ocr"

    headers = {
        "Ocp-Apim-Subscription-Key": settings.ms_az_key_1,
        "Content-Type": "application/octet-stream",
    }
    params = {
        "language": "unk",       # Auto-detect language (Arabic + English)
        "detectOrientation": "true",
    }

    try:
        response = httpx.post(url, headers=headers, params=params, content=image_bytes, timeout=30)
        response.raise_for_status()
        result = response.json()
    except Exception as e:
        return {"raw_text": "", "confidence": 0, "error": str(e), "service": "Azure Computer Vision"}

    # Parse the OCR response into plain text
    lines = []
    for region in result.get("regions", []):
        for line in region.get("lines", []):
            words = [w["text"] for w in line.get("words", [])]
            lines.append(" ".join(words))

    raw_text = "\n".join(lines)

    return {
        "raw_text": raw_text,
        "confidence": 85.0,  # Azure OCR doesn't return per-character confidence in v3.2
        "service": "Azure Computer Vision",
    }
