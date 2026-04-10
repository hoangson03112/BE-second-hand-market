import requests

BASE_URL = "http://localhost:2000/eco-market"
TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2OTk5ZWRmODU0NmM3ZWVkYjU2MjM4OTQiLCJpYXQiOjE3NzU2NjQ0NTAsImV4cCI6MTc3NTc1MDg1MH0.k45FJmEuELkV81KMhESeyLeEpeyzqkw8dEDsWE8GYno"
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}
TIMEOUT = 30

def test_post_eco_market_products():
    # Valid body for creating product listing
    valid_payload = {
        "name": "Test Product Example",
        "price": 99.99,
        "categoryId": "64f8f0a6e123456789abcd01"
    }
    # Invalid body missing 'price' to provoke validation error
    invalid_payload = {
        "name": "Invalid Product Example",
        "categoryId": "64f8f0a6e123456789abcd01"
    }

    valid_created_product_id = None

    try:
        # 1. Test successful product creation with valid body
        response_valid = requests.post(
            f"{BASE_URL}/products",
            headers=HEADERS,
            json=valid_payload,
            timeout=TIMEOUT,
        )
        assert response_valid.status_code == 200, f"Expected 200 but got {response_valid.status_code}"
        json_valid = response_valid.json()
        assert "name" in json_valid and json_valid["name"] == valid_payload["name"]
        assert "price" in json_valid and float(json_valid["price"]) == valid_payload["price"]
        assert "categoryId" in json_valid and json_valid["categoryId"] == valid_payload["categoryId"]
        assert "_id" in json_valid or "id" in json_valid
        valid_created_product_id = json_valid.get("_id") or json_valid.get("id")
        assert valid_created_product_id is not None

        # 2. Test validation error with invalid body (missing price)
        response_invalid = requests.post(
            f"{BASE_URL}/products",
            headers=HEADERS,
            json=invalid_payload,
            timeout=TIMEOUT,
        )
        # Per PRD, invalid body should return 400 validation error
        assert response_invalid.status_code == 400, f"Expected 400 but got {response_invalid.status_code}"
        json_invalid = response_invalid.json()
        # Basic check for validation error keys/messages
        assert isinstance(json_invalid, dict)
        error_message = json_invalid.get("message") or json_invalid.get("error") or json_invalid.get("errors")
        assert error_message is not None

    finally:
        # Cleanup: delete the created product if created
        if valid_created_product_id:
            try:
                delete_response = requests.delete(
                    f"{BASE_URL}/products/{valid_created_product_id}",
                    headers=HEADERS,
                    timeout=TIMEOUT,
                )
                # We don't assert on delete because it might depend on API implementation
            except Exception:
                pass

test_post_eco_market_products()
