import requests

BASE_URL = "http://localhost:2000/eco-market"
LOGIN_ENDPOINT = f"{BASE_URL}/auth/login"
TIMEOUT = 30

def test_post_eco_market_auth_login():
    # Test valid credentials login
    valid_credentials = {
        "email": "validuser@example.com",
        "password": "validpassword123"
    }
    try:
        response = requests.post(LOGIN_ENDPOINT, json=valid_credentials, timeout=TIMEOUT)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        json_data = response.json()
        # Expect at least two token fields as string in response
        tokens = [value for key, value in json_data.items() if isinstance(value, str) and len(value) > 10]
        assert len(tokens) >= 2, f"Expected at least two token strings in login response, found {len(tokens)}"
    except requests.RequestException as e:
        assert False, f"Request failed during valid credentials test: {e}"

    # Test invalid credentials login
    invalid_credentials = {
        "email": "invaliduser@example.com",
        "password": "wrongpassword"
    }
    try:
        response = requests.post(LOGIN_ENDPOINT, json=invalid_credentials, timeout=TIMEOUT)
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        json_data = response.json()
        # Expect error message about invalid credentials
        assert "error" in json_data or "message" in json_data, "Error message missing for invalid login"
    except requests.RequestException as e:
        assert False, f"Request failed during invalid credentials test: {e}"

test_post_eco_market_auth_login()
