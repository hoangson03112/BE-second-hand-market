# 🛒 Second-Hand Market - Backend API

## 📖 Overview
The core backend service for the Second-Hand Market platform. Built with **Node.js** and **Express**, this API is engineered for high performance, scalability, and security. It leverages advanced technologies like **Meilisearch** for lightning-fast product discovery, **Redis** for caching, **Socket.io** for real-time interactions, and **Google Generative AI** for smart features.

## 🚀 Key Features
* **Advanced Search Engine:** Integrated with `Meilisearch` to provide typo-tolerant, ultra-fast product searching and filtering.
* **Real-time Communication:** `Socket.io` integration for live chat between buyers and sellers, and real-time notifications.
* **Robust Authentication & Security:** * JWT-based auth and Google OAuth2 (`passport-google-oauth20`).
  * Enterprise-grade security middleware: `helmet`, `xss-clean`, `express-rate-limit`, and `express-mongo-sanitize` to prevent NoSQL injections and brute-force attacks.
* **Optimized Performance:** In-memory caching using `Redis` (`ioredis` & `@upstash/redis`) and HTTP response `compression`.
* **Smart AI Features:** Powered by `@google/generative-ai` to enhance product descriptions or automate moderation.
* **Media & Communication:** Cloud-based image handling via `Cloudinary` and transactional emails via Brevo/Sendinblue (`sib-api-v3-sdk`).

## 💻 Tech Stack
| Category | Technologies |
| :--- | :--- |
| **Core** | Node.js, Express.js |
| **Database & ORM** | MongoDB (`mongoose`), Prisma ORM |
| **Caching & Search** | Redis, Meilisearch |
| **Real-time** | Socket.io |
| **Security & Auth** | bcrypt, jsonwebtoken, Passport.js, Helmet, XSS-clean |
| **Storage & Utils** | Cloudinary, Multer, Axios, Slugify |

## 🛠️ Getting Started

### Prerequisites
* Node.js (v16+)
* MongoDB & Redis instances running locally or in the cloud.
* Meilisearch instance.

### Installation
1. **Clone the repository:**
   ```bash
   git clone [https://github.com/hoangson03112/BE-second-hand-market.git](https://github.com/hoangson03112/BE-second-hand-market.git)
   cd BE-second-hand-market
   
Install dependencies:
npm install
Environment Setup:
Create a .env file in the root directory. You will need API keys for Cloudinary, Google AI, Brevo, and your Database URI.

Initialize Services (Database & Search Indexes):
# Create database indexes
npm run create-indexes

# Setup and reindex Meilisearch for products
npm run setup-search-indexes
npm run reindex-meili-products
🏃 Running the Application
Development Mode:
npm run dev
Production Mode:
npm run start
Redis Management (Local):
npm run redis:start
npm run redis:clear
📡 API Health Check
Once the server is running, you can verify the status via:
npm run health
# OR make a GET request to http://localhost:5000/health
