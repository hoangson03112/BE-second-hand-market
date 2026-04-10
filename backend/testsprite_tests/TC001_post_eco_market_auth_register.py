import requests

BASE_URL = "http://localhost:2000/eco-market"
REGISTER_ENDPOINT = f"{BASE_URL}/auth/register"
HEADERS = {
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2OTk5ZWRmODU0NmM3ZWVkYjU2MjM4OTQiLCJpYXQiOjE3NzU2NjQ0NTAsImV4cCI6MTc3NTc1MDg1MH0.k45FJmEuELkV81KMhESeyLeEpeyzqkw8dEDsWE8GYno",
    "Content-Type": "application/json"
}
TIMEOUT = 30


def test_post_eco_market_auth_register():
    session = requests.Session()
    try:
        # Test registration with a new valid email
        valid_payload = {
            "email": "testuser_unique@example.com",
            "password": "StrongPassw0rd!"
        }
        resp_valid = session.post(REGISTER_ENDPOINT, json=valid_payload, headers={"Content-Type": "application/json"}, timeout=TIMEOUT)
        assert resp_valid.status_code == 200, f"Expected 200 for new registration, got {resp_valid.status_code}"
        json_valid = resp_valid.json()
        assert any(key in json_valid for key in ["verification", "verified", "account"]), "Response missing expected account verification info"

        # Test registration with an already-registered email (the one just registered)
        resp_duplicate = session.post(REGISTER_ENDPOINT, json=valid_payload, headers={"Content-Type": "application/json"}, timeout=TIMEOUT)
        assert resp_duplicate.status_code == 400, f"Expected 400 for duplicate registration, got {resp_duplicate.status_code}"
        json_dup = resp_duplicate.json()
        # Validate error has message or validation key
        assert any(key in json_dup for key in ["error", "message", "validation"]), "Expected error or validation message in duplicate registration response"

    except requests.RequestException as e:
        assert False, f"Request failed: {e}"


test_post_eco_market_auth_register()
