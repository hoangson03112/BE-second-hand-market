import requests

BASE_URL = "http://localhost:2000/eco-market"
TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2OTk5ZWRmODU0NmM3ZWVkYjU2MjM4OTQiLCJpYXQiOjE3NzU2NjQ0NTAsImV4cCI6MTc3NTc1MDg1MH0.k45FJmEuELkV81KMhESeyLeEpeyzqkw8dEDsWE8GYno"
REGISTER_ENDPOINT = f"{BASE_URL}/sellers/register"
HEADERS_AUTH = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}
HEADERS_NO_AUTH = {
    "Content-Type": "application/json"
}

def test_post_eco_market_sellers_register():
    payload = {
        "storeName": "Test Store",
        "storeDescription": "A test store description.",
        "contactNumber": "1234567890",
        "address": "123 Test Lane, Testville",
        "additionalInfo": "No additional info",
        "frontCCCDImage": "http://example.com/cccd_front.jpg",
        "backCCCDImage": "http://example.com/cccd_back.jpg"
    }

    # 1. Test with valid user token - expect 200 Successful submission
    try:
        response = requests.post(REGISTER_ENDPOINT, headers=HEADERS_AUTH, json=payload, timeout=30)
    except requests.RequestException as err:
        assert False, f"Request with token failed: {err}"
    else:
        assert response.status_code == 200, f"Expected 200 OK. Got {response.status_code}. Response: {response.text}"
        json_response = response.json()
        assert isinstance(json_response, dict), "Response should be a JSON object"
        # Assuming response contains fields about submission success, e.g. requestId or status
        assert "requestId" in json_response or "status" in json_response, "Response missing expected keys"

    # 2. Test without token - expect 401 Unauthorized
    try:
        response_unauth = requests.post(REGISTER_ENDPOINT, headers=HEADERS_NO_AUTH, json=payload, timeout=30)
    except requests.RequestException as err:
        assert False, f"Request without token failed: {err}"
    else:
        assert response_unauth.status_code == 401, f"Expected 401 Unauthorized. Got {response_unauth.status_code}. Response: {response_unauth.text}"


test_post_eco_market_sellers_register()
