from unittest.mock import AsyncMock
from fastapi.testclient import TestClient
from main import app
from database import get_db

# Override dependency
async def override_get_db():
    mock_session = AsyncMock()
    # Mock commit/refresh/add
    mock_session.commit = AsyncMock()
    mock_session.refresh = AsyncMock()
    mock_session.add = AsyncMock()
    yield mock_session

app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)

def test_vat_validation():
    print("Running VAT Validation Tests...")

    # 1. Success case: Consistent VAT
    print("\nTest 1: Consistent VAT (100 + 5 = 105)")
    response = client.post("/api/admin/manual-entry", data={
        "user_name": "Test", "team": "Test", "store_name": "Store",
        "invoice_number": "123", "invoice_date": "2023-01-01",
        "amount_before_tax": 100.0, "amount_after_tax": 105.0,
        "vat_amount": 5.0, "manual_entry_reason": "Test"
    })
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")
    assert response.status_code == 200

    # 2. Failure case: Inconsistent VAT
    print("\nTest 2: Inconsistent VAT (100 + 5 != 120, expected 20)")
    response = client.post("/api/admin/manual-entry", data={
        "user_name": "Test", "team": "Test", "store_name": "Store",
        "invoice_number": "123", "invoice_date": "2023-01-01",
        "amount_before_tax": 100.0, "amount_after_tax": 120.0,
        "vat_amount": 5.0, "manual_entry_reason": "Test"
    })
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")
    assert response.status_code == 400
    assert "VAT mismatch" in response.json()['detail']

    # 3. Missing VAT case: Should succeed and calculate
    print("\nTest 3: Missing VAT (100, 105 -> Calc 5)")
    response = client.post("/api/admin/manual-entry", data={
        "user_name": "Test", "team": "Test", "store_name": "Store",
        "invoice_number": "123", "invoice_date": "2023-01-01",
        "amount_before_tax": 100.0, "amount_after_tax": 105.0,
        "manual_entry_reason": "Test"
    })
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")
    assert response.status_code == 200

if __name__ == "__main__":
    test_vat_validation()
