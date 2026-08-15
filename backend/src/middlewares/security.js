const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
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
        frameSrc: ["'none'"]
      }
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hidePoweredBy: true
  });
}

function configureMongoSanitize() {
  return mongoSanitize({
    replaceWith: '_',
    onSanitize: ({ key }) => console.warn(`⚠️ NoSQL injection attempt: ${key}`)
  });
}

/*
 * Đã gỡ `xss-clean` (không còn maintain từ 2022).
 *
 * Lý do không thay bằng gói tương đương: sanitize đầu VÀO là sai chỗ. Nó ghi
 * đè dữ liệu gốc của người dùng trong DB, trong khi XSS là vấn đề của khâu
 * hiển thị. Đo trên dữ liệu thật của sàn, xss-clean làm hỏng:
 *
 *   "Bàn gỗ 120<>80cm"      -> "Bàn gỗ 120&lt;>80cm"
 *   "giảm còn <300k"        -> "giảm còn &lt;300k"
 *   "sạc <2h là đầy"        -> "sạc &lt;2h là đầy"
 *
 * Những chuỗi đó bị lưu vào DB kèm HTML entity, và vì React escape lúc render
 * nên người dùng nhìn thấy đúng chữ "&lt;" trên màn hình.
 *
 * Lớp phòng vệ thật sự đang có:
 *   - React escape mặc định khi render (không dùng dangerouslySetInnerHTML)
 *   - helmet CSP chặn inline script
 *   - express-mongo-sanitize chặn NoSQL injection
 *   - sanitizeInputs bên dưới xoá null byte và trim
 */

function configureCompression() {
  return compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers['x-no-compression']) return false;
      return compression.filter(req, res);
    }
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
  sanitizeInputs,
  customSecurityHeaders,
  configureCompression()];

}

module.exports = {
  configureHelmet,
  configureMongoSanitize,
  configureCompression,
  sanitizeInputs,
  customSecurityHeaders,
  applySecurityMiddleware
};