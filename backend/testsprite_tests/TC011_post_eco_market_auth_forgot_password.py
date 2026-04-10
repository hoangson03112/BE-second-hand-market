import requests

def test_post_eco_market_auth_forgot_password():
    base_url = "http://localhost:2000/eco-market"
    url = f"{base_url}/auth/forgot-password"
    headers = {
        "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2OTk5ZWRmODU0NmM3ZWVkYjU2MjM4OTQiLCJpYXQiOjE3NzU2NjQ0NTAsImV4cCI6MTc3NTc1MDg1MH0.k45FJmEuELkV81KMhESeyLeEpeyzqkw8dEDsWE8GYno",
        "Content-Type": "application/json"
    }

    # Valid email but malformed payload (send email nested incorrectly or with extra unexpected fields)
    payload = {
        "email": ["valid@example.com"],  # malformed: email should be a string, here it's a list
        "extra_field": "unexpected_value"
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=30)
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    # Expecting response: the reset flow triggers but validation error due to malformed payload.
    # Assuming the API returns 400 for validation error.
    # But since it also should trigger the reset flow with valid email, it may respond 200 or 400.
    # So we validate conditions for 200 or 400 with a proper message or structure.

    assert response.status_code in (200, 400), f"Unexpected status code {response.status_code}"

    try:
        data = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"

    if response.status_code == 200:
        # Check that reset flow triggered message or flag is present
        assert ("message" in data and ("reset" in data["message"].lower() or "email" in data["message"].lower())) or \
               ("success" in data and data["success"] is True), "Response missing expected reset flow confirmation"
    else:
        # For validation error case, expect error details about email format or unexpected fields
        assert "error" in data or "message" in data, "Validation error response missing error message"
        msg = data.get("message", "") or data.get("error", "")
        assert "email" in msg.lower() or "validation" in msg.lower() or "malformed" in msg.lower(), \
            "Validation error message does not mention email or malformed payload"

test_post_eco_market_auth_forgot_password()