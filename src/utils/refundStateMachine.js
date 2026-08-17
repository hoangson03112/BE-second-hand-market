"use strict";


















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
"cancelled"];


const VALID_REFUND_TRANSITIONS = {
  pending: ["approved", "rejected", "cancelled", "disputed"],
  approved: ["return_shipping"],
  return_shipping: ["returning", "returned", "failed"],
  returning: ["returned", "failed"],

  // "disputed" ở đây là lối thoát của người bán: mở kiện hàng ra thấy hỏng,
  // thiếu bộ phận hoặc sai món thì không bị buộc phải hoàn tiền, mà đẩy lên
  // admin phân xử.
  returned: ["bank_info_required", "processing", "completed", "disputed"],
  bank_info_required: ["processing"],
  processing: ["completed", "failed"],

  // "returned": tranh chấp phát sinh lúc kiểm hàng thì kiện hàng đã nằm ở chỗ
  // người bán rồi — admin xử cho người mua thì đi thẳng tới khâu tiền, không
  // lặp lại chặng gửi trả.
  disputed: ["approved", "rejected", "returned"],
  failed: ["processing"],

  // Người bán từ chối thì người mua còn quyền khiếu nại lên admin
  // (escalateToAdmin). Trước đây code làm việc này nhưng máy trạng thái khai
  // "rejected" là terminal, nên bước đó đang chạy ngoài vòng kiểm soát.
  rejected: ["disputed"],

  completed: [],
  cancelled: []
};

function validateRefundStatusTransition(currentStatus, nextStatus) {
  const allowed = VALID_REFUND_TRANSITIONS[currentStatus];
  if (!allowed) {
    throw new Error(`Unknown refund status: "${currentStatus}"`);
  }
  if (!allowed.includes(nextStatus)) {
    const allowedStr = allowed.length ? allowed.join(", ") : "none (terminal state)";
    throw new Error(
      `Cannot transition refund from "${currentStatus}" to "${nextStatus}". Allowed next states: [${allowedStr}]`
    );
  }
}

module.exports = {
  REFUND_STATUS,
  VALID_REFUND_TRANSITIONS,
  validateRefundStatusTransition
};