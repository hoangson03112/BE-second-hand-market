require("dotenv").config();





const config = {

  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || "development",


  database: {
    uri: process.env.MONGODB_URI || "mongodb://localhost:27017/eco-market",
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }
  },


  jwt: {
    secret: process.env.JWT_SECRET || "your-secret-key",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d"
  },


  cors: {
    origin: process.env.CORS_ORIGIN || process.env.CLIENT_URL || "https://localhost:3000",
    credentials: true
  },


  frontendUrl: process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:3000",


  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET
  },


  upload: {
    maxFileSize: 10 * 1024 * 1024,
    maxFiles: 10,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"]
  },


  rateLimit: {
    windowMs: 15 * 60 * 1000,
    max: 100
  }
};

module.exports = config;