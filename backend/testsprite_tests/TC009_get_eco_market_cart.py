import requests

endpoint = "http://localhost:2000/eco-market"
token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2OTk5ZWRmODU0NmM3ZWVkYjU2MjM4OTQiLCJpYXQiOjE3NzU2NjQ0NTAsImV4cCI6MTc3NTc1MDg1MH0.k45FJmEuELkV81KMhESeyLeEpeyzqkw8dEDsWE8GYno"
headers_auth = {"Authorization": f"Bearer {token}"}
timeout_sec = 30

def test_get_eco_market_cart():
    # Test with valid token
    try:
        response = requests.get(f"{endpoint}/cart", headers=headers_auth, timeout=timeout_sec)
        response.raise_for_status()
        json_data = response.json()
        # Assert success status code 200
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        # Assert response contains cart object (at least check dict)
        assert isinstance(json_data, dict), "Response is not a JSON object (cart)"
    except requests.RequestException as e:
        assert False, f"Request with valid token failed: {str(e)}"

    # Test without token
    try:
        response = requests.get(f"{endpoint}/cart", timeout=timeout_sec)
        # We expect 401 Unauthorized
        assert response.status_code == 401, f"Expected 401 without token, got {response.status_code}"
        json_data = response.json()
        # Optionally check error message presence
        assert "error" in json_data or "message" in json_data, "Error message not found in response"
    except requests.RequestException as e:
        assert False, f"Request without token failed unexpectedly: {str(e)}"

test_get_eco_market_cart()