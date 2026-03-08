"""LLM-based validation, extraction, and categorisation service (Google Gemini API)."""

from __future__ import annotations
import json
from typing import Optional

from google import genai

from config import settings


VALIDATION_PROMPT = """You are an invoice data validator specializing in receipts from the UAE and GCC region. You will receive OCR outputs from two different services for the same receipt.

IMPORTANT: OCR outputs may have formatting differences, missing whitespace, or character recognition errors. Focus on the NUMERIC and ALPHANUMERIC VALUES, not formatting.

CRITICAL RULE: If ANY OCR output is empty, contains error messages (e.g. "File too large", "Error"), or has NO extracted text, you MUST return "status": "mismatch_detected" immediately. This ensures a more powerful OCR service is called.

ARABIC LANGUAGE SUPPORT:
- Tax Registration Number may appear as "TRN", "Tax Registration Number", "رقم التسجيل الضريبي", or "رقم الملف الضريبي"
- Store names may contain Arabic text (e.g., أدنوك for ADNOC)
- Dates may use Arabic numerals or be in DD-MM-YYYY format

CRITICAL FIELDS FOR COMPARISON:
1. Invoice Number (Invoice No, Receipt No, رقم الفاتورة) - THESE ARE THE SAME.
2. Tax Registration Number (TRN, VAT number, VAT Rigistration رقم التسجيل الضريبي, رقم الملف الضريبي)
3. Amount Before Tax (Subtotal, Amount excluding VAT, المبلغ قبل الضريبة)
4. Amount After Tax (Total Amount, Total, المبلغ الإجمالي)

EXTRACTION RULES:
- **Invoice Number vs Receipt Number**: They are the SAME field. If one OCR says "Receipt No: 123" and another "Invoice No: 123", it is a MATCH. Extract as `invoice_number`.
- TRN is typically 15 digits starting with "100" — extract it even if the label differs.
- Ignore minor OCR artifacts: extra spaces, tabs (\\t), newlines (\\r\\n), slight character substitutions.
- Store names can vary slightly (e.g., "ADNOC Distribution" vs "ADNOC Distribut") — treat as match.

MATCHING LOGIC:
- **Invoice/Receipt Number**: Compare the alphanumeric string. "INV-123" and "123" might remain a mismatch if the prefix is real, but "123" and "123" are a match.
- **TRN**: Compare only the extracted digit sequences.
- **Amounts**: Allow ±0.01 difference.
- **Missing Fields**: If a Critical Field (Invoice No, TRN, Total Amount) is MISSING in BOTH outputs, return `status: "mismatch_detected"`.
- **One Missing**: If a Critical Field is present in ONE output but MISSING in the other, return `status: "mismatch_detected"` (so the Judge can decide).

OCR Service 1 Output:
{ocr1_output}

OCR Service 2 Output:
{ocr2_output}

Return your response ONLY as valid JSON with this structure:
{{
  "status": "success" | "mismatch_detected",
  "receipt_data": {{
    "store_name": "string",
    "invoice_number": "string",
    "tax_registration_number": "string",
    "invoice_date": "YYYY-MM-DD or empty",
    "amount_before_tax": number,
    "amount_after_tax": number,
    "vat_amount": number,
    "currency": "string (default AED)",
    "category": "one of: Equipment/Hardware, Transportation, Food/Beverage, Supermarket/Groceries, Office Supplies, Communication, Maintenance, Fuel, Accommodation, Medical, Other",
    "items_summary": "brief description of items"
  }},
  "validation": {{
    "ocr_match": true | false,
    "mismatched_fields": ["field1", "field2"],
    "confidence_score": number_0_to_100
  }}
}}"""

JUDGE_PROMPT = """You are a judge reviewing up to 4 different OCR outputs for the same receipt from the UAE/GCC region.

Multiple OCR services have analyzed this receipt. Use majority voting logic to determine the correct values.

ARABIC LANGUAGE SUPPORT:
- Tax Registration Number may appear as "TRN", "Tax Registration Number", "رقم التسجيل الضريبي", or "رقم الملف الضريبي"
- Store names may contain Arabic text (e.g., أدنوك for ADNOC)
- Dates may use Arabic numerals or be in DD-MM-YYYY format

EXTRACTION RULES:
- **Invoice Number vs Receipt Number**: They are the SAME field. Treat them as identical.
- TRN is typically 15 digits starting with "100".
- Ignore OCR formatting artifacts.

OCR Service Outputs:
{ocr_outputs}

VOTING RULES:
- **Invoice Number**: Look for agreement across services. "Receipt No" values count towards "Invoice No" agreement.
- If 2 or more services agree on a value (ignoring formatting), that is the correct value.
- If there is no agreement (tie) but one service has a high confidence extraction (e.g. AWS Textract or Azure CV), prefer that value.
- If all disagree on a Critical Field (Invoice No, TRN, Total Amount), set that field to "" and add it to "unresolved_fields".
- **Status**:
    - If ALL Critical Fields are found and agreed upon: `status: "success"`
    - If ANY Critical Field is unresolved or missing: `status: "review_required"`
    - If NO useful data is found: `status: "manual_entry_required"`

Return your response ONLY as valid JSON with this structure:
{{
  "status": "success" | "review_required" | "manual_entry_required",
  "receipt_data": {{
    "store_name": "string",
    "invoice_number": "string",
    "tax_registration_number": "string",
    "invoice_date": "YYYY-MM-DD or empty",
    "amount_before_tax": number,
    "amount_after_tax": number,
    "vat_amount": number,
    "currency": "string",
    "category": "one of: Equipment/Hardware, Transportation, Food/Beverage, Supermarket/Groceries, Office Supplies, Communication, Maintenance, Fuel, Accommodation, Medical, Other",
    "items_summary": "string"
  }},
  "validation": {{
    "ocr_match": false,
    "mismatched_fields": [],
    "unresolved_fields": [],
    "confidence_score": number_0_to_100
  }}
}}"""


def _get_client() -> genai.Client:
    """Create a Gemini client using the API key."""
    return genai.Client(api_key=settings.gemini_api_key)


def _call_gemini(prompt: str) -> str:
    """Send a prompt to Gemini and return the text response."""
    client = _get_client()
    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=prompt,
    )
    return response.text or ""


def validate_dual_ocr(ocr1_text: str, ocr2_text: str) -> dict:
    """Send two OCR outputs to Gemini for validation and extraction."""
    prompt = VALIDATION_PROMPT.format(ocr1_output=ocr1_text, ocr2_output=ocr2_text)
    response_text = _call_gemini(prompt)
    return _parse_response(response_text)


def judge_multi_ocr(ocr_results: list[str]) -> dict:
    """Send multiple OCR outputs to Gemini as judge for tiebreaking."""
    formatted_outputs = ""
    for i, res in enumerate(ocr_results, 1):
        formatted_outputs += f"OCR Service {i}:\n{res}\n\n"
        
    prompt = JUDGE_PROMPT.format(ocr_outputs=formatted_outputs)
    response_text = _call_gemini(prompt)
    return _parse_response(response_text)


def suggest_category(store_name: str, items: str = "") -> str:
    """Use Gemini to suggest a category based on store name and items."""
    prompt = f"""Given this store name and items, return ONLY the most appropriate category from this list:
Equipment/Hardware, Transportation, Food/Beverage, Supermarket/Groceries, Office Supplies, Communication, Maintenance, Fuel, Accommodation, Medical, Other

Store: {store_name}
Items: {items or 'N/A'}

Category:"""

    response_text = _call_gemini(prompt)
    return response_text.strip()


def _parse_response(text: str) -> dict:
    """Parse LLM text response into dict, handling markdown code fences."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first and last lines (```json and ```)
        lines = [line for line in lines if not line.strip().startswith("```")]
        text = "\n".join(lines)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {
            "status": "manual_entry_required",
            "receipt_data": {},
            "validation": {"ocr_match": False, "mismatched_fields": [], "confidence_score": 0},
            "error": "Failed to parse LLM response",
        }
