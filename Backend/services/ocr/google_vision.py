"""Google Vision OCR service (OCR #1 - Default) via REST API."""

from __future__ import annotations
import logging
import base64
import httpx
from config import settings
from google.auth.transport.requests import Request
import json

logger = logging.getLogger(__name__)

from services.google_drive import get_credentials

VISION_API_URL = "https://vision.googleapis.com/v1/images:annotate"

def _get_access_token():
    """Get a valid access token using the shared credentials."""
    try:
        creds = get_credentials()
        if not creds:
             logger.error("No credentials foudn for Google Vision.")
             return None
        
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            
        return creds.token
    except Exception as e:
        logger.error(f"Failed to get access token for Vision: {e}")
        return None

def extract_text(image_bytes: bytes) -> dict:
    """
    Run Google Cloud Vision OCR on raw image bytes using REST API.

    Returns:
        dict with keys: raw_text, confidence, service
    """
    token = _get_access_token()
    if not token:
        return {"raw_text": "", "confidence": 0, "error": "Auth failed", "service": "Google Vision"}

    try:
        # Encode image to base64
        image_b64 = base64.b64encode(image_bytes).decode("utf-8")
        
        # Construct request body
        body = {
            "requests": [
                {
                    "image": {
                        "content": image_b64
                    },
                    "features": [
                        {
                            "type": "TEXT_DETECTION"
                        }
                    ]
                }
            ]
        }
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        # Use httpx for the request
        with httpx.Client() as client:
            response = client.post(VISION_API_URL, json=body, headers=headers, timeout=30.0)
            
        if response.status_code != 200:
             return {
                "raw_text": "",
                "confidence": 0,
                "error": f"API Error {response.status_code}: {response.text}",
                "service": "Google Vision"
            }
            
        data = response.json()
        
        # Parse response (handle potential errors in body)
        responses = data.get("responses", [])
        if not responses:
             return {"raw_text": "", "confidence": 0, "error": "No response data", "service": "Google Vision"}
             
        res = responses[0]
        if "error" in res:
             return {
                "raw_text": "",
                "confidence": 0,
                "error": res["error"].get("message", "Unknown error"),
                "service": "Google Vision"
            }
            
        text_annotations = res.get("textAnnotations", [])
        if not text_annotations:
             return {
                "raw_text": "",
                "confidence": 0,
                "error": "No text found",
                "service": "Google Vision"
            }
            
        # First annotation is the full text
        raw_text = text_annotations[0].get("description", "")
        
        # Calculate confidence
        confidence = 0.0
        full_text_annotation = res.get("fullTextAnnotation", {})
        pages = full_text_annotation.get("pages", [])
        
        if pages:
            page = pages[0]
            blocks = page.get("blocks", [])
            block_confidences = [block.get("confidence", 0) for block in blocks]
            if block_confidences:
                confidence = sum(block_confidences) / len(block_confidences)
                confidence = round(confidence * 100, 2)

        return {
            "raw_text": raw_text,
            "confidence": confidence,
            "service": "Google Vision",
        }

    except Exception as e:
        logger.error("Google Vision REST error: %s", e)
        return {"raw_text": "", "confidence": 0, "error": str(e), "service": "Google Vision"}
