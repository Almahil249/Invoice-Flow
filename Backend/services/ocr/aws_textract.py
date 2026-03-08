"""AWS Textract OCR service (OCR #3 — Judge)."""

from __future__ import annotations
import boto3

from config import settings


def _get_client():
    return boto3.client(
        "textract",
        region_name=settings.aws_region,
        aws_access_key_id=settings.aws_access_key,
        aws_secret_access_key=settings.aws_secret_access_key,
    )


def extract_text(image_bytes: bytes) -> dict:
    """
    Run AWS Textract on raw image bytes.

    Returns:
        dict with keys: raw_text, confidence, service
    """
    try:
        client = _get_client()
        response = client.detect_document_text(
            Document={"Bytes": image_bytes}
        )
    except Exception as e:
        return {"raw_text": "", "confidence": 0, "error": str(e), "service": "AWS Textract"}

    lines = []
    confidences = []

    for block in response.get("Blocks", []):
        if block["BlockType"] == "LINE":
            lines.append(block.get("Text", ""))
            confidences.append(block.get("Confidence", 0))

    raw_text = "\n".join(lines)
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0

    return {
        "raw_text": raw_text,
        "confidence": round(avg_confidence, 1),
        "service": "AWS Textract",
    }
