const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const AddressSchema = new Schema(
  {
    fullName: { type: String },
    phoneNumber: { type: String },
    province: { type: String },
    isDefault: { type: Boolean, default: false },
    district: { type: String },
    ward: { type: String },
    specificAddress: { type: String },
  },
  { collection: "addresses" }
);

module.exports = mongoose.model("Address", AddressSchema);
