/**
 * Input Sanitization Middleware
 * Prevents NoSQL injection and XSS attacks
 */

const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");

/**
 * Sanitize request data to prevent injection attacks
 */
const sanitizeInput = (req, res, next) => {
  // Sanitize req.body, req.query, req.params
  req.body = sanitizeObject(req.body);
  req.query = sanitizeObject(req.query);
  req.params = sanitizeObject(req.params);

  next();
};

/**
 * Recursively sanitize object
 */
function sanitizeObject(obj) {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item));
  }

  const sanitized = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      // Remove keys starting with $ or containing .
      if (key.startsWith("$") || key.includes(".")) {
        continue;
      }
      sanitized[key] = sanitizeObject(obj[key]);
    }
  }

  return sanitized;
}

/**
 * Express middleware wrappers
 */
const preventNoSQLInjection = mongoSanitize({
  replaceWith: "_",
  onSanitize: ({ req, key }) => {
    console.warn(`Potential NoSQL injection attempt blocked: ${key}`);
  },
});

const preventXSS = xss();

module.exports = {
  sanitizeInput,
  preventNoSQLInjection,
  preventXSS,
};
