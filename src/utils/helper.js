
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
// Luôn 4 dấu * bất kể local part dài ngắn: độ dài cũng là thông tin không cần
// tiết lộ. Local part ngắn thì bỏ luôn ký tự cuối, kẻo che 2 ký tự mà lộ 2.
const maskEmail = (email) => {
  const value = String(email ?? '').trim();
  const at = value.lastIndexOf('@');
  if (at < 1 || at === value.length - 1) return '***';

  const name = value.slice(0, at);
  const domain = value.slice(at + 1);
  const head = name.slice(0, name.length >= 4 ? 2 : 1);
  const tail = name.length >= 4 ? name.slice(-1) : '';

  return `${head}****${tail}@${domain}`;
};
module.exports = { formatPhoneNumber, maskEmail };