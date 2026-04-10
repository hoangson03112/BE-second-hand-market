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



