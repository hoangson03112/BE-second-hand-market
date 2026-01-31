/**
 * GHN (Giao Hàng Nhanh) - Service tạo đơn vận chuyển
 * Body/param theo tài liệu GHN, chỉ giữ trường cần thiết.
 * Env: GHN_API_URL, GHN_TOKEN, GHN_SHOP_ID
 */
const axios = require("axios");

const GHN_API_URL =
  process.env.GHN_API_URL || "https://dev-online-gateway.ghn.vn/shiip/public-api";
const GHN_TOKEN = process.env.GHN_TOKEN;
const GHN_SHOP_ID = process.env.GHN_SHOP_ID;

/**
 * Tạo đơn vận chuyển trên GHN.
 * @param {Object} params
 * @param {string} params.orderId - client_order_code
 * @param {Object} params.fromAddress - Seller: from_district_id, from_ward_code, businessAddress, province?, district?, ward?, from_name?, from_phone?
 * @param {Object} params.toAddress - Address: fullName, phoneNumber, districtId, wardCode, specificAddress
 * @param {number} [params.codAmount] - Tiền thu hộ (VNĐ)
 * @param {number} [params.weight] - Cân nặng (gram)
 * @param {Array<{name,quantity,price,weight?}>} [params.items] - Mặt hàng; nếu không có thì gửi 1 item mặc định
 */
async function createShippingOrder({
  orderId,
  fromAddress,
  toAddress,
  codAmount = 0,
  weight = 500,
  items,
}) {
  if (!GHN_TOKEN || !GHN_SHOP_ID) {
    throw new Error(
      "GHN: Thiếu cấu hình GHN_TOKEN hoặc GHN_SHOP_ID."
    );
  }
  if (!fromAddress?.from_district_id || !fromAddress?.from_ward_code) {
    throw new Error(
      "GHN: Địa chỉ seller (from) thiếu from_district_id hoặc from_ward_code."
    );
  }
  if (!toAddress?.districtId || !toAddress?.wardCode) {
    throw new Error(
      "GHN: Địa chỉ giao hàng thiếu districtId hoặc wardCode."
    );
  }

  const fromDistrictId = parseInt(fromAddress.from_district_id, 10);
  const fromWardCode = String(fromAddress.from_ward_code || "").trim();
  const toDistrictId = parseInt(toAddress.districtId, 10);

  // items: GHN yêu cầu ít nhất 1 item (name, code, quantity, price, weight, kích thước)
  const defaultItem = {
    name: "Đơn hàng",
    code: String(orderId).slice(-8) || "ITEM",
    quantity: 1,
    price: 0,
    length: 12,
    width: 12,
    height: 12,
    weight: Math.max(weight, 100),
    category: { level1: "Đồ cũ" },
  };
  const itemsPayload = Array.isArray(items) && items.length > 0
    ? items.map((it) => ({
        name: it.name || "Đơn hàng",
        code: it.code || String(orderId).slice(-8),
        quantity: it.quantity || 1,
        price: it.price || 0,
        length: it.length ?? 12,
        width: it.width ?? 12,
        height: it.height ?? 12,
        weight: it.weight || weight,
        category: it.category || { level1: "Đồ cũ" },
      }))
    : [defaultItem];

  const payload = {
    payment_type_id: codAmount > 0 ? 2 : 1,
    note: `Đơn ${orderId}`,
    required_note: "KHONGCHOXEMHANG",
    from_name: fromAddress.from_name || "Shop",
    from_phone: fromAddress.from_phone || "",
    from_address: fromAddress.businessAddress || fromAddress.from_address || "",
    from_ward_code: fromWardCode,
    from_district_id: fromDistrictId,
    ...(fromAddress.province && {
      from_province_name: fromAddress.province,
      from_district_name: fromAddress.district,
      from_ward_name: fromAddress.ward,
    }),
    to_name: toAddress.fullName || "",
    to_phone: toAddress.phoneNumber || "",
    to_address: toAddress.specificAddress || "",
    to_ward_code: toAddress.wardCode,
    to_district_id: toDistrictId,
    cod_amount: codAmount,
    weight: weight,
    length: 20,
    width: 15,
    height: 10,
    service_type_id: 2,
    client_order_code: String(orderId),
    items: itemsPayload,
  };

  let data;
  try {
    const res = await axios.post(
      `${GHN_API_URL}/v2/shipping-order/create`,
      payload,
      {
        headers: {
          Token: GHN_TOKEN,
          ShopId: GHN_SHOP_ID,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );
    data = res.data;
  } catch (err) {
    const msg = err.response?.data?.message || err.response?.data?.msg || err.message;
    const code = err.response?.data?.code ?? err.response?.status;
    console.error("GHN create order request failed:", { code, message: msg, responseData: err.response?.data });
    throw new Error(`GHN request failed: ${msg || err.message}`);
  }

  if (data.code !== 200 || !data.data) {
    console.error("GHN create order response error:", data);
    throw new Error(
      data.message || data.msg || `GHN API lỗi: ${data.code}`
    );
  }

  const info = data.data;
  const ghnOrderCode = info.order_code;
  const ghnSortCode = info.sort_code || "";
  const isProduction = GHN_API_URL.includes("online-gateway.ghn.vn") && !GHN_API_URL.includes("dev-");
  const ghnTrackingUrl = ghnOrderCode
    ? (isProduction
        ? `https://ghn.vn/tracking?order_code=${ghnOrderCode}`
        : `https://dev-online.ghn.vn/tracking?order_code=${ghnOrderCode}`)
    : "";

  return {
    ghnOrderCode,
    ghnSortCode,
    ghnTrackingUrl,
    expectedDeliveryTime: info.expected_delivery_time
      ? new Date(info.expected_delivery_time)
      : undefined,
    transType: info.transport_type,
    ghnStatus: "pending",
    ghnOrderInfo: info,
  };
}

module.exports = {
  createShippingOrder,
};
