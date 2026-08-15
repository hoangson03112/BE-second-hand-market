const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ORDER_STATUS,
  VALID_TRANSITIONS,
  validateOrderStatusTransition,
  getStatusTimestampField,
} = require("../src/utils/orderStateMachine");

/**
 * Máy trạng thái đơn hàng — chỗ mà một lỗi sẽ khiến đơn kẹt vĩnh viễn hoặc
 * nhảy sang trạng thái không hợp lệ với schema.
 */

/* ── Bất biến của bảng chuyển trạng thái ───────────────────────── */

test("mọi đích đến đều là status hợp lệ (khớp enum của Order model)", () => {
  const targets = [...new Set(Object.values(VALID_TRANSITIONS).flat())];
  const invalid = targets.filter((t) => !ORDER_STATUS.includes(t));

  assert.deepEqual(
    invalid,
    [],
    `Chuyển sang status không có trong ORDER_STATUS thì Mongoose sẽ từ chối khi save. Sai: ${invalid.join(", ")}`,
  );
});

test("mọi status đều khai báo được chuyển đi đâu", () => {
  const missing = ORDER_STATUS.filter((s) => !(s in VALID_TRANSITIONS));

  assert.deepEqual(
    missing,
    [],
    `Status không có trong VALID_TRANSITIONS sẽ làm validate ném "Unknown order status". Thiếu: ${missing.join(", ")}`,
  );
});

test("không status nào tự chuyển sang chính nó", () => {
  const selfLoops = Object.entries(VALID_TRANSITIONS)
    .filter(([from, tos]) => tos.includes(from))
    .map(([from]) => from);

  assert.deepEqual(selfLoops, []);
});

test("mọi status (trừ pending) đều tới được từ pending", () => {
  const seen = new Set(["pending"]);
  const queue = ["pending"];

  while (queue.length) {
    for (const next of VALID_TRANSITIONS[queue.shift()] ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }

  const unreachable = ORDER_STATUS.filter((s) => !seen.has(s));
  assert.deepEqual(
    unreachable,
    [],
    `Status không bao giờ tới được thì là code chết: ${unreachable.join(", ")}`,
  );
});

/* ── Trạng thái kết thúc ────────────────────────────────────────── */

for (const terminal of ["completed", "cancelled", "refunded"]) {
  test(`"${terminal}" là trạng thái kết thúc — không đi tiếp được`, () => {
    assert.deepEqual(VALID_TRANSITIONS[terminal], []);

    for (const target of ORDER_STATUS) {
      assert.throws(
        () => validateOrderStatusTransition(terminal, target),
        /Cannot transition/,
        `${terminal} -> ${target} lẽ ra phải bị chặn`,
      );
    }
  });
}

/* ── Đường đi nghiệp vụ ─────────────────────────────────────────── */

test("luồng giao hàng thành công chạy trọn vẹn", () => {
  const happyPath = [
    "pending",
    "confirmed",
    "picked_up",
    "shipping",
    "out_for_delivery",
    "delivered",
    "completed",
  ];

  for (let i = 0; i < happyPath.length - 1; i++) {
    assert.doesNotThrow(
      () => validateOrderStatusTransition(happyPath[i], happyPath[i + 1]),
      `${happyPath[i]} -> ${happyPath[i + 1]} phải hợp lệ`,
    );
  }
});

test("luồng hoàn tiền: delivered -> refund -> refunded", () => {
  assert.doesNotThrow(() => validateOrderStatusTransition("delivered", "refund"));
  assert.doesNotThrow(() => validateOrderStatusTransition("refund", "refunded"));
});

test("hoàn tiền bị từ chối thì đơn vẫn hoàn tất được", () => {
  // Thiếu lối này, đơn bị từ chối hoàn tiền sẽ nằm mãi ở "refund" vì lối ra
  // duy nhất là "refunded" — trạng thái không bao giờ tới được.
  assert.doesNotThrow(() => validateOrderStatusTransition("refund", "completed"));
});

test("giao thất bại + trả tiền trước: hàng về rồi mở được luồng hoàn tiền", () => {
  assert.doesNotThrow(() => validateOrderStatusTransition("returned", "refund"));
});

test("không status nào là ngõ cụt ngoài các trạng thái kết thúc", () => {
  const TERMINAL = new Set(["completed", "cancelled", "refunded"]);
  const deadEnds = ORDER_STATUS.filter(
    (s) => !TERMINAL.has(s) && VALID_TRANSITIONS[s].length === 0,
  );

  assert.deepEqual(
    deadEnds,
    [],
    `Đơn kẹt ở các status này và không bao giờ kết thúc: ${deadEnds.join(", ")}`,
  );
});

test("chỉ hủy được khi chưa lấy hàng", () => {
  assert.doesNotThrow(() => validateOrderStatusTransition("pending", "cancelled"));
  assert.doesNotThrow(() => validateOrderStatusTransition("confirmed", "cancelled"));

  for (const late of ["picked_up", "shipping", "out_for_delivery", "delivered"]) {
    assert.throws(
      () => validateOrderStatusTransition(late, "cancelled"),
      /Cannot transition/,
      `Hủy đơn ở "${late}" lẽ ra phải bị chặn — hàng đã rời kho`,
    );
  }
});

test("không nhảy cóc qua bước vận chuyển", () => {
  assert.throws(() => validateOrderStatusTransition("pending", "delivered"), /Cannot transition/);
  assert.throws(() => validateOrderStatusTransition("confirmed", "shipping"), /Cannot transition/);
  assert.throws(() => validateOrderStatusTransition("picked_up", "delivered"), /Cannot transition/);
});

test("giao trực tiếp: confirmed -> delivered được phép (local_pickup)", () => {
  assert.doesNotThrow(() => validateOrderStatusTransition("confirmed", "delivered"));
});

test("luồng giao thất bại: hàng quay về người bán", () => {
  const returnPath = ["out_for_delivery", "delivery_failed", "returning", "returned"];

  for (let i = 0; i < returnPath.length - 1; i++) {
    assert.doesNotThrow(
      () => validateOrderStatusTransition(returnPath[i], returnPath[i + 1]),
      `${returnPath[i]} -> ${returnPath[i + 1]} phải hợp lệ`,
    );
  }
});

test("giao thất bại không phải ngõ cụt", () => {
  // Bug cũ: delivery_failed trỏ tới "returning" — một status ngoài enum. Đơn
  // ghi được vào DB rồi kẹt vĩnh viễn vì validate lần sau ném "Unknown status".
  assert.ok(
    VALID_TRANSITIONS.delivery_failed.length > 0,
    "delivery_failed phải đi tiếp được, nếu không đơn kẹt",
  );

  for (const next of VALID_TRANSITIONS.delivery_failed) {
    assert.ok(
      next in VALID_TRANSITIONS,
      `"${next}" phải có mục riêng trong VALID_TRANSITIONS, nếu không lần chuyển sau sẽ ném "Unknown order status"`,
    );
  }
});

test("mọi đích đến đều tự khai báo được đi tiếp đâu", () => {
  // Chặt hơn "mọi status đều có mục": bắt cả trường hợp đích nằm ngoài
  // ORDER_STATUS lẫn ngoài VALID_TRANSITIONS.
  const orphans = [...new Set(Object.values(VALID_TRANSITIONS).flat())].filter(
    (t) => !(t in VALID_TRANSITIONS),
  );

  assert.deepEqual(orphans, []);
});

/* ── Thông báo lỗi ──────────────────────────────────────────────── */

test("status lạ báo lỗi rõ ràng", () => {
  assert.throws(
    () => validateOrderStatusTransition("khong_ton_tai", "confirmed"),
    /Unknown order status: "khong_ton_tai"/,
  );
});

test("lỗi chuyển trạng thái có liệt kê các bước hợp lệ", () => {
  assert.throws(() => validateOrderStatusTransition("pending", "delivered"), (err) => {
    assert.match(err.message, /confirmed/);
    assert.match(err.message, /cancelled/);
    return true;
  });
});

test("trạng thái kết thúc báo rõ là terminal", () => {
  assert.throws(
    () => validateOrderStatusTransition("completed", "refund"),
    /none \(terminal state\)/,
  );
});

/* ── Trường timestamp ───────────────────────────────────────────── */

test("mọi status (trừ pending) đều có trường timestamp", () => {
  const missing = ORDER_STATUS.filter(
    (s) => s !== "pending" && !getStatusTimestampField(s),
  );

  assert.deepEqual(
    missing,
    [],
    `Thiếu timestamp thì không truy vết được đơn đã đổi trạng thái lúc nào: ${missing.join(", ")}`,
  );
});

test("status không xác định trả null thay vì ném lỗi", () => {
  assert.equal(getStatusTimestampField("khong_ton_tai"), null);
});
