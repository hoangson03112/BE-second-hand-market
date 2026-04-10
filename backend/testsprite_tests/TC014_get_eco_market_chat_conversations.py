import requests

BASE_URL = "http://localhost:2000/eco-market"
AUTH_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2OTk5ZWRmODU0NmM3ZWVkYjU2MjM4OTQiLCJpYXQiOjE3NzU2NjQ0NTAsImV4cCI6MTc3NTc1MDg1MH0.k45FJmEuELkV81KMhESeyLeEpeyzqkw8dEDsWE8GYno"
HEADERS_AUTH = {
    "Authorization": f"Bearer {AUTH_TOKEN}"
}
TIMEOUT = 30

def test_get_eco_market_chat_conversations():
    # Test without token - should be unauthorized 401
    url = f"{BASE_URL}/chat/conversations"
    try:
        resp_unauth = requests.get(url, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request without token failed with exception: {e}"
    assert resp_unauth.status_code == 401, f"Expected 401 Unauthorized without token, got {resp_unauth.status_code}"

    # Test with valid token - should return 200 and a list of conversations
    try:
        resp_auth = requests.get(url, headers=HEADERS_AUTH, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request with token failed with exception: {e}"
    assert resp_auth.status_code == 200, f"Expected 200 OK with token, got {resp_auth.status_code}"
    try:
        conversations = resp_auth.json()
    except ValueError:
        assert False, "Response is not valid JSON"

    assert isinstance(conversations, list), f"Expected response as a list, got {type(conversations)}"

    # Further validate conversation objects if list non-empty
    if conversations:
        conversation = conversations[0]
        assert isinstance(conversation, dict), "Each conversation item should be a dict"
        # Typical conversation expected fields (from general chat schema guess)
        # We'll check some common fields for chat conversations:
        expected_keys = {"_id", "participants", "lastMessage", "updatedAt", "createdAt"}
        assert expected_keys.intersection(conversation.keys()), "Conversation dict missing expected keys"

test_get_eco_market_chat_conversations()