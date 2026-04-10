import requests

BASE_URL = "http://localhost:2000/eco-market"
ADMIN_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2OTk5ZWRmODU0NmM3ZWVkYjU2MjM4OTQiLCJpYXQiOjE3NzU2NjQ0NTAsImV4cCI6MTc3NTc1MDg1MH0.k45FJmEuELkV81KMhESeyLeEpeyzqkw8dEDsWE8GYno"

# For non-admin token, try only login assuming the user exists.
def create_non_admin_token():
    login_payload = {
        "email": "nonadminuser@example.com",
        "password": "Password123!"
    }
    login_resp = requests.post(
        f"{BASE_URL}/auth/login",
        json=login_payload,
        timeout=30
    )
    assert login_resp.status_code == 200, f"Login failed for non-admin user: {login_resp.status_code} {login_resp.text}"
    data = login_resp.json()
    assert "accessToken" in data, "No accessToken in login response"
    return data["accessToken"]

def create_product(admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    product_payload = {
        "name": "Test Product For Moderation",
        "price": 99.99,
        "categoryId": "cat1234567890abcdef"  # example categoryId, assumed valid
    }
    resp = requests.post(
        f"{BASE_URL}/products",
        json=product_payload,
        headers=headers,
        timeout=30
    )
    assert resp.status_code == 200, f"Failed to create product: {resp.status_code} {resp.text}"
    product = resp.json()
    assert "_id" in product, "No product _id in response"
    return product["_id"]

def delete_product(product_id, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    try:
        resp = requests.delete(
            f"{BASE_URL}/products/{product_id}",
            headers=headers,
            timeout=30
        )
        # Deletion might not be supported or return 204 or 200; if 404, already deleted.
        if resp.status_code not in (200, 204, 404):
            raise Exception(f"Unexpected status code on product delete: {resp.status_code}")
    except Exception:
        # Ignore cleanup failures to avoid masking test failures
        pass

def test_patch_product_status():
    admin_headers = {"Authorization": f"Bearer {ADMIN_TOKEN}"}
    non_admin_token = create_non_admin_token()
    non_admin_headers = {"Authorization": f"Bearer {non_admin_token}"}

    product_id = None
    try:
        # Step 1: Create a new product (we'll create with admin token assuming admin can do this)
        product_id = create_product(ADMIN_TOKEN)

        # Step 2: Try patching product status with admin token (should succeed)
        admin_patch_payload = {
            "status": "approved"
        }
        admin_patch_resp = requests.patch(
            f"{BASE_URL}/products/{product_id}/status",
            json=admin_patch_payload,
            headers=admin_headers,
            timeout=30
        )
        assert admin_patch_resp.status_code == 200, f"Admin patch failed: {admin_patch_resp.status_code} {admin_patch_resp.text}"
        admin_response_data = admin_patch_resp.json()
        assert admin_response_data.get("status") == "approved", "Admin patch status not updated correctly"

        # Step 3: Try patching product status with non-admin token (should be forbidden)
        non_admin_patch_payload = {
            "status": "rejected"
        }
        non_admin_patch_resp = requests.patch(
            f"{BASE_URL}/products/{product_id}/status",
            json=non_admin_patch_payload,
            headers=non_admin_headers,
            timeout=30
        )
        assert non_admin_patch_resp.status_code == 403, f"Non-admin patch did not fail with 403: {non_admin_patch_resp.status_code} {non_admin_patch_resp.text}"

    finally:
        if product_id:
            delete_product(product_id, ADMIN_TOKEN)

test_patch_product_status()