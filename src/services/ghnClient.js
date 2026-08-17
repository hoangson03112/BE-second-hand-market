// backend/src/services/external/ghnClient.js
const axios = require("axios");
const logger = require("../utils/logger"); // Logger của bạn

// 1. Cấu hình cơ bản (Base URL thật của GHN)
const ghnApiClient = axios.create({
  baseURL: "https://dev-online-gateway.ghn.vn/shiip/public-api/v2", 
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    Token: process.env.GHN_API_TOKEN, // 🔒 Token nằm an toàn trong .env của BE
    ShopId: process.env.GHN_SHOP_ID,
  },
});

// 2. Circuit Breaker & Retry Logic (Giữ nguyên logic hay của bạn nhưng viết cho Node.js)
let circuitBreakerOpen = false;
let failureCount = 0;
const FAILURE_THRESHOLD = 5; // Tăng ngưỡng cho BE
const CIRCUIT_RESET_TIME = 30000;

ghnApiClient.interceptors.response.use(
  (response) => {
    failureCount = 0;
    // GHN trả về mã lỗi trong body (code != 200), cần xử lý thêm nếu muốn
    return response.data; 
  },
  async (error) => {
    const config = error.config;
    failureCount++;

    if (failureCount >= FAILURE_THRESHOLD) {
      circuitBreakerOpen = true;
      logger.error("GHN Circuit breaker opened", error.message);
      setTimeout(() => {
        circuitBreakerOpen = false;
        failureCount = 0;
      }, CIRCUIT_RESET_TIME);
      return Promise.reject(new Error("GHN service is temporarily unavailable."));
    }

    // Retry logic cho lỗi mạng hoặc 5xx từ GHN
    if (!config._retry && (!error.response || error.response.status >= 500)) {
      config._retry = true;
      logger.warn(`Retrying GHN request: ${config.url}`);
      return ghnApiClient(config);
    }

    return Promise.reject(error);
  }
);

// 3. Các hàm API cụ thể (Tái sử dụng)
const ghnService = {
  // Tính phí vận chuyển
  calculateShippingFee: async (data) => {
    if (circuitBreakerOpen) throw new Error("GHN Circuit Breaker is open");
    return ghnApiClient.post("/shipping-order/fee", data);
  },

  // Tạo đơn hàng
  createOrder: async (data) => {
    if (circuitBreakerOpen) throw new Error("GHN Circuit Breaker is open");
    return ghnApiClient.post("/shipping-order/create", data);
  },
  
  // Lấy trạng thái đơn hàng
  getOrderStatus: async (data) => {
    if (circuitBreakerOpen) throw new Error("GHN Circuit Breaker is open");
    return ghnApiClient.post("/shipping-order/detail", data);
  },
};

module.exports = ghnService;
