const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const AddressSchema = new Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    fullName: { type: String },
    phoneNumber: { type: String },
    provinceId: { type: String, required: true },
    wardCode: { type: String, required: true },
    districtId: { type: String, required: true },
    specificAddress: { type: String },
    isDefault: { type: Boolean, default: false },
    type: {
      type: String,
      enum: ["delivery", "pickup"],
    },
  },
  {
    collection: "addresses",
  },
);

AddressSchema.index({ provinceId: 1, districtId: 1 });
AddressSchema.index({ isDefault: 1 });
AddressSchema.index({ accountId: 1, type: 1 });
AddressSchema.index({ accountId: 1 });

module.exports = mongoose.model("Address", AddressSchema);
