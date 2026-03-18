"use strict";

/**
 * Refund status machine
 *
 * Lifecycle (simplified):
 *   pending  -> approved / rejected / cancelled / disputed
 *   approved -> return_shipping
 *   return_shipping -> returning / returned / failed
 *   returning -> returned / failed
 *   returned  -> bank_info_required / processing / completed
 *   bank_info_required -> processing
 *   processing -> completed / failed
 *   disputed -> approved / rejected
 *   failed   -> processing
 *
 * Terminal: completed, cancelled, rejected
 */

const REFUND_STATUS = [
  "pending",
  "approved",
  "rejected",
  "return_shipping",
  "returning",
  "returned",
  "bank_info_required",
  "processing",
  "completed",
  "failed",
  "disputed",
  "cancelled",
];

const VALID_REFUND_TRANSITIONS = {
  pending: ["approved", "rejected", "cancelled", "disputed"],
  approved: ["return_shipping"],
  return_shipping: ["returning", "returned", "failed"],
  returning: ["returned", "failed"],
  returned: ["bank_info_required", "processing", "completed"],
  bank_info_required: ["processing"],
  processing: ["completed", "failed"],
  disputed: ["approved", "rejected"],
  failed: ["processing"],
  // Terminal states
  completed: [],
  cancelled: [],
  rejected: [],
};

function validateRefundStatusTransition(currentStatus, nextStatus) {
  const allowed = VALID_REFUND_TRANSITIONS[currentStatus];
  if (!allowed) {
    throw new Error(`Unknown refund status: "${currentStatus}"`);
  }
  if (!allowed.includes(nextStatus)) {
    const allowedStr = allowed.length ? allowed.join(", ") : "none (terminal state)";
    throw new Error(
      `Cannot transition refund from "${currentStatus}" to "${nextStatus}". Allowed next states: [${allowedStr}]`,
    );
  }
}

module.exports = {
  REFUND_STATUS,
  VALID_REFUND_TRANSITIONS,
  validateRefundStatusTransition,
};

