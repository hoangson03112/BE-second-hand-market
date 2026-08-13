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
"refund",
"refunded"];






const VALID_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["picked_up", "cancelled", "delivered"],
  picked_up: ["shipping"],
  shipping: ["out_for_delivery"],
  out_for_delivery: ["delivered", "delivery_failed"],
  delivery_failed: ["returning"],

  delivered: ["completed", "refund"],

  refund: ["refunded"],

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