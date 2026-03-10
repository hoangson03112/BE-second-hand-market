require("dotenv").config();

/**
 * Application Configuration
 * Centralized configuration management
 */
const config = {
  // Server
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || "development",

  // Database
  database: {
    uri: process.env.MONGODB_URI || "mongodb://localhost:27017/eco-market",
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || "your-secret-key",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  },

  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN || process.env.CLIENT_URL || "https://localhost:3000",
    credentials: true,
  },

  // Frontend URL (redirect sau khi login Google)
  frontendUrl: process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:3000",

  // Cloudinary
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },

  // File Upload
  upload: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 10,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  },

  // Rate Limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
  },
};

module.exports = config;






