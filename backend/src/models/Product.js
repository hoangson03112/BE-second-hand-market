const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const slug = require("mongoose-slug-updater");

mongoose.plugin(slug);

const ProductSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, slug: "name", unique: true },
    stock: { type: Number, required: true },
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
    price: { type: Number, required: false },
    description: { type: String, required: false },
    images: { type: [String], required: false },
    avatar: { type: String, required: false },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
    },
    status: {
      type: String,
      default: "pending",
    },
    location: { type: String, required: false },
  },
  { timestamps: true, collection: "products" }
);

module.exports = mongoose.model("Product", ProductSchema);
