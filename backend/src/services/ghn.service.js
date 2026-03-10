
const axios = require("axios");

const GHN_API_URL = process.env.GHN_API_URL;
const GHN_TOKEN = process.env.GHN_TOKEN;
const GHN_SHOP_ID = process.env.GHN_SHOP_ID;

async function createShippingOrder({
  orderId,
  fromAddress,
  toAddress,
  codAmount = 0,
  weight = 500,
  items,
  paymentMethod = "cod",
}) {
  if (!GHN_TOKEN || !GHN_SHOP_ID) {
    throw new Error("GHN: Thiếu cấu hình GHN_TOKEN hoặc GHN_SHOP_ID.");
  }
  if (!fromAddress?.from_district_id || !fromAddress?.from_ward_code) {
    throw new Error(
      "GHN: Địa chỉ seller (from) thiếu from_district_id hoặc from_ward_code.",
    );
  }
  if (!toAddress?.districtId || !toAddress?.wardCode) {
    throw new Error("GHN: Địa chỉ giao hàng thiếu districtId hoặc wardCode.");
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
  const itemsPayload =
    Array.isArray(items) && items.length > 0
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

  // payment_type_id (theo GHN API):
  // 1 = Người gửi trả phí ship (Shop/Platform pays) - dùng cho Bank Transfer
  // 2 = Người nhận trả phí ship (Buyer pays) - dùng cho COD
  //
  // - COD: payment_type_id=2, cod_amount = tiền hàng (productAmount) KHÔNG gồm phí ship
  //   → GHN tự thu phí ship từ buyer khi giao hàng (hiển thị trong "Tổng thu")
  //   → Nếu gộp shippingFee vào cod_amount → buyer bị tính phí ship 2 lần
  //
  // - Bank Transfer: payment_type_id=1, cod_amount = 0
  //   → Buyer đã trả trước qua chuyển khoản
  //   → Platform/Seller trả phí ship cho GHN
  const payment_type_id = paymentMethod === "cod" ? 2 : 1;

  const payload = {
    payment_type_id: payment_type_id,
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
      },
    );
    data = res.data;
  } catch (err) {
    const msg =
      err.response?.data?.message || err.response?.data?.msg || err.message;
    const code = err.response?.data?.code ?? err.response?.status;
    console.error("GHN create order request failed:", {
      code,
      message: msg,
      responseData: err.response?.data,
    });
    throw new Error(`GHN request failed: ${msg || err.message}`);
  }

  if (data.code !== 200 || !data.data) {
    console.error("GHN create order response error:", data);
    throw new Error(data.message || data.msg || `GHN API lỗi: ${data.code}`);
  }

  const info = data.data;
  const ghnOrderCode = info.order_code;
  const ghnSortCode = info.sort_code || "";
  const isProduction =
    GHN_API_URL.includes("online-gateway.ghn.vn") &&
    !GHN_API_URL.includes("dev-");
  const ghnTrackingUrl = ghnOrderCode
    ? isProduction
      ? `https://ghn.vn/tracking?order_code=${ghnOrderCode}`
      : `https://dev-online.ghn.vn/tracking?order_code=${ghnOrderCode}`
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

async function cancelShippingOrder(ghnOrderCode) {
  if (!GHN_TOKEN || !GHN_SHOP_ID) {
    throw new Error("GHN: Thiếu cấu hình GHN_TOKEN hoặc GHN_SHOP_ID.");
  }
  
  if (!ghnOrderCode) {
    throw new Error("GHN: Thiếu mã đơn hàng GHN để hủy.");
  }

  const payload = {
    order_codes: [ghnOrderCode]
  };

  try {
    const res = await axios.post(
      `${GHN_API_URL}/v2/switch-status/cancel`,
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

    const data = res.data;
    if (data.code !== 200) {
      console.error("GHN cancel order response error:", data);
      throw new Error(data.message || data.msg || `GHN cancel API lỗi: ${data.code}`);
    }

    console.log("GHN order cancelled successfully:", ghnOrderCode);
    return {
      success: true,
      ghnOrderCode,
      message: data.message || "Đã hủy đơn hàng trên GHN",
    };
  } catch (err) {
    const msg =
      err.response?.data?.message || err.response?.data?.msg || err.message;
    const code = err.response?.data?.code ?? err.response?.status;
    console.error("GHN cancel order request failed:", {
      code,
      message: msg,
      ghnOrderCode,
      responseData: err.response?.data,
    });
    // Không throw error để không block việc hủy đơn hàng trong hệ thống
    // Chỉ log lỗi và return failure
    return {
      success: false,
      ghnOrderCode,
      message: msg || err.message,
    };
  }
}

/** Parse GHN date values — handles Unix timestamp (seconds or ms) and ISO strings */
function parseGHNDate(raw) {
  if (raw == null || raw === "" || raw === 0) return undefined;
  const n = Number(raw);
  if (!isNaN(n) && n > 0) {
    // GHN returns Unix seconds (< 1e12); sometimes ms
    const date = new Date(n < 1e12 ? n * 1000 : n);
    return isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  const date = new Date(raw);
  return isNaN(date.getTime()) ? undefined : date.toISOString();
}

async function getOrderTracking(ghnOrderCode) {
  if (!GHN_TOKEN || !GHN_SHOP_ID) {
    throw new Error("GHN: Thiếu cấu hình GHN_TOKEN hoặc GHN_SHOP_ID.");
  }

  try {
    const res = await axios.post(
      `${GHN_API_URL}/v2/shipping-order/detail`,
      { order_code: ghnOrderCode },
      {
        headers: {
          Token: GHN_TOKEN,
          ShopId: GHN_SHOP_ID,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      },
    );

    const data = res.data;
    if (data.code !== 200 || !data.data) {
      throw new Error(data.message || data.msg || `GHN tracking API lỗi: ${data.code}`);
    }

    const d = data.data;
    return {
      order_code: d.order_code,
      status: d.status,
      status_text: d.status_text || d.status,
      updated_date: d.updated_date,
      to_name: d.to_name,
      to_address: d.to_address,
      to_phone: d.to_phone,
      estimate_deliver_time: parseGHNDate(d.leadtime ?? d.expected_delivery_time),
      log: Array.isArray(d.log)
        ? d.log.map((entry) => ({
            status: entry.status,
            status_text: entry.status_text || entry.status,
            time: parseGHNDate(entry.updated_date ?? entry.time) ?? "",
            location: entry.location?.pick_location || undefined,
            note: entry.note || undefined,
          }))
        : [],
    };
  } catch (err) {
    const msg =
      err.response?.data?.message || err.response?.data?.msg || err.message;
    const code = err.response?.data?.code ?? err.response?.status;
    console.error("GHN getOrderTracking failed:", { code, message: msg, ghnOrderCode });
    throw new Error(`GHN tracking request failed: ${msg || err.message}`);
  }
}

/**
 * Creates a GHN return shipment (buyer → seller).
 * Used when seller approves a refund request and needs the buyer to send the item back.
 *
 * @param {Object} opts
 * @param {string} opts.orderId        - Original order ID (for client_order_code)
 * @param {Object} opts.buyerAddress   - Buyer's shipping address (from Order.shippingAddress)
 * @param {Object} opts.sellerAddress  - Seller's resolved pickup address (from resolveFromAddress)
 * @param {number} [opts.weight=500]   - Weight in grams
 */
async function createReturnShipment({ orderId, buyerAddress, sellerAddress, weight = 500 }) {
  if (!GHN_TOKEN || !GHN_SHOP_ID) {
    throw new Error("GHN: Thiếu cấu hình GHN_TOKEN hoặc GHN_SHOP_ID.");
  }
  if (!buyerAddress?.districtId || !buyerAddress?.wardCode) {
    throw new Error("GHN: Địa chỉ người mua (from) thiếu districtId hoặc wardCode.");
  }
  if (!sellerAddress?.from_district_id || !sellerAddress?.from_ward_code) {
    throw new Error("GHN: Địa chỉ seller (to) thiếu from_district_id hoặc from_ward_code.");
  }

  const payload = {
    payment_type_id: 1, // Seller/shop pays return shipping fee
    note: `Hoàn hàng đơn ${orderId}`,
    required_note: "KHONGCHOXEMHANG",
    from_name:        buyerAddress.fullName     || "",
    from_phone:       buyerAddress.phoneNumber  || "",
    from_address:     buyerAddress.specificAddress || "",
    from_ward_code:   String(buyerAddress.wardCode || "").trim(),
    from_district_id: parseInt(buyerAddress.districtId, 10),
    to_name:        sellerAddress.from_name     || "Shop",
    to_phone:       sellerAddress.from_phone    || "",
    to_address:     sellerAddress.businessAddress || sellerAddress.from_address || "",
    to_ward_code:   String(sellerAddress.from_ward_code || "").trim(),
    to_district_id: parseInt(sellerAddress.from_district_id, 10),
    cod_amount:     0,
    weight:         Math.max(weight, 100),
    length: 20,
    width:  15,
    height: 10,
    service_type_id:    2,
    client_order_code:  `RET-${String(orderId)}`,
    items: [
      {
        name:     "Hoàn hàng",
        code:     `RET-${String(orderId).slice(-8)}`,
        quantity: 1,
        price:    0,
        length:   12,
        width:    12,
        height:   12,
        weight:   Math.max(weight, 100),
        category: { level1: "Đồ cũ" },
      },
    ],
  };

  let data;
  try {
    const res = await axios.post(
      `${GHN_API_URL}/v2/shipping-order/create`,
      payload,
      {
        headers: {
          Token:   GHN_TOKEN,
          ShopId:  GHN_SHOP_ID,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      },
    );
    data = res.data;
  } catch (err) {
    const msg  = err.response?.data?.message || err.response?.data?.msg || err.message;
    const code = err.response?.data?.code ?? err.response?.status;
    console.error("GHN create return order request failed:", { code, message: msg, responseData: err.response?.data });
    throw new Error(`GHN return shipment request failed: ${msg || err.message}`);
  }

  if (data.code !== 200 || !data.data) {
    console.error("GHN create return order response error:", data);
    throw new Error(data.message || data.msg || `GHN API lỗi: ${data.code}`);
  }

  const info = data.data;
  const ghnReturnOrderCode = info.order_code;
  const isProduction =
    GHN_API_URL.includes("online-gateway.ghn.vn") && !GHN_API_URL.includes("dev-");
  const ghnReturnTrackingUrl = ghnReturnOrderCode
    ? isProduction
      ? `https://ghn.vn/tracking?order_code=${ghnReturnOrderCode}`
      : `https://dev-online.ghn.vn/tracking?order_code=${ghnReturnOrderCode}`
    : "";

  return { ghnReturnOrderCode, ghnReturnTrackingUrl };
}

module.exports = {
  createShippingOrder,
  createReturnShipment,
  cancelShippingOrder,
  getOrderTracking,
};
