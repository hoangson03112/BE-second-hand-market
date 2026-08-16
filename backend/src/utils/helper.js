
function formatPhoneNumber(phone) {
  if (!phone) return null;


  if (phone.startsWith('+84')) {
    return phone;
  }


  if (phone.startsWith('0')) {
    return '+84' + phone.substring(1);
  }


  if (/^\d{9,10}$/.test(phone)) {
    return '+84' + phone;
  }

  return phone;
}

module.exports = { formatPhoneNumber };