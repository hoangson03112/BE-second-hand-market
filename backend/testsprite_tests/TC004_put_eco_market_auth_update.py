import requests

BASE_URL = "http://localhost:2000/eco-market"
TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2OTk5ZWRmODU0NmM3ZWVkYjU2MjM4OTQiLCJpYXQiOjE3NzU2NjQ0NTAsImV4cCI6MTc3NTc1MDg1MH0.k45FJmEuELkV81KMhESeyLeEpeyzqkw8dEDsWE8GYno"
HEADERS_AUTH = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}
HEADERS_NO_AUTH = {
    "Content-Type": "application/json"
}

def test_put_eco_market_auth_update():
    update_url = f"{BASE_URL}/auth/update"
    payload = {
        "name": "Updated Test User",
        "email": "updated-test@example.com"
    }

    # 1. Test update with valid access token: expect 200 and updated profile
    try:
        response_auth = requests.put(update_url, json=payload, headers=HEADERS_AUTH, timeout=30)
    except requests.RequestException as e:
        assert False, f"Request with token failed: {e}"

    assert response_auth.status_code == 200, f"Expected 200 OK with token but got {response_auth.status_code}"
    json_resp_auth = response_auth.json()
    # We expect at least the updated fields to be in the response or a profile object
    assert isinstance(json_resp_auth, dict), "Response is not a JSON object"
    if "name" in json_resp_auth:
        assert json_resp_auth["name"] == payload["name"], "Name not updated correctly"
    if "email" in json_resp_auth:
        assert json_resp_auth["email"] == payload["email"], "Email not updated correctly"

    # 2. Test update without access token: expect 401 or 403 Unauthorized / Forbidden
    try:
        response_no_auth = requests.put(update_url, json=payload, headers=HEADERS_NO_AUTH, timeout=30)
    except requests.RequestException as e:
        assert False, f"Request without token failed: {e}"

    assert response_no_auth.status_code in (401, 403), f"Expected 401 or 403 without token but got {response_no_auth.status_code}"

test_put_eco_market_auth_update()
