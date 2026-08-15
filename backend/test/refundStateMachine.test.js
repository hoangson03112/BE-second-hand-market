const test = require("node:test");
const assert = require("node:assert/strict");

const {
  REFUND_STATUS,
  VALID_REFUND_TRANSITIONS,
  validateRefundStatusTransition,
} = require("../src/utils/refundStateMachine");

/**
 * Máy trạng thái hoàn tiền — mỗi lỗi ở đây là tiền thật chuyển nhầm hoặc
 * người mua trả hàng xong mà không bao giờ nhận lại được tiền.
 */

/* ── Bất biến của bảng chuyển trạng thái ───────────────────────── */

test("mọi đích đến đều là status hợp lệ (khớp enum của Refund model)", () => {
  const targets = [...new Set(Object.values(VALID_REFUND_TRANSITIONS).flat())];
  const invalid = targets.filter((t) => !REFUND_STATUS.includes(t));

  assert.deepEqual(
    invalid,
    [],
    `Chuyển sang status không có trong REFUND_STATUS thì Mongoose sẽ từ chối khi save. Sai: ${invalid.join(", ")}`,
  );
});

test("mọi status đều khai báo được chuyển đi đâu", () => {
  const missing = REFUND_STATUS.filter((s) => !(s in VALID_REFUND_TRANSITIONS));

  assert.deepEqual(
    missing,
    [],
    `Status không có trong VALID_REFUND_TRANSITIONS sẽ làm validate ném "Unknown refund status". Thiếu: ${missing.join(", ")}`,
  );
});

test("không status nào tự chuyển sang chính nó", () => {
  const selfLoops = Object.entries(VALID_REFUND_TRANSITIONS)
    .filter(([from, tos]) => tos.includes(from))
    .map(([from]) => from);

  assert.deepEqual(selfLoops, []);
});

test("mọi status (trừ pending) đều tới được từ pending", () => {
  const seen = new Set(["pending"]);
  const queue = ["pending"];

  while (queue.length) {
    for (const next of VALID_REFUND_TRANSITIONS[queue.shift()] ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }

  const unreachable = REFUND_STATUS.filter((s) => !seen.has(s));
  assert.deepEqual(
    unreachable,
    [],
    `Status không bao giờ tới được thì là code chết: ${unreachable.join(", ")}`,
  );
});

test("mọi status chưa kết thúc đều còn đường tới completed", () => {
  // Bất biến quan trọng nhất: không có ngõ cụt nào giữ tiền của người mua.
  const canReachCompleted = (from) => {
    const seen = new Set([from]);
    const queue = [from];
    while (queue.length) {
      for (const next of VALID_REFUND_TRANSITIONS[queue.shift()] ?? []) {
        if (next === "completed") return true;
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return false;
  };

  const stuck = REFUND_STATUS.filter(
    (s) => VALID_REFUND_TRANSITIONS[s].length > 0 && !canReachCompleted(s),
  );

  assert.deepEqual(
    stuck,
    [],
    `Yêu cầu hoàn tiền ở các status này không bao giờ tới được "completed" — tiền kẹt: ${stuck.join(", ")}`,
  );
});

/* ── Trạng thái kết thúc ────────────────────────────────────────── */

for (const terminal of ["completed", "cancelled"]) {
  test(`"${terminal}" là trạng thái kết thúc — không đi tiếp được`, () => {
    assert.deepEqual(VALID_REFUND_TRANSITIONS[terminal], []);

    for (const target of REFUND_STATUS) {
      assert.throws(
        () => validateRefundStatusTransition(terminal, target),
        /Cannot transition refund/,
        `${terminal} -> ${target} lẽ ra phải bị chặn`,
      );
    }
  });
}

test("hoàn tiền xong không hoàn lại lần nữa", () => {
  // Chi tiền hai lần cho cùng một yêu cầu là mất tiền thật.
  assert.throws(
    () => validateRefundStatusTransition("completed", "processing"),
    /none \(terminal state\)/,
  );
  assert.throws(
    () => validateRefundStatusTransition("completed", "bank_info_required"),
    /none \(terminal state\)/,
  );
});

/* ── Đường đi nghiệp vụ ─────────────────────────────────────────── */

test("luồng hoàn tiền đầy đủ: có trả hàng về", () => {
  const path = [
    "pending",
    "approved",
    "return_shipping",
    "returning",
    "returned",
    "bank_info_required",
    "processing",
    "completed",
  ];

  for (let i = 0; i < path.length - 1; i++) {
    assert.doesNotThrow(
      () => validateRefundStatusTransition(path[i], path[i + 1]),
      `${path[i]} -> ${path[i + 1]} phải hợp lệ`,
    );
  }
});

test("luồng rút gọn: đã có thông tin ngân hàng thì đi thẳng processing", () => {
  assert.doesNotThrow(() => validateRefundStatusTransition("returned", "processing"));
});

test("webhook GHN của đơn trả hàng khớp với máy trạng thái", () => {
  // order.controller.js ánh xạ trạng thái GHN của đơn hoàn về status refund.
  // Nếu bảng chuyển trạng thái lệch với ánh xạ đó, webhook sẽ ném lỗi.
  assert.doesNotThrow(() => validateRefundStatusTransition("return_shipping", "returning"));
  assert.doesNotThrow(() => validateRefundStatusTransition("returning", "returned"));
  assert.doesNotThrow(() => validateRefundStatusTransition("return_shipping", "failed"));
  assert.doesNotThrow(() => validateRefundStatusTransition("returning", "failed"));
});

test("thất bại lúc chuyển tiền thì thử lại được", () => {
  assert.doesNotThrow(() => validateRefundStatusTransition("processing", "failed"));
  assert.doesNotThrow(() => validateRefundStatusTransition("failed", "processing"));
});

test("khiếu nại rồi vẫn duyệt hoặc từ chối được", () => {
  assert.doesNotThrow(() => validateRefundStatusTransition("pending", "disputed"));
  assert.doesNotThrow(() => validateRefundStatusTransition("disputed", "approved"));
  assert.doesNotThrow(() => validateRefundStatusTransition("disputed", "rejected"));
});

test("người bán bị từ chối vẫn khiếu nại lên admin được", () => {
  // escalateToAdmin đã làm việc này trong code nhưng bảng cũ khai "rejected"
  // là terminal — nghĩa là bước đó chạy ngoài vòng kiểm soát của máy trạng thái.
  assert.doesNotThrow(() => validateRefundStatusTransition("rejected", "disputed"));
});

test("nhận lại hàng không nguyên vẹn thì người bán mở tranh chấp được", () => {
  // Quy tắc nghiệp vụ: chỉ hoàn tiền khi hàng về còn nguyên. Không có lối này
  // thì người bán bấm xác nhận đã nhận là mất quyền từ chối.
  assert.doesNotThrow(() => validateRefundStatusTransition("returned", "disputed"));
});

test("tranh chấp lúc kiểm hàng: admin xử cho người mua thì về thẳng khâu tiền", () => {
  // Hàng đã nằm ở chỗ người bán rồi, không lặp lại chặng gửi trả.
  assert.doesNotThrow(() => validateRefundStatusTransition("disputed", "returned"));
});

test("không status nào là ngõ cụt ngoài các trạng thái kết thúc", () => {
  const TERMINAL = new Set(["completed", "cancelled"]);
  const deadEnds = REFUND_STATUS.filter(
    (s) => !TERMINAL.has(s) && VALID_REFUND_TRANSITIONS[s].length === 0,
  );

  assert.deepEqual(
    deadEnds,
    [],
    `Yêu cầu hoàn tiền kẹt ở các status này: ${deadEnds.join(", ")}`,
  );
});

test("không chi tiền khi chưa nhận lại hàng", () => {
  for (const early of ["pending", "approved", "return_shipping", "returning", "disputed"]) {
    assert.throws(
      () => validateRefundStatusTransition(early, "completed"),
      /Cannot transition refund/,
      `Hoàn tiền ở "${early}" lẽ ra phải bị chặn — hàng chưa về`,
    );
    assert.throws(
      () => validateRefundStatusTransition(early, "processing"),
      /Cannot transition refund/,
      `Chuyển tiền ở "${early}" lẽ ra phải bị chặn — hàng chưa về`,
    );
  }
});

test("không bỏ qua bước duyệt", () => {
  assert.throws(
    () => validateRefundStatusTransition("pending", "return_shipping"),
    /Cannot transition refund/,
  );
  assert.throws(
    () => validateRefundStatusTransition("pending", "returned"),
    /Cannot transition refund/,
  );
});

test("chỉ huỷ được khi còn đang chờ duyệt", () => {
  assert.doesNotThrow(() => validateRefundStatusTransition("pending", "cancelled"));

  for (const late of ["approved", "return_shipping", "returning", "returned", "processing"]) {
    assert.throws(
      () => validateRefundStatusTransition(late, "cancelled"),
      /Cannot transition refund/,
      `Huỷ yêu cầu ở "${late}" lẽ ra phải bị chặn — quy trình đã chạy`,
    );
  }
});

/* ── Thông báo lỗi ──────────────────────────────────────────────── */

test("status lạ báo lỗi rõ ràng", () => {
  assert.throws(
    () => validateRefundStatusTransition("khong_ton_tai", "approved"),
    /Unknown refund status: "khong_ton_tai"/,
  );
});

test("lỗi chuyển trạng thái có liệt kê các bước hợp lệ", () => {
  assert.throws(() => validateRefundStatusTransition("pending", "completed"), (err) => {
    assert.match(err.message, /approved/);
    assert.match(err.message, /rejected/);
    return true;
  });
});
