import requests

BASE_URL = "http://localhost:2000/eco-market"
TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2OTk5ZWRmODU0NmM3ZWVkYjU2MjM4OTQiLCJpYXQiOjE3NzU2NjQ0NTAsImV4cCI6MTc3NTc1MDg1MH0.k45FJmEuELkV81KMhESeyLeEpeyzqkw8dEDsWE8GYno"
HEADERS_AUTH = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/json"
}
HEADERS_NO_AUTH = {
    "Accept": "application/json"
}


def test_get_eco_market_orders_my_orders():
    # Test with valid access token
    try:
        response_auth = requests.get(
            f"{BASE_URL}/orders/my-orders",
            headers=HEADERS_AUTH,
            timeout=30
        )
    except requests.RequestException as e:
        assert False, f"Request with auth token failed: {e}"

    assert response_auth.status_code == 200, f"Expected 200 with valid token, got {response_auth.status_code}"
    try:
        orders = response_auth.json()
    except ValueError:
        assert False, "Response with auth token is not valid JSON"

    # The contract expects an array (Order[])
    assert isinstance(orders, list), f"Expected list of orders, got {type(orders)}"

    # Test without access token
    try:
        response_no_auth = requests.get(
            f"{BASE_URL}/orders/my-orders",
            headers=HEADERS_NO_AUTH,
            timeout=30
        )
    except requests.RequestException as e:
        assert False, f"Request without auth token failed: {e}"

    assert response_no_auth.status_code == 401, f"Expected 401 Unauthorized without token, got {response_no_auth.status_code}"
    try:
        error_body = response_no_auth.json()
    except ValueError:
        assert False, "Response without token is not valid JSON"

    # Optionally check for standard error keys presence in error response
    assert isinstance(error_body, dict), "Expected error response to be a dict"
    assert "message" in error_body or "error" in error_body, "Expected error message key in unauthorized response"


test_get_eco_market_orders_my_orders()