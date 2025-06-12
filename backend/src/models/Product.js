const mongoose = require("mongoose");
const AttributeSchema = require("./Attribute").schema;
const Schema = mongoose.Schema;


const ProductSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    stock: {
      type: Number,
      required: true,
      min: [0, "Stock cannot be negative"],
      validate: {
        validator: Number.isInteger,
        message: "Stock must be an integer",
      },
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    subcategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubCategory",
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: [0, "Price cannot be negative"],
    },
    description: { type: String, default: "", trim: true },
    images: { type: [String], default: [] },
    avatar: { type: String, default: "" },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    status: {
      type: String,
      default: "pending",
      enum: {
        values: ["pending", "active", "inactive", "sold"],
        message: "{VALUE} is not a valid status",
      },
    },
    location: { type: String, default: "" },
    brand: { type: String, default: "" },
    color: { type: [String], default: [] },
    attributes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Attribute",
    }],
    isPopular: { type: Boolean, default: false },
    viewCount: { type: Number, default: 0, min: 0 },
    soldCount: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    collection: "products",
  }
);

module.exports = mongoose.model("Product", ProductSchema);
