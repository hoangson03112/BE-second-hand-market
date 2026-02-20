const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Flow đầy đủ: PENDING → CONFIRMED → PICKED_UP → SHIPPING → OUT_FOR_DELIVERY → DELIVERED → COMPLETED
const ORDER_STATUS = [
  "pending",          // Người mua vừa đặt hàng, chờ seller xác nhận
  "confirmed",        // Seller đã xác nhận & tạo đơn GHN
  "picked_up",        // GHN đã lấy hàng thành công
  "shipping",         // Đang vận chuyển giữa các kho
  "out_for_delivery", // Shipper đang đi giao hàng
  "delivered",        // Đã giao thành công, chờ buyer xác nhận
  "completed",        // Buyer đã xác nhận nhận hàng, đơn hoàn tất
  "failed",           // Giao hàng thất bại
  "returned",         // Hàng đã được hoàn trả
  "cancelled"         // Đơn hàng bị hủy
];
const REFUND_DECISION = ["pending", "approved", "rejected"];

const OrderSchema = new Schema(
  {
    // --- Core: người mua, người bán, sản phẩm ---
    buyerId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },
    sellerId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },
    products: [
      {
        productId: {
          type: Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true }, // Giá tại thời điểm mua
      },
    ],
    // --- Tiền: chỉ lưu 3 số ---
    productAmount: { type: Number, default: 0 }, // tiền sản phẩm (tiền hàng)
    shippingFee: { type: Number, default: 0 },   // tiền phí ship
    totalAmount: { type: Number, required: true }, // tổng tiền
    shippingAddress: {
      type: Schema.Types.ObjectId,
      ref: "Address",
    },
    shippingMethod: { type: String, required: true },
    paymentMethod: { type: String, required: true },
    statusPayment: { type: Boolean, default: false },
    reason: { type: String, default: "", trim: true },

    // --- Trạng thái đơn (index để query theo status) ---
    status: {
      type: String,
      default: "pending",
      enum: ORDER_STATUS,
      index: true,
    },

    // --- GHN (Giao Hàng Nhanh): chỉ có khi dùng ship GHN ---
    ghnOrderCode: { type: String, unique: true, sparse: true },
    ghnSortCode: { type: String },
    ghnTrackingUrl: { type: String },
    ghnStatus: { type: String, default: "pending" },
    ghnOrderInfo: { type: Schema.Types.Mixed }, // response GHN lưu tùy chọn
    transType: { type: String },
    expectedDeliveryTime: { type: Date },

    // --- Refund: chỉ dùng khi có yêu cầu hoàn tiền ---
    refundDecision: {
      type: String,
      default: "pending",
      enum: REFUND_DECISION,
    },
    refundDecisionReason: { type: String, default: "", trim: true },
    refundCompletedAt: { type: Date },

    // --- Timestamps nghiệp vụ ---
    confirmedAt: { type: Date },       // Thời điểm seller xác nhận
    pickedUpAt: { type: Date },        // Thời điểm GHN lấy hàng
    shippingAt: { type: Date },        // Thời điểm bắt đầu vận chuyển
    outForDeliveryAt: { type: Date },  // Thời điểm shipper đi giao
    deliveredAt: { type: Date },       // Thời điểm giao thành công
    completedAt: { type: Date },       // Thời điểm buyer xác nhận hoàn tất
    failedAt: { type: Date },          // Thời điểm giao thất bại
    returnedAt: { type: Date },        // Thời điểm hoàn hàng
    cancelledAt: { type: Date },       // Thời điểm hủy đơn
  },
  {
    timestamps: true,
    collection: "orders",
  }
);

// Index phục vụ query thường gặp
OrderSchema.index({ buyerId: 1, createdAt: -1 });
OrderSchema.index({ sellerId: 1, createdAt: -1 });
OrderSchema.index({ status: 1 });

module.exports = mongoose.model("Order", OrderSchema);
