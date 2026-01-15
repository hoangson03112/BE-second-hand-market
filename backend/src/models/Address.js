const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const AddressSchema = new Schema(
  {
    fullName: { type: String },
    phoneNumber: { type: String },
    provinceId: { type: String, required: true },
    wardCode: { type: String, required: true },
    districtId: { type: String, required: true },
    specificAddress: { type: String },
    isDefault: { type: Boolean, default: false },
  },
  {
    collection: "addresses",
    timestamps: true,
  }
);

// Index cho performance
AddressSchema.index({ provinceId: 1, districtId: 1 });
AddressSchema.index({ isDefault: 1 });

module.exports = mongoose.model("Address", AddressSchema);
