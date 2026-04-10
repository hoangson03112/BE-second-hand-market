
# TestSprite AI Testing Report(MCP)

---

## 1️⃣ Document Metadata
- **Project Name:** backend
- **Date:** 2026-04-09
- **Prepared by:** TestSprite AI Team

---

## 2️⃣ Requirement Validation Summary

#### Test TC001 post-eco-market-auth-register
- **Test Code:** [TC001_post_eco_market_auth_register.py](./TC001_post_eco_market_auth_register.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 36, in <module>
  File "<string>", line 21, in test_post_eco_market_auth_register
AssertionError: Expected 200 for new registration, got 429

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/922f8688-b941-4102-8490-ba58940d6b6a/06fdd72a-2080-409d-b0c4-1746ee61d3f8
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC002 post-eco-market-auth-login
- **Test Code:** [TC002_post_eco_market_auth_login.py](./TC002_post_eco_market_auth_login.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 37, in <module>
  File "<string>", line 15, in test_post_eco_market_auth_login
AssertionError: Expected 200, got 429

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/922f8688-b941-4102-8490-ba58940d6b6a/2d8df0b9-20da-4013-b243-3d1136c4a4d4
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC003 post-eco-market-auth-refresh
- **Test Code:** [TC003_post_eco_market_auth_refresh.py](./TC003_post_eco_market_auth_refresh.py)
- **Test Error:** Traceback (most recent call last):
  File "<string>", line 70, in test_post_eco_market_auth_refresh
AssertionError: For invalid token 'invalid.token.value' expected status 401 but got 403

During handling of the above exception, another exception occurred:

Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 86, in <module>
  File "<string>", line 73, in test_post_eco_market_auth_refresh
AssertionError: Invalid refresh token test failed for token 'invalid.token.value': For invalid token 'invalid.token.value' expected status 401 but got 403

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/922f8688-b941-4102-8490-ba58940d6b6a/0354cdfd-0608-40aa-8e48-2fae45fa11cb
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC004 put-eco-market-auth-update
- **Test Code:** [TC004_put_eco_market_auth_update.py](./TC004_put_eco_market_auth_update.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/922f8688-b941-4102-8490-ba58940d6b6a/551e338f-0e89-47ca-a2dd-19741d0acb15
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC005 get-eco-market-products-featured
- **Test Code:** [TC005_get_eco_market_products_featured.py](./TC005_get_eco_market_products_featured.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 35, in <module>
  File "<string>", line 23, in test_get_eco_market_products_featured
AssertionError: Response JSON is not a list

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/922f8688-b941-4102-8490-ba58940d6b6a/416c6dbc-0844-4d4d-be37-9c974b3a84a1
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC006 post-eco-market-products
- **Test Code:** [TC006_post_eco_market_products.py](./TC006_post_eco_market_products.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 71, in <module>
  File "<string>", line 34, in test_post_eco_market_products
AssertionError: Expected 200 but got 400

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/922f8688-b941-4102-8490-ba58940d6b6a/3f3e2272-1d99-466d-aaaa-44022f9876c9
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC007 patch-eco-market-products-productid-status
- **Test Code:** [TC007_patch_eco_market_products_productid_status.py](./TC007_patch_eco_market_products_productid_status.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 95, in <module>
  File "<string>", line 57, in test_patch_product_status
  File "<string>", line 17, in create_non_admin_token
AssertionError: Login failed for non-admin user: 429 {"success":false,"message":"Too many authentication attempts, please try again later."}

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/922f8688-b941-4102-8490-ba58940d6b6a/43a40cae-7839-46c7-b340-09e1f1fdbe55
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC008 post-eco-market-orders
- **Test Code:** [TC008_post_eco_market_orders.py](./TC008_post_eco_market_orders.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 55, in <module>
  File "<string>", line 43, in test_post_eco_market_orders_business_rule_violation
AssertionError: Expected 400 status code for business rule violation, got 500

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/922f8688-b941-4102-8490-ba58940d6b6a/dbcc30df-8773-4e3a-b547-01fd31f8a862
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC009 get-eco-market-cart
- **Test Code:** [TC009_get_eco_market_cart.py](./TC009_get_eco_market_cart.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 32, in <module>
  File "<string>", line 25, in test_get_eco_market_cart
AssertionError: Expected 401 without token, got 403

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/922f8688-b941-4102-8490-ba58940d6b6a/e1d8387e-a7e4-4e6b-88e7-207874938730
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC010 post-eco-market-sellers-register
- **Test Code:** [TC010_post_eco_market_sellers_register.py](./TC010_post_eco_market_sellers_register.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 46, in <module>
  File "<string>", line 31, in test_post_eco_market_sellers_register
AssertionError: Expected 200 OK. Got 400. Response: {"success":false,"message":"Vui lòng tải lên ảnh CCCD mặt trước và mặt sau"}

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/922f8688-b941-4102-8490-ba58940d6b6a/ed45e48c-b61d-482a-8cce-e75bd4206e0a
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC011 post-eco-market-auth-forgot-password
- **Test Code:** [TC011_post_eco_market_auth_forgot_password.py](./TC011_post_eco_market_auth_forgot_password.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 45, in <module>
  File "<string>", line 27, in test_post_eco_market_auth_forgot_password
AssertionError: Unexpected status code 429

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/922f8688-b941-4102-8490-ba58940d6b6a/a8783fd0-f717-4009-8116-bb7ddd24cb1c
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC012 post-eco-market-auth-reset-password
- **Test Code:** [TC012_post_eco_market_auth_reset_password.py](./TC012_post_eco_market_auth_reset_password.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 37, in <module>
  File "<string>", line 24, in test_post_eco_market_auth_reset_password_invalid_token_and_payload
AssertionError: Expected status code 400 or 401, got 429

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/922f8688-b941-4102-8490-ba58940d6b6a/33d0b6f4-34f0-4135-9052-9aac1f27684f
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC013 get-eco-market-orders-my-orders
- **Test Code:** [TC013_get_eco_market_orders_my_orders.py](./TC013_get_eco_market_orders_my_orders.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 55, in <module>
  File "<string>", line 32, in test_get_eco_market_orders_my_orders
AssertionError: Expected list of orders, got <class 'dict'>

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/922f8688-b941-4102-8490-ba58940d6b6a/d1a38d77-3046-4ee4-b4bf-1058edcd9da3
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC014 get-eco-market-chat-conversations
- **Test Code:** [TC014_get_eco_market_chat_conversations.py](./TC014_get_eco_market_chat_conversations.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 41, in <module>
  File "<string>", line 17, in test_get_eco_market_chat_conversations
AssertionError: Expected 401 Unauthorized without token, got 403

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/922f8688-b941-4102-8490-ba58940d6b6a/2ec6c8e4-a857-441c-8ee6-0cce4fced4b7
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC015 get-eco-market-notifications
- **Test Code:** [TC015_get_eco_market_notifications.py](./TC015_get_eco_market_notifications.py)
- **Test Error:** Traceback (most recent call last):
  File "/var/task/handler.py", line 258, in run_with_retry
    exec(code, exec_env)
  File "<string>", line 30, in <module>
  File "<string>", line 17, in test_get_eco_market_notifications
AssertionError: Authenticated response should be a list of notifications

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/922f8688-b941-4102-8490-ba58940d6b6a/1671b259-892b-406d-8021-ed119b899b19
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---


## 3️⃣ Coverage & Matching Metrics

- **6.67** of tests passed

| Requirement        | Total Tests | ✅ Passed | ❌ Failed  |
|--------------------|-------------|-----------|------------|
| ...                | ...         | ...       | ...        |
---


## 4️⃣ Key Gaps / Risks
{AI_GNERATED_KET_GAPS_AND_RISKS}
---