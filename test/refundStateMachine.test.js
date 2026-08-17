"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  REFUND_STATUS,
  VALID_REFUND_TRANSITIONS,
  validateRefundStatusTransition
} = require("../src/utils/refundStateMachine");


test("mọi trạng thái trong REFUND_STATUS đều có khai báo chuyển tiếp", () => {
  for (const status of REFUND_STATUS) {
    assert.ok(
      Array.isArray(VALID_REFUND_TRANSITIONS[status]),
      `Thiếu khai báo chuyển tiếp cho "${status}"`
    );
  }
});


test("không có đích đến nào nằm ngoài REFUND_STATUS", () => {
  // Bắt lỗi gõ nhầm tên trạng thái ở vế phải — thứ chỉ lộ ra lúc runtime.
  for (const [from, targets] of Object.entries(VALID_REFUND_TRANSITIONS)) {
    for (const to of targets) {
      assert.ok(
        REFUND_STATUS.includes(to),
        `"${from}" -> "${to}": "${to}" không có trong REFUND_STATUS`
      );
    }
  }
});


test("không có khai báo thừa ngoài REFUND_STATUS", () => {
  for (const from of Object.keys(VALID_REFUND_TRANSITIONS)) {
    assert.ok(
      REFUND_STATUS.includes(from),
      `"${from}" có khai báo chuyển tiếp nhưng không nằm trong REFUND_STATUS`
    );
  }
});


test("cho phép các bước hợp lệ của luồng hoàn tiền thông thường", () => {
  const happyPath = [
  ["pending", "approved"],
  ["approved", "return_shipping"],
  ["return_shipping", "returning"],
  ["returning", "returned"],
  ["returned", "bank_info_required"],
  ["bank_info_required", "processing"],
  ["processing", "completed"]];

  for (const [from, to] of happyPath) {
    assert.doesNotThrow(
      () => validateRefundStatusTransition(from, to),
      `${from} -> ${to} phải hợp lệ`
    );
  }
});


test("người bán mở kiện hàng thấy hỏng thì được đẩy lên admin phân xử", () => {
  assert.doesNotThrow(() => validateRefundStatusTransition("returned", "disputed"));
});


test("người mua vẫn khiếu nại được sau khi người bán từ chối", () => {
  assert.doesNotThrow(() => validateRefundStatusTransition("rejected", "disputed"));
});


test("admin xử tranh chấp thì đi thẳng tới khâu tiền, không lặp lại chặng gửi trả", () => {
  assert.doesNotThrow(() => validateRefundStatusTransition("disputed", "returned"));
});


test("chặn bước nhảy cóc không hợp lệ", () => {
  assert.throws(
    () => validateRefundStatusTransition("pending", "completed"),
    /Cannot transition refund from "pending" to "completed"/
  );
});


test("completed và cancelled là trạng thái kết thúc", () => {
  for (const terminal of ["completed", "cancelled"]) {
    assert.equal(VALID_REFUND_TRANSITIONS[terminal].length, 0);
    assert.throws(
      () => validateRefundStatusTransition(terminal, "processing"),
      /none \(terminal state\)/
    );
  }
});


test("trạng thái lạ báo lỗi rõ ràng thay vì im lặng bỏ qua", () => {
  assert.throws(
    () => validateRefundStatusTransition("khong_ton_tai", "completed"),
    /Unknown refund status: "khong_ton_tai"/
  );
});
