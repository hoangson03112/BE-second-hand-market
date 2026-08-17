"use strict";


const ORDER_STATUS = [
"pending",
"confirmed",
"picked_up",
"shipping",
"out_for_delivery",
"delivered",
"completed",
"cancelled",
"delivery_failed",
"returning",
"returned",
"refund",
"refunded"];






const VALID_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["picked_up", "cancelled", "delivered"],
  picked_up: ["shipping"],
  shipping: ["out_for_delivery"],
  out_for_delivery: ["delivered", "delivery_failed"],

  // Giao thất bại: GHN chuyển kiện hàng ngược về người bán. Chặng này thuộc về
  // đơn hàng chứ không thuộc Refund — Refund bắt đầu từ yêu cầu của người mua,
  // còn ở đây không ai yêu cầu cả.
  delivery_failed: ["returning"],
  returning: ["returned"],

  // Hàng đã về tay người bán. Nếu người mua đã chuyển khoản trước thì tiền vẫn
  // đang ở chỗ người bán, nên phải mở tiếp luồng hoàn tiền. Đơn COD thì dừng
  // tại đây vì chưa ai trả đồng nào — service quyết đi tiếp hay không dựa vào
  // paymentStatus.
  returned: ["refund"],

  delivered: ["completed", "refund"],

  // "completed": yêu cầu hoàn tiền bị từ chối chung cuộc (admin xử, hoặc người
  // mua hết hạn khiếu nại). Thiếu lối này thì đơn kẹt vĩnh viễn ở "refund".
  refund: ["refunded", "completed"],

  completed: [],
  cancelled: [],
  refunded: []
};


const STATUS_TIMESTAMP_FIELD = {
  confirmed: "confirmedAt",
  picked_up: "pickedUpAt",
  shipping: "shippingAt",
  out_for_delivery: "outForDeliveryAt",
  delivered: "deliveredAt",
  completed: "completedAt",
  cancelled: "cancelledAt",
  delivery_failed: "deliveryFailedAt",
  returning: "returningAt",
  returned: "returnedAt",
  refund: "refundRequestedAt",
  refunded: "refundedAt"
};









function validateOrderStatusTransition(currentStatus, nextStatus) {
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed) {
    throw new Error(`Unknown order status: "${currentStatus}"`);
  }
  if (!allowed.includes(nextStatus)) {
    const allowedStr = allowed.length ?
    allowed.join(", ") :
    "none (terminal state)";
    throw new Error(
      `Cannot transition order from "${currentStatus}" to "${nextStatus}". Allowed next states: [${allowedStr}]`
    );
  }
}






function getStatusTimestampField(status) {
  return STATUS_TIMESTAMP_FIELD[status] || null;
}

module.exports = {
  ORDER_STATUS,
  VALID_TRANSITIONS,
  validateOrderStatusTransition,
  getStatusTimestampField
};