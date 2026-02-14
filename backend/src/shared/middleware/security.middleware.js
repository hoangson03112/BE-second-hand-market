const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const compression = require('compression');

function configureHelmet() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hidePoweredBy: true,
  });
}

function configureMongoSanitize() {
  return mongoSanitize({
    replaceWith: '_',
    onSanitize: ({ key }) => console.warn(`⚠️ NoSQL injection attempt: ${key}`),
  });
}

function configureXSSProtection() {
  return xss();
}

function configureCompression() {
  return compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers['x-no-compression']) return false;
      return compression.filter(req, res);
    },
  });
}

function sanitizeInputs(req, res, next) {
  const sanitize = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        obj[key] = obj[key].replace(/\0/g, '').trim();
      } else if (typeof obj[key] === 'object') {
        sanitize(obj[key]);
      }
    }
    return obj;
  };
  
  if (req.body) sanitize(req.body);
  if (req.query) sanitize(req.query);
  if (req.params) sanitize(req.params);
  next();
}

function customSecurityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
}

function applySecurityMiddleware() {
  return [
    configureHelmet(),
    configureMongoSanitize(),
    configureXSSProtection(),
    sanitizeInputs,
    customSecurityHeaders,
    configureCompression(),
  ];
}

module.exports = {
  configureHelmet,
  configureMongoSanitize,
  configureXSSProtection,
  configureCompression,
  sanitizeInputs,
  customSecurityHeaders,
  applySecurityMiddleware,
};
