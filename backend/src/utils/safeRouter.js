const express = require("express");

/**
 * Router tự bắt lỗi async.
 *
 * Express 4 KHÔNG bắt promise rejection từ handler. Một `await` thất bại mà
 * không có try/catch sẽ nổi lên `process.on("unhandledRejection")` trong
 * server.js — nơi đang gọi `process.exit(1)`. Nghĩa là một lần Redis/Mongo
 * chớp nhịp trong bất kỳ route nào cũng đủ giết cả process.
 *
 * Thay vì trông chờ mọi người nhớ bọc `asyncHandler` cho từng route (thực tế
 * mới phủ 64/145), router này bọc sẵn mọi handler được đăng ký — kể cả route
 * viết sau này.
 *
 * Dùng: `const router = safeRouter();` thay cho `express.Router()`.
 */

const METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
  "all",
  "use",
];

const WRAPPED = Symbol("safeRouter.wrapped");

function wrapHandler(fn) {
  if (typeof fn !== "function") return fn;

  // Đã bọc rồi (hoặc bọc lồng qua nhiều lớp) — bỏ qua cho khỏi phí.
  if (fn[WRAPPED]) return fn;

  // Router/app con cũng là function 3 tham số. Bọc chúng sẽ làm mất các thuộc
  // tính Express cần khi mount, nên nhận diện qua `.stack` và trả nguyên.
  if (Array.isArray(fn.stack)) return fn;

  // Middleware xử lý lỗi nhận diện bằng arity 4 — phải giữ đúng arity.
  if (fn.length === 4) {
    const wrapped = function (err, req, res, next) {
      return Promise.resolve(fn(err, req, res, next)).catch(next);
    };
    wrapped[WRAPPED] = true;
    return wrapped;
  }

  const wrapped = function (req, res, next) {
    return Promise.resolve(fn(req, res, next)).catch(next);
  };
  wrapped[WRAPPED] = true;
  return wrapped;
}

function wrapArg(arg) {
  if (Array.isArray(arg)) return arg.map(wrapArg);
  return wrapHandler(arg);
}

/** Bọc một handler lẻ — dùng cho route gắn thẳng lên `app` (ví dụ /health). */
function wrapAsync(fn) {
  return wrapHandler(fn);
}

function safeRouter(options) {
  const router = express.Router(options);

  for (const method of METHODS) {
    const original = router[method].bind(router);
    router[method] = (...args) => original(...args.map(wrapArg));
  }

  return router;
}

module.exports = { safeRouter, wrapAsync };
