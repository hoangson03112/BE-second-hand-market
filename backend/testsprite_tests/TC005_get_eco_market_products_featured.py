import requests

BASE_URL = "http://localhost:2000/eco-market"
TIMEOUT = 30

def test_get_eco_market_products_featured():
    url = f"{BASE_URL}/products/featured"
    headers = {
        "Accept": "application/json"
    }

    try:
        response = requests.get(url, headers=headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    assert response.status_code == 200, f"Expected status code 200 but got {response.status_code}"
    try:
        products = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"

    assert isinstance(products, list), "Response JSON is not a list"

    # Optional: Validate that each product in the list has expected keys (basic check)
    if products:
        for product in products:
            assert isinstance(product, dict), "Product item is not a dictionary"
            # Typical keys from a product object (based on common practices and PRD)
            expected_keys = {"_id", "name", "price", "categoryId"}
            # Allow additional keys but at least these keys must exist
            missing_keys = expected_keys - product.keys()
            assert not missing_keys, f"Product missing expected keys: {missing_keys}"

test_get_eco_market_products_featured()