const mongoose = require("mongoose");
const FileSchema = require("./File");
const AttributeSchema = require("./Attribute").schema;
const Schema = mongoose.Schema;

const ProductSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      unique: true,
      sparse: true,
    },
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
    images: { type: [FileSchema], default: [] },
    avatar: { type: FileSchema, default: null },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    status: {
      type: String,
      default: "pending",
      enum: {
        values: [
          "pending",
          "active",
          "inactive",
          "sold",
          "rejected",
          "under_review",
          "approved",
        ],
        message: "{VALUE} is not a valid status",
      },
    },
    aiModerationResult: {
      approved: { type: Boolean, default: null },
      reasons: [{ type: String }],
    },
    estimatedWeight: {
      value: { type: Number, default: null },
      confidence: { type: Number, default: 0 },
    },
    attributes: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Attribute",
      default: [],
    },
    soldCount: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    collection: "products",
  }
);

// Pre-save middleware to generate slug
ProductSchema.pre("save", async function (next) {
  if (this.stock === 0) {
    this.status = "sold";
  }
  next();
});

module.exports = mongoose.model("Product", ProductSchema);
