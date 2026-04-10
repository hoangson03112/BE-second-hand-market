# PRD Test - Backend

## Product
Second-hand Marketplace Backend (`Express + MongoDB + Redis + Socket.IO`)

## Document purpose
This PRD is written for deep system testing (manual + TestSprite). It focuses on business-critical behavior, role permissions, state transitions, negative paths, and cross-module workflows.

---

## 1) Scope and goals

### In scope
- End-to-end API behavior under `/eco-market/*`.
- Authentication, authorization, and role boundaries.
- Core commerce flows: product listing, cart, checkout, order lifecycle, refund lifecycle, seller payout.
- Support modules: address, bank proof, notifications, chat, reviews, reports, blogs, admin moderation.
- Reliability and safety checks: rate limit behavior, validation, idempotency, access control, and failure handling.

### Out of scope
- Third-party provider internal correctness (GHN, Google OAuth, cloud storage internals).
- Frontend rendering correctness (covered in frontend PRD).

### Success criteria
- 100% critical journey coverage (auth -> buy -> fulfill -> dispute -> payout).
- All role-based restrictions are enforced (buyer/seller/admin).
- Sensitive actions fail safely (401/403/400) with stable error schema.

---

## 2) System context

### Tech stack
- Node.js + Express (REST JSON)
- MongoDB (Mongoose)
- Redis/Upstash for cache and performance
- Socket.IO for realtime messaging/notifications
- JWT-based auth + refresh token flow

### Main API mount
- Base prefix: `/eco-market`

### Security and behavior constraints
- Protected routes require bearer token.
- Admin routes require both authentication and admin privilege.
- Public routes must not expose private fields.
- Rate-limited auth flows must return predictable throttling responses.

---

## 3) Personas and permissions

### Guest
- Can browse public catalogs, blogs, product details, and searches.
- Cannot mutate user/cart/order/seller/admin resources.

### Buyer (authenticated user)
- Can manage account profile, addresses, cart, and orders.
- Can request refund and upload evidence where allowed.
- Can create reports and reviews (according to eligibility).

### Seller
- All buyer capabilities plus seller registration and seller operations.
- Can manage own listings and seller order actions.
- Can view wallet/payout related data.

### Admin
- Full moderation and management operations across users/sellers/products/orders/refunds/notifications.

---

## 4) Business modules and endpoint inventory

All paths below are relative to `/eco-market`.

