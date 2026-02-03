const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * Địa chỉ lấy hàng cho user chưa verify seller.
 * Dùng để tạo đơn GHN và tính phí ship khi có đơn hàng từ sản phẩm của user này.
 */
const PickupAddressSchema = new Schema(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      unique: true,
      index: true,
    },
    province: { type: String, required: true },
    district: { type: String, required: true },
    ward: { type: String, required: true },
    from_district_id: { type: String, required: true },
    from_ward_code: { type: String, required: true },
    businessAddress: { type: String, required: true },
  },
  {
    timestamps: true,
    collection: "pickup_addresses",
  }
);

module.exports = mongoose.model("PickupAddress", PickupAddressSchema);
