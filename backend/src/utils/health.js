const mongoose = require("mongoose");
const { getRedisService } = require("../config/redis");

/**
 * Probe cho health check.
 *
 * Nguyên tắc: probe KHÔNG bao giờ được ném lỗi và KHÔNG bao giờ được treo.
 * Một health endpoint treo còn tệ hơn endpoint trả lỗi — load balancer sẽ giữ
 * connection cho tới khi timeout, và với `/health` bị cron gọi 5 phút/lần thì
 * nó tích lũy thành rò rỉ.
 */

const DEFAULT_TIMEOUT_MS = 2000;

/**
 * Cờ báo đang tắt. Khi bật, `/health/ready` trả 503 ngay để load balancer
 * ngừng đẩy traffic *trước khi* server đóng — nếu không, request mới vẫn tới
 * trong lúc đang drain và bị đứt giữa chừng.
 */
let shuttingDown = false;

function setShuttingDown(value) {
  shuttingDown = Boolean(value);
}

function isShuttingDown() {
  return shuttingDown;
}

/** Chạy `promise`, nhưng bỏ cuộc sau `ms` thay vì chờ vô hạn. */
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout sau ${ms}ms`)), ms);
    // Không giữ event loop sống chỉ vì cái timer này.
    if (typeof timer.unref === "function") timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const MONGO_STATE = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
};

async function checkMongo(timeoutMs = DEFAULT_TIMEOUT_MS) {
  const state = mongoose.connection.readyState;
  if (state !== 1) {
    return { ok: false, detail: MONGO_STATE[state] ?? `state=${state}` };
  }

  // readyState chỉ nói driver nghĩ là đang kết nối. Ping mới biết server còn trả lời.
  try {
    await withTimeout(mongoose.connection.db.admin().ping(), timeoutMs, "mongo");
    return { ok: true, detail: "connected" };
  } catch (error) {
    return { ok: false, detail: error.message };
  }
}

async function checkRedis(timeoutMs = DEFAULT_TIMEOUT_MS) {
  try {
    const redis = getRedisService();
    if (!redis) return { ok: false, detail: "chưa khởi tạo" };

    const alive = await withTimeout(redis.ping(), timeoutMs, "redis");
    return alive
      ? { ok: true, detail: "connected" }
      : { ok: false, detail: "ping thất bại" };
  } catch (error) {
    return { ok: false, detail: error.message };
  }
}

/** Chạy song song để tổng thời gian bằng probe chậm nhất, không phải tổng các probe. */
async function checkDependencies(timeoutMs = DEFAULT_TIMEOUT_MS) {
  const [mongo, redis] = await Promise.all([
    checkMongo(timeoutMs),
    checkRedis(timeoutMs),
  ]);

  return {
    ok: mongo.ok && redis.ok,
    checks: { mongo, redis },
  };
}

module.exports = {
  checkMongo,
  checkRedis,
  checkDependencies,
  setShuttingDown,
  isShuttingDown
};
