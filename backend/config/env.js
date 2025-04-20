/**
 * Environment configuration for the application
 * Centralizes all environment variables with defaults
 */
const dotenv = require('dotenv');
const path = require('path');

// Load .env file based on environment
const environment = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env${environment !== 'development' ? '.' + environment : ''}`);

dotenv.config({ path: envPath });

module.exports = {
  // Server configuration
  PORT: process.env.PORT || 2000,
  NODE_ENV: environment,
  
  // Database configuration
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/Second_Hand_Maket',
  
  // Authentication
  JWT_SECRET: process.env.JWT_SECRET || 'sown',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1d',
  
  // Email configuration
  EMAIL_USERNAME: process.env.USERNAME_GMAIL,
  EMAIL_PASSWORD: process.env.PASSWORD_GMAIL,
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 2, // Default to INFO level
  
  // CORS
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*'
}; 