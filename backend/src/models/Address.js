const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const AddressSchema = new Schema(
  {
    fullName: { type: String },
    phoneNumber: { type: String },
    province: { type: String, required: true },
    district: { type: String, required: true },
    ward: { type: String, required: true },
    specificAddress: { type: String },
    wardCode: { type: String },
    districtId: { type: String },
    isDefault: { type: Boolean, default: false },
  },
  {
    collection: "addresses",
    timestamps: true,
  }
);

// Index cho performance
AddressSchema.index({ province: 1, district: 1 });
AddressSchema.index({ isDefault: 1 });

module.exports = mongoose.model("Address", AddressSchema);
