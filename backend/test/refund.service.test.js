const test = require("node:test");
const assert = require("node:assert/strict");

const Order = require("../src/models/Order");
const Refund = require("../src/models/Refund");
const RefundService = require("../src/services/refund.service");

/**
 * Hai nhánh mới trong luồng hoàn tiền, đều đụng tới tiền thật:
 *
 *   openRefundForFailedDelivery  — giao hỏng + đã trả tiền trước thì mở hộ
 *                                  yêu cầu hoàn tiền cho người mua
 *   _closeOrderAfterRefundRejected — hoàn tiền bị từ chối chung cuộc thì đưa
 *                                  đơn ra khỏi trạng thái "refund"
 *
 * Mock tầng model thay vì cần DB: transaction/replica set không có trên CI.
 */

function captureOrderUpdate(t) {
  const calls = [];
  t.mock.method(Order, "findByIdAndUpdate", async (id, update, options) => {
    calls.push({ id, update, options });
    return { _id: id, ...update.$set };
  });
  return calls;
}

/* ── Mở hoàn tiền khi giao thất bại ─────────────────────────────── */

test("đơn trả tiền trước: tạo yêu cầu hoàn và đẩy đơn sang refund", async (t) => {
  const order = {
    _id: "order-1",
    buyerId: "buyer-1",
    sellerId: "seller-1",
    status: "returned",
    paymentStatus: "paid",
    totalAmount: 250000,
  };

  let created = null;
  t.mock.method(Refund, "findOne", async () => null);
  t.mock.method(Refund, "create", async (doc) => {
    created = doc;
    return { _id: "refund-1", ...doc };
  });
  const updates = captureOrderUpdate(t);

  const result = await RefundService.openRefundForFailedDelivery(order);

  assert.equal(created.reason, "delivery_failed");
  assert.equal(created.status, "returning", "chặng gửi trả đã xong, chờ người bán xác nhận");
  assert.equal(created.refundAmount, 250000, "phải hoàn đúng số tiền người mua đã trả");
  assert.equal(created.buyerId, "buyer-1");
  assert.equal(created.sellerId, "seller-1");

  assert.equal(updates.length, 1);
  assert.equal(updates[0].update.$set.status, "refund");
  assert.equal(updates[0].update.$set.refundRequestId, "refund-1");
  assert.ok(updates[0].update.$set.refundRequestedAt instanceof Date);
  assert.equal(updates[0].options.runValidators, true);
  assert.equal(result.status, "refund");
});

test("đơn COD: không mở hoàn tiền vì chưa ai trả đồng nào", async (t) => {
  const order = {
    _id: "order-2",
    status: "returned",
    paymentStatus: "unpaid",
    totalAmount: 250000,
  };

  const createMock = t.mock.method(Refund, "create", async () => {
    throw new Error("không được tạo refund cho đơn chưa thanh toán");
  });
  const updates = captureOrderUpdate(t);

  const result = await RefundService.openRefundForFailedDelivery(order);

  assert.equal(result, null);
  assert.equal(createMock.mock.callCount(), 0);
  assert.equal(updates.length, 0, "đơn phải nằm yên ở returned");
});

test("đã có yêu cầu hoàn tiền đang chạy thì không tạo thêm", async (t) => {
  // Tạo trùng sẽ vướng unique index (orderId, status) và tệ hơn là mở đường
  // hoàn tiền hai lần cho cùng một đơn.
  const order = {
    _id: "order-3",
    status: "returned",
    paymentStatus: "paid",
    totalAmount: 100000,
  };

  t.mock.method(Refund, "findOne", async () => ({ _id: "refund-cu", status: "returning" }));
  const createMock = t.mock.method(Refund, "create", async () => {
    throw new Error("không được tạo refund thứ hai");
  });
  const updates = captureOrderUpdate(t);

  const result = await RefundService.openRefundForFailedDelivery(order);

  assert.equal(result, null);
  assert.equal(createMock.mock.callCount(), 0);
  assert.equal(updates.length, 0);
});

test("chỉ bỏ qua các yêu cầu đã đóng khi kiểm trùng", async (t) => {
  // Yêu cầu cũ đã completed/cancelled/rejected thì không chặn lần mở mới.
  const order = {
    _id: "order-4",
    buyerId: "buyer-1",
    sellerId: "seller-1",
    status: "returned",
    paymentStatus: "paid",
    totalAmount: 90000,
  };

  let filter = null;
  t.mock.method(Refund, "findOne", async (f) => {
    filter = f;
    return null;
  });
  t.mock.method(Refund, "create", async (doc) => ({ _id: "refund-2", ...doc }));
  captureOrderUpdate(t);

  await RefundService.openRefundForFailedDelivery(order);

  assert.deepEqual(filter.status.$nin, ["completed", "cancelled", "rejected"]);
});

test("đơn ở status không cho phép sang refund thì ném lỗi chứ không ghi bừa", async (t) => {
  const order = {
    _id: "order-5",
    buyerId: "buyer-1",
    sellerId: "seller-1",
    status: "completed",
    paymentStatus: "paid",
    totalAmount: 50000,
  };

  t.mock.method(Refund, "findOne", async () => null);
  t.mock.method(Refund, "create", async (doc) => ({ _id: "refund-3", ...doc }));
  const updates = captureOrderUpdate(t);

  await assert.rejects(
    () => RefundService.openRefundForFailedDelivery(order),
    /Cannot transition order/,
  );
  assert.equal(updates.length, 0);
});

/* ── Đóng đơn khi hoàn tiền bị từ chối ──────────────────────────── */

test("hoàn tiền bị từ chối: đơn được hoàn tất thay vì kẹt ở refund", async (t) => {
  t.mock.method(Order, "findById", async (id) => ({ _id: id, status: "refund" }));
  const updates = captureOrderUpdate(t);

  const result = await RefundService._closeOrderAfterRefundRejected("order-1");

  assert.equal(updates[0].update.$set.status, "completed");
  assert.ok(updates[0].update.$set.completedAt instanceof Date);
  assert.deepEqual(updates[0].update.$push.statusHistory.status, "completed");
  assert.equal(result.status, "completed");
});

test("đơn không còn ở refund thì để yên", async (t) => {
  // Chạy lại lần hai (cron + admin cùng gọi) không được đụng vào đơn đã xong.
  t.mock.method(Order, "findById", async (id) => ({ _id: id, status: "refunded" }));
  const updates = captureOrderUpdate(t);

  const result = await RefundService._closeOrderAfterRefundRejected("order-1");

  assert.equal(result, null);
  assert.equal(updates.length, 0);
});

test("đơn không tồn tại thì trả null chứ không ném", async (t) => {
  t.mock.method(Order, "findById", async () => null);
  const updates = captureOrderUpdate(t);

  assert.equal(await RefundService._closeOrderAfterRefundRejected("khong-co"), null);
  assert.equal(updates.length, 0);
});