### 4.1 Auth and account
- `POST /auth/register`
- `POST /auth/verify`
- `POST /auth/login`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/auth`
- `POST /auth/verify-google-email`
- `POST /auth/appeal`
- `GET /auth/:id`
- `PUT /auth/update`
- `PUT /auth/change-password`
- `PUT /auth/set-password`
- `GET /auth/admin/list` (admin)
- `PUT /auth/admin/:id/status` (admin)

### 4.2 Categories and catalog
- `GET /categories`
- `POST /categories` (admin)
- `GET /categories/:id`
- `PUT /categories/update`
- `GET /categories/sub`
- `PUT /categories/sub/update`
- `POST /categories/sub/:parentCategoryId`
- `DELETE /categories/:categoryId/sub/:subcategoryId`

### 4.3 Product lifecycle
- `GET /products/featured`
- `GET /products/all`
- `GET /products/categories`
- `GET /products/search`
- `GET /products/:productID`
- `GET /products/my/listings` (auth)
- `GET /products` (admin)
- `POST /products` (auth, multipart)
- `PUT /products/:productId` (auth, multipart)
- `PATCH /products/:productId/status` (admin moderation)
- `DELETE /products/:productId`
- `POST /products/:productId/request-review`

### 4.4 Cart
- `GET /cart`
- `POST /cart/add`
- `DELETE /cart/delete-item`
- `PUT /cart/update-quantity`
- `DELETE /cart/clear`

### 4.5 Order and fulfillment
- `POST /orders/ghn/webhook` (external callback)
- `POST /orders`
- `GET /orders/my-orders`
- `GET /orders/order-details/:id`
- `POST /orders/:id/cancel`
- `PATCH /orders/:id/confirm-received`
- `POST /orders/:id/request-refund`
- `GET /orders/seller/my`
- `PATCH /orders/seller/update/:orderId`
- `GET /orders/seller/payouts`
- `GET /orders/seller/wallet`
- `GET /orders/:id/tracking`
- `GET /orders/:orderId/seller-bank-info`
- `POST /orders/:id/approve-refund`
- `POST /orders/:id/reject-refund`
- `POST /orders/:id/confirm-return-received`
- `POST /orders/:id/refund-bank-info`
- `GET /orders/admin/all` (admin)
- `PATCH /orders/admin/update-status/:id` (admin)
- `POST /orders/:id/confirm-bank-transfer` (admin)
- `POST /orders/:id/confirm-cod-payment` (admin)
- `POST /orders/:id/complete-refund` (admin)
- `POST /orders/:id/payout` (admin)
- `GET /orders/admin/pending-payouts` (admin)

### 4.6 Seller and discount
- `GET /sellers/buyers-chatted`
- `GET /sellers/personal-discount`
- `POST /sellers/personal-discount`
- `DELETE /sellers/personal-discount/:id`
- `GET /sellers/personal-discount/all`
- `POST /sellers/register`
- `GET /sellers/request-status`
- `GET /sellers/product-limit`
- `PUT /sellers/me/bank-info`
- `GET /sellers/admin/all` (admin)
- `GET /sellers/admin/:id` (admin)
- `PUT /sellers/admin/:id/status` (admin)
- `GET /sellers/:accountId`

### 4.7 Refund module
- `POST /refunds`
- `GET /refunds/buyer/my`
- `POST /refunds/:refundId/escalate`
- `GET /refunds/seller/pending`
- `PUT /refunds/:refundId/respond`
- `PUT /refunds/:refundId/complete`
- `GET /refunds/admin/all` (admin)
- `PUT /refunds/:refundId/admin-handle` (admin)
- `GET /refunds/:refundId`

### 4.8 Address and bank proof
- `POST /addresses/create`
- `GET /addresses`
- `PUT /addresses/:id`
- `DELETE /addresses/:id`
- `POST /bank-info/payment-proof`
- `GET /bank-info` (admin)
- `GET /bank-info/:orderId`
- `PATCH /bank-info/verify/:orderId` (admin)

### 4.9 Notification and chat
- `GET /notifications`
- `PATCH /notifications/read-all`
- `PATCH /notifications/read/:id`
- `DELETE /notifications/:id`
- `POST /notifications/admin/broadcast` (admin)
- `GET /notifications/admin/broadcast-history` (admin)
- `GET /chat/conversations`
- `POST /chat/ai/search-products`
- `POST /chat/conversations/findOrCreateWithProduct`
- `GET /chat/optimized/messages/:partnerId`
- `POST /chat/optimized/send`
- `POST /chat/upload`

### 4.10 Blogs, reports, and reviews
- Blogs:
  - `GET /blogs`
  - `POST /blogs/:id/view`
  - `POST /blogs/:id/like`
  - `GET /blogs/:id`
  - `GET /blogs/search/:keyword`
  - `POST /blogs` (admin/editor auth)
  - `PUT /blogs/:id` (auth)
  - `DELETE /blogs/:id` (auth)
  - `GET /blogs/admin/all` (auth)
  - `PATCH /blogs/:id/status` (auth)
- Reports:
  - `POST /reports` (with image upload)
  - `GET /reports`
- Product reviews:
  - `POST /product-reviews`
  - `GET /product-reviews/by-order/:orderId/product/:productId`
  - `GET /product-reviews/product/:productId`
  - `GET /product-reviews/my`
  - `PUT /product-reviews/:reviewId`
  - `DELETE /product-reviews/:reviewId`
- Seller reviews:
  - `POST /seller-reviews`
  - `GET /seller-reviews/by-order/:orderId`
  - `PUT /seller-reviews/:reviewId`

---

## 5) Critical state machines to validate

### 5.1 Product moderation state
- Candidate flow: `draft/pending` -> `approved/active` -> `sold` or `rejected`.
- Tests must verify:
  - Non-admin cannot moderate.
  - Rejected product can request review.
  - Listing visibility changes with status.

### 5.2 Order state
- Candidate flow: `created` -> `payment_confirmed` -> `processing/shipping` -> `delivered` -> `completed`.
- Branches:
  - `cancelled` before lock point.
  - `refund_requested` -> `refund_approved/rejected` -> `refund_completed`.
- Tests must verify transition guards and forbidden jumps.

### 5.3 Refund dispute state
- Buyer create refund -> seller respond -> optional escalate -> admin handle -> complete.
- Must verify ownership and role constraints at every step.

### 5.4 Seller onboarding state
- `not_requested` -> `pending` -> `approved` or `rejected`.
- Verify:
  - Product limit before and after approval.
  - Rejection reason propagation if implemented.

---

## 6) Deep test scenarios (must run)

### A. Auth and identity
- Register with valid payload, duplicate email/phone, invalid format.
- Verify email flow and login before/after verification.
- Refresh token rotation and invalid refresh handling.
- Appeal flow for blocked user.
- Account status update by admin and enforcement on next requests.

### B. Product and catalog
- Create listing with full media payload and without required fields.
- Search/filter behavior for public vs authenticated user.
- Product detail cache behavior and invalidation after update.
- Admin moderation approve/reject and re-request review flow.

### C. Cart to order to settlement
- Add/update/remove/clear cart with multiple sellers.
- Create order with mixed items and validate stock handling.
- Payment confirmation paths (bank transfer, COD).
- Seller update order milestones.
- Buyer confirm-received eligibility checks.

### D. Refund and dispute
- Buyer request refund with evidence images/videos.
- Seller approve/reject paths with auditability.
- Escalation to admin and admin final decision.
- Refund completion and payout side effects.

### E. Seller finance
- Seller wallet and payout listing retrieval.
- Admin pending payouts retrieval and payout trigger.
- Duplicate payout prevention/idempotency check.

### F. Notifications and realtime
- Notification creation after key actions (order, refund, moderation).
- Mark single/all as read behavior.
- Admin broadcast + broadcast history.
- Chat message send/list/history and media upload.

### G. Content and trust
- Report creation with evidence upload.
- Product and seller review eligibility by order ownership.
- Blog read/search/view/like and status governance.

---

## 7) Access control matrix (minimum assertions)

- Guest blocked from all mutation endpoints except explicit public actions.
- Buyer cannot access admin endpoints.
- Seller cannot perform admin-only moderation or account status updates.
- Admin can read/write governance endpoints.
- User A cannot access User B resources:
  - order details
  - cart
  - addresses
  - direct chat history
  - bank proof not belonging to permitted scope

---

## 8) Validation and error contract

### Required error categories
- 400 Validation/business rule errors
- 401 Missing/invalid auth
- 403 Authenticated but forbidden
- 404 Missing resource
- 409 Conflict (if used for duplicates/race)
- 429 Rate limit
- 500 Internal server error

### Response consistency checks
- Error payload must be machine-readable and stable.
- Sensitive internals (stack traces, secrets) must never leak.
- Localization consistency (if VN messages are used) should remain deterministic.

---

## 9) Test data and environment requirements

### Seed accounts
- `buyer_active`
- `seller_active`
- `admin_active`
- `user_blocked`

### Seed catalog/order data
- At least 10 products across >= 3 categories.
- Mixed statuses (approved, pending, rejected, out-of-stock).
- Orders in multiple lifecycle stages.
- At least 1 refund in each status branch.

### Infra prerequisites
- MongoDB reachable.
- Redis/Upstash configured.
- Cloud/media provider configured for upload tests.
- Email provider configured for forgot/reset flow.
- Optional integrations (GHN, OAuth) can be stubbed for deterministic tests.

---

## 10) Non-functional checks

### Reliability
- Repeated create/update requests should not duplicate side effects unexpectedly.
- Concurrent cart/order operations should preserve data integrity.

### Performance
- Public list/search endpoints should meet acceptable response time under cache warm/cold conditions.

### Security
- JWT tampering and expired token checks.
- Input sanitization for text fields and query params.
- Upload constraints (size/type/count) strictly enforced.

---

## 11) Regression suite priorities

### P0 (must pass before release)
- Auth register/login/refresh
- Product create/moderate/search/detail
- Cart add/update/clear
- Order create + key transitions
- Refund create/respond/admin-handle
- Seller register/status/product-limit

### P1
- Notifications, chat, bank proof, reviews, reports, blogs

### P2
- Cache behavior, long-tail edge cases, integration fallback paths

---

## 12) Release exit criteria

- P0 suite pass rate = 100%.
- No open high-severity auth/access-control bug.
- No open high-severity financial/order-state bug.
- Smoke tests pass in CI and staging with deterministic seed data.

\# Product Specification Document (PRD)



\## Product: Second-hand Marketplace Backend (Express + MongoDB)



\---



\## 1. Overview



This backend system supports a second-hand marketplace where users can list, browse, and purchase used items. The system is built using Express.js and MongoDB Atlas.



\---



\## 2. Tech Stack



\* Backend: Express.js (Node.js)

\* Frontend: Next.js (separate)

\* Database: MongoDB Atlas

\* Authentication: JWT (Bearer Token)

\* API Format: RESTful JSON



\---



\## 3. Data Models



\### 3.1 User



{

"\_id": "ObjectId",

"email": "string",

"password": "hashed",

"createdAt": "date"

}



\### 3.2 Product



{

"\_id": "ObjectId",

"title": "string",

"price": "number",

"description": "string",

"category": "string",

"sellerId": "ObjectId",

"createdAt": "date"

}



\---



\## 4. Authentication APIs



\### 4.1 Register



POST /api/auth/register



Request:

{

"email": "\[user@example.com](mailto:user@example.com)",

"password": "123456"

}



Response:

{

"message": "User created successfully"

}



\---



\### 4.2 Login



POST /api/auth/login



Request:

{

"email": "\[user@example.com](mailto:user@example.com)",

"password": "123456"

}



Response:

{

"token": "jwt\_token"

}



\---



\## 5. Product APIs



\### 5.1 Create Product



POST /api/products



Headers:

Authorization: Bearer <token>



Request:

{

"title": "iPhone 11",

"price": 500,

"description": "Good condition",

"category": "electronics"

}



Response:

{

"\_id": "product\_id",

"title": "iPhone 11",

"price": 500

}



\---



\### 5.2 Get All Products



GET /api/products



Response:

\[

{

"\_id": "product\_id",

"title": "iPhone 11",

"price": 500

}

]



\---



\### 5.3 Get Product Detail



GET /api/products/:id



Response:

{

"\_id": "product\_id",

"title": "iPhone 11",

"price": 500,

"description": "Good condition"

}



\---



\### 5.4 Update Product



PUT /api/products/:id



Headers:

Authorization: Bearer <token>



Request:

{

"title": "Updated title",

"price": 600

}



\---



\### 5.5 Delete Product



DELETE /api/products/:id



Headers:

Authorization: Bearer <token>



\---



\## 6. Search API



\### 6.1 Search Products



GET /api/products/search?q=iphone



Response:

\[

{

"\_id": "product\_id",

"title": "iPhone 11"

}

]



\---



\## 7. Error Handling



\* 200: Success

\* 201: Created

\* 400: Bad Request

\* 401: Unauthorized

\* 404: Not Found

\* 500: Server Error



All errors return:

{

"message": "Error description"

}



\---



\## 8. Validation Rules



\* Email must be valid format

\* Password minimum 6 characters

\* Price must be a positive number

\* Title cannot be empty

\* Unauthorized requests must be rejected



\---



\## 9. Edge Cases



\* Missing fields in request

\* Invalid ObjectId

\* Unauthorized access

\* Product not found

\* Empty search results



\---



\## 10. Notes



\* All endpoints use JSON

\* MongoDB uses ObjectId for IDs

\* JWT must be included in protected routes

\* API base URL: /api



\---



