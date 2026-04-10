import requests

BASE_URL = "http://localhost:2000/eco-market"
TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2OTk5ZWRmODU0NmM3ZWVkYjU2MjM4OTQiLCJpYXQiOjE3NzU2NjQ0NTAsImV4cCI6MTc3NTc1MDg1MH0.k45FJmEuELkV81KMhESeyLeEpeyzqkw8dEDsWE8GYno"

def test_post_eco_market_orders_business_rule_violation():
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json"
    }

    # Attempt to create an order with a payload that violates a business rule.
    # As business rule violation example: ordering with quantity exceeding inventory.
    # Since we do not have resource details, we try a likely invalid order:
    # Example payload structure (typical checkout payload), must be aligned with API expectations.
    order_payload = {
        "items": [
            {
                "productId": "000000000000000000000000",  # Nonexistent or invalid product to trigger business rule error.
                "quantity": 99999  # Excessive quantity to simulate insufficient inventory or other business rule violation.
            }
        ],
        "shippingAddress": {
            "street": "123 Test St",
            "city": "Testville",
            "postalCode": "12345",
            "country": "Testland"
        },
        "paymentMethod": "test_card"
    }

    try:
        response = requests.post(
            f"{BASE_URL}/orders",
            headers=headers,
            json=order_payload,
            timeout=30
        )
    except requests.RequestException as e:
        assert False, f"Request to create order failed due to network or connection error: {e}"

    # Validate the response: expecting HTTP 400 Business rule error
    assert response.status_code == 400, f"Expected 400 status code for business rule violation, got {response.status_code}"

    # Optionally validate error message presence and content
    try:
        resp_json = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"

    # Validate typical error shape for business rule error could include fields like 'error', 'message' or similar
    assert isinstance(resp_json, dict), "Response JSON is not an object as expected"
    assert "error" in resp_json or "message" in resp_json, "Business rule error response missing 'error' or 'message' key"

test_post_eco_market_orders_business_rule_violation()