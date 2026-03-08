"""OCR.space API service (OCR #1) — replaces Google Vision."""

from __future__ import annotations
import base64
import logging

import httpx

from config import settings

logger = logging.getLogger(__name__)

OCR_SPACE_URL = "https://api.ocr.space/parse/image"


def extract_text(image_bytes: bytes) -> dict:
    """
    Run OCR.space OCR on raw image bytes.

    Uses Engine 2 with language=auto.
    Free-tier limits: 1 MB file size, 3 PDF pages.

    Returns:
        dict with keys: raw_text, confidence, service
    """
    api_key = settings.ocr_space_key
    if not api_key:
        return {"raw_text": "", "confidence": 0, "error": "OCR_SPACE_KEY not configured"}

    # Encode image as base64 data URI
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    payload = {
        "apikey": api_key,
        "base64Image": f"data:image/jpeg;base64,{b64}",
        "language": "auto",        # auto-detect (Engine 2 only)
        "OCREngine": "2",          # Engine 2 supports auto language
        "isTable": "true",         # better for receipts
        "scale": "true",           # upscale for better results
    }

    try:
        with httpx.Client(timeout=60.0) as client:
            response = client.post(OCR_SPACE_URL, data=payload)
            response.raise_for_status()

        result = response.json()

        if result.get("IsErroredOnProcessing"):
            error_msg = result.get("ErrorMessage", ["Unknown error"])
            if isinstance(error_msg, list):
                error_msg = "; ".join(error_msg)
            logger.error("OCR.space error: %s", error_msg)
            return {"raw_text": "", "confidence": 0, "error": error_msg}

        parsed = result.get("ParsedResults", [])
        if not parsed:
            return {"raw_text": "", "confidence": 0, "error": "No parsed results"}

        # Concatenate text from all pages
        full_text = "\n".join(p.get("ParsedText", "") for p in parsed)

        # OCR.space doesn't provide a confidence score in Engine 2,
        # but we can use the exit code as a signal
        exit_code = result.get("OCRExitCode", 0)
        confidence = 90.0 if exit_code == 1 else 50.0  # 1 = success

        return {
            "raw_text": full_text.strip(),
            "confidence": confidence,
            "service": "OCR.space (Engine 2)",
        }

    except httpx.HTTPStatusError as e:
        logger.error("OCR.space HTTP error: %s", e)
        return {"raw_text": "", "confidence": 0, "error": f"HTTP {e.response.status_code}"}
    except Exception as e:
        logger.error("OCR.space error: %s", e)
        return {"raw_text": "", "confidence": 0, "error": str(e)}
