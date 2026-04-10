import requests

BASE_URL = "http://localhost:2000/eco-market"
AUTH_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2OTk5ZWRmODU0NmM3ZWVkYjU2MjM4OTQiLCJpYXQiOjE3NzU2NjQ0NTAsImV4cCI6MTc3NTc1MDg1MH0.k45FJmEuELkV81KMhESeyLeEpeyzqkw8dEDsWE8GYno"
TIMEOUT = 30

def test_get_eco_market_notifications():
    headers_auth = {
        "Authorization": f"Bearer {AUTH_TOKEN}"
    }
    # Authenticated request
    try:
        resp_auth = requests.get(f"{BASE_URL}/notifications", headers=headers_auth, timeout=TIMEOUT)
        # Expecting 200 OK with notifications list
        assert resp_auth.status_code == 200, f"Expected 200 for authenticated request, got {resp_auth.status_code}"
        json_auth = resp_auth.json()
        assert isinstance(json_auth, list), "Authenticated response should be a list of notifications"

    except requests.RequestException as e:
        assert False, f"Authenticated request to /notifications failed: {e}"

    # Unauthenticated request
    try:
        resp_unauth = requests.get(f"{BASE_URL}/notifications", timeout=TIMEOUT)
        # Expecting 401 Unauthorized or 403 Forbidden due to missing auth
        assert resp_unauth.status_code in (401, 403), f"Expected 401 or 403 for unauthenticated request, got {resp_unauth.status_code}"
    except requests.RequestException as e:
        assert False, f"Unauthenticated request to /notifications failed: {e}"

test_get_eco_market_notifications()