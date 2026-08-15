const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const { safeRouter, wrapAsync } = require("../src/utils/safeRouter");

/**
 * Bảo vệ hành vi mà mục 2 vừa sửa: Express 4 không bắt promise rejection từ
 * handler, nên một `await` thất bại sẽ treo request VÀ kích hoạt
 * `unhandledRejection` — mà server.js phản ứng bằng cách tắt process.
 *
 * Nếu ai đó vô tình đổi lại `safeRouter()` thành `express.Router()`, test này
 * phải đỏ.
 */

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function callBoom(buildRoutes) {
  const app = express();
  buildRoutes(app);
  app.use((err, req, res, _next) => res.status(500).json({ message: err.message }));

  const server = await listen(app);
  const { port } = server.address();

  let sawUnhandledRejection = false;
  const onRejection = () => {
    sawUnhandledRejection = true;
  };
  process.on("unhandledRejection", onRejection);

  try {
    const res = await fetch(`http://127.0.0.1:${port}/boom`, {
      signal: AbortSignal.timeout(2000),
    });
    const body = await res.json();
    await new Promise((r) => setTimeout(r, 50));
    return { status: res.status, body, sawUnhandledRejection };
  } finally {
    process.off("unhandledRejection", onRejection);
    await new Promise((r) => server.close(r));
  }
}

test("safeRouter chuyển lỗi async sang errorHandler thay vì treo request", async () => {
  const result = await callBoom((app) => {
    const router = safeRouter();
    router.get("/boom", async () => {
      throw new Error("redis down");
    });
    app.use(router);
  });

  assert.equal(result.status, 500);
  assert.equal(result.body.message, "redis down");
  assert.equal(result.sawUnhandledRejection, false);
});

test("safeRouter bắt cả lỗi từ middleware async trong chuỗi", async () => {
  const result = await callBoom((app) => {
    const router = safeRouter();
    router.get(
      "/boom",
      async () => {
        throw new Error("middleware failed");
      },
      (req, res) => res.send("không bao giờ tới đây"),
    );
    app.use(router);
  });

  assert.equal(result.status, 500);
  assert.equal(result.body.message, "middleware failed");
});

test("wrapAsync bảo vệ route gắn thẳng lên app (như /health)", async () => {
  const result = await callBoom((app) => {
    app.get(
      "/boom",
      wrapAsync(async () => {
        throw new Error("health check failed");
      }),
    );
  });

  assert.equal(result.status, 500);
  assert.equal(result.sawUnhandledRejection, false);
});

test("safeRouter không bọc router con (giữ nguyên khả năng mount)", async () => {
  const app = express();
  const child = safeRouter();
  child.get("/ping", (req, res) => res.json({ ok: true }));

  const parent = safeRouter();
  parent.use("/child", child);
  app.use(parent);

  const server = await listen(app);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/child/ping`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  } finally {
    await new Promise((r) => server.close(r));
  }
});
