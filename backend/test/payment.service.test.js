const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const Order = require("../src/models/Order");
const PaymentService = require("../src/services/payment.service");

/**
 * PaymentService là nơi đơn hàng được đánh dấu đã trả tiền. Một lỗi ở đây
 * nghĩa là hàng giao đi mà không thu được tiền, hoặc thu tiền hai lần.
 *
 * Test ở đây mock tầng mongoose thay vì cần DB thật: transaction đòi hỏi
 * replica set, mà CI không có. Đổi lại ta kiểm được toàn bộ nhánh rẽ —
 * idempotency, chặn sai phương thức, và transaction có được đóng đúng không.
 */

/* ── Bộ giả lập tầng mongoose ───────────────────────────────────── */

function makeSession() {
  const calls = [];
  return {
    calls,
    startTransaction: () => calls.push("start"),
    commitTransaction: async () => calls.push("commit"),
    abortTransaction: async () => calls.push("abort"),
    endSession: () => calls.push("end"),
  };
}

function makeOrder(fields) {
  const order = { saved: 0, ...fields };
  order.save = async ({ session } = {}) => {
    order.saved++;
    order.savedWithSession = session;
    return order;
  };
  return order;
}

/**
 * Gắn mock cho `mongoose.startSession` và `Order.findById`.
 * Trả về session để test kiểm tra thứ tự commit/abort/end.
 */
function stub(t, order, { onFind } = {}) {
  const session = makeSession();

  t.mock.method(mongoose, "startSession", async () => session);
  t.mock.method(Order, "findById", () => ({
    session: async () => {
      if (onFind) onFind();
      return order;
    },
  }));

  return session;
}

/* ── COD ────────────────────────────────────────────────────────── */

test("COD: đánh dấu đã trả tiền và commit transaction", async (t) => {
  const order = makeOrder({ paymentMethod: "cod", paymentStatus: "unpaid" });
  const session = stub(t, order);

  const result = await PaymentService.confirmCODPayment("order-1");

  assert.equal(result.paymentStatus, "paid");
  assert.equal(order.saved, 1);
  assert.equal(order.savedWithSession, session, "save phải chạy trong transaction");
  assert.deepEqual(session.calls, ["start", "commit", "end"]);
});

test("COD: gọi lại lần hai không ghi đè và không commit", async (t) => {
  // Webhook của cổng thanh toán hay bắn trùng. Trả tiền hai lần là mất tiền.
  const order = makeOrder({ paymentMethod: "cod", paymentStatus: "paid" });
  const session = stub(t, order);

  const result = await PaymentService.confirmCODPayment("order-1");

  assert.equal(result, order);
  assert.equal(order.saved, 0, "đơn đã trả tiền thì không được ghi lại");
  assert.deepEqual(session.calls, ["start", "abort", "end"]);
});

test("COD: từ chối đơn không phải COD", async (t) => {
  const order = makeOrder({ paymentMethod: "bank_transfer", paymentStatus: "unpaid" });
  const session = stub(t, order);

  await assert.rejects(
    () => PaymentService.confirmCODPayment("order-1"),
    /non-COD order/,
  );
  assert.equal(order.saved, 0);
  assert.deepEqual(session.calls, ["start", "abort", "end"]);
});

test("COD: đơn không tồn tại thì rollback chứ không treo transaction", async (t) => {
  const session = stub(t, null);

  await assert.rejects(
    () => PaymentService.confirmCODPayment("khong-ton-tai"),
    /Order khong-ton-tai not found/,
  );
  assert.deepEqual(session.calls, ["start", "abort", "end"]);
});

test("COD: save lỗi thì rollback và ném lại lỗi gốc", async (t) => {
  const order = makeOrder({ paymentMethod: "cod", paymentStatus: "unpaid" });
  order.save = async () => {
    throw new Error("mongo write conflict");
  };
  const session = stub(t, order);

  await assert.rejects(
    () => PaymentService.confirmCODPayment("order-1"),
    /mongo write conflict/,
  );
  assert.deepEqual(session.calls, ["start", "abort", "end"]);
});

test("COD: session luôn được đóng kể cả khi lỗi", async (t) => {
  // Không endSession là rò session pool — server chết dần dưới tải.
  const session = stub(t, null);

  await assert.rejects(() => PaymentService.confirmCODPayment("x"));
  assert.equal(session.calls.at(-1), "end");
});

/* ── Chuyển khoản ngân hàng ─────────────────────────────────────── */

test("bank_transfer: ghi lại ai duyệt và duyệt lúc nào", async (t) => {
  const order = makeOrder({ paymentMethod: "bank_transfer", paymentStatus: "unpaid" });
  const session = stub(t, order);

  const result = await PaymentService.confirmBankTransferPayment("order-1", "admin-9");

  assert.equal(result.paymentStatus, "paid");
  assert.equal(result.paymentVerifiedBy, "admin-9", "phải truy được ai xác nhận tiền về");
  assert.ok(result.paymentVerifiedAt instanceof Date);
  assert.equal(order.saved, 1);
  assert.deepEqual(session.calls, ["start", "commit", "end"]);
});

test("bank_transfer: gọi lại lần hai không đổi người duyệt", async (t) => {
  const order = makeOrder({
    paymentMethod: "bank_transfer",
    paymentStatus: "paid",
    paymentVerifiedBy: "admin-1",
  });
  const session = stub(t, order);

  const result = await PaymentService.confirmBankTransferPayment("order-1", "admin-2");

  assert.equal(result.paymentVerifiedBy, "admin-1", "không được ghi đè dấu vết duyệt gốc");
  assert.equal(order.saved, 0);
  assert.deepEqual(session.calls, ["start", "abort", "end"]);
});

test("bank_transfer: từ chối đơn COD", async (t) => {
  const order = makeOrder({ paymentMethod: "cod", paymentStatus: "unpaid" });
  const session = stub(t, order);

  await assert.rejects(
    () => PaymentService.confirmBankTransferPayment("order-1", "admin-9"),
    /non-bank-transfer order/,
  );
  assert.equal(order.saved, 0);
  assert.deepEqual(session.calls, ["start", "abort", "end"]);
});

/* ── Đánh dấu đã hoàn tiền ──────────────────────────────────────── */

test("markPaymentRefunded chạy trong session được truyền vào", async (t) => {
  // Hàm này được gọi giữa transaction hoàn tiền. Nếu session bị rớt, việc
  // đánh dấu hoàn tiền sẽ commit riêng và không rollback cùng phần còn lại.
  let captured = null;
  t.mock.method(Order, "findByIdAndUpdate", async (id, update, options) => {
    captured = { id, update, options };
    return { _id: id, paymentStatus: "refunded" };
  });

  const outerSession = makeSession();
  const result = await PaymentService.markPaymentRefunded("order-1", outerSession);

  assert.equal(captured.id, "order-1");
  assert.deepEqual(captured.update, { $set: { paymentStatus: "refunded" } });
  assert.equal(captured.options.session, outerSession, "phải dùng đúng session bên ngoài");
  assert.equal(captured.options.new, true, "phải trả về bản ghi sau khi cập nhật");
  assert.equal(result.paymentStatus, "refunded");
});
