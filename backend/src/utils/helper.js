// Thêm vào OTP routes
function formatPhoneNumber(phone) {
    if (!phone) return null;

    // Nếu đã có +84, return nguyên
    if (phone.startsWith('+84')) {
        return phone;
    }

    // Nếu bắt đầu bằng 0, bỏ số 0 và thêm +84
    if (phone.startsWith('0')) {
        return '+84' + phone.substring(1);
    }

    // Nếu chỉ là số thường (9-10 chữ số), thêm +84
    if (/^\d{9,10}$/.test(phone)) {
        return '+84' + phone;
    }

    return phone; // Trả về nguyên nếu không match format nào
}

function isValidPhoneNumber(phone) {
    const phoneRegex = /^\+84[0-9]{9,10}$/;
    return phoneRegex.test(phone);
}
function generateSubmissionId() {
    return `SUB_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
module.exports = {
    formatPhoneNumber,
    isValidPhoneNumber,
    generateSubmissionId
}