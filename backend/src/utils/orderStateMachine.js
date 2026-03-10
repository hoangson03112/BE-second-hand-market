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
  "return_shipping",
  "returned",
  "refund_requested",
  "refund_approved",
  "refunded",
];

/**
 * Valid state transitions.
 * Keys = current status, values = array of allowed next statuses.
 */
const VALID_TRANSITIONS = {
  pending:          ["confirmed", "cancelled"],
  confirmed:        ["picked_up", "cancelled"],
  picked_up:        ["shipping"],
  shipping:         ["out_for_delivery"],
  out_for_delivery: ["delivered", "delivery_failed"],
  delivery_failed:  ["returning"],
  delivered:        ["completed", "refund_requested"],
  refund_requested: ["refund_approved"],
  refund_approved:  ["return_shipping"],
  returning:        ["returned"],  // backward compat
  return_shipping:  ["returned"],
  returned:         ["refunded"],
  // Terminal states
  completed:        [],
  cancelled:        [],
  refunded:         [],
};

/** Maps each status to the timestamp field on the Order document. */
const STATUS_TIMESTAMP_FIELD = {
  confirmed:        "confirmedAt",
  picked_up:        "pickedUpAt",
  shipping:         "shippingAt",
  out_for_delivery: "outForDeliveryAt",
  delivered:        "deliveredAt",
  completed:        "completedAt",
  cancelled:        "cancelledAt",
  delivery_failed:  "deliveryFailedAt",
  returning:        "returningAt",
  return_shipping:  "returningAt",
  returned:         "returnedAt",
  refund_requested: "refundRequestedAt",
  refund_approved:  "refundApprovedAt",
  refunded:         "refundedAt",
};

/**
 * Validates that a status transition is allowed.
 * Throws an Error with a descriptive message if the transition is invalid.
 *
 * @param {string} currentStatus
 * @param {string} nextStatus
 * @throws {Error}
 */
function validateOrderStatusTransition(currentStatus, nextStatus) {
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed) {
    throw new Error(`Unknown order status: "${currentStatus}"`);
  }
  if (!allowed.includes(nextStatus)) {
    const allowedStr = allowed.length
      ? allowed.join(", ")
      : "none (terminal state)";
    throw new Error(
      `Cannot transition order from "${currentStatus}" to "${nextStatus}". Allowed next states: [${allowedStr}]`
    );
  }
}

/**
 * Returns the timestamp field name for a given status, or null if none.
 * @param {string} status
 * @returns {string|null}
 */
function getStatusTimestampField(status) {
  return STATUS_TIMESTAMP_FIELD[status] || null;
}

module.exports = {
  ORDER_STATUS,
  VALID_TRANSITIONS,
  validateOrderStatusTransition,
  getStatusTimestampField,
};
