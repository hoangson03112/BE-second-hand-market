const mongoose = require("mongoose");
const slugify = require("slugify");
const FileSchema = require("./File");
const Schema = mongoose.Schema;

const ProductSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
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
    address: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Address",
      required: true,
    },
    deliveryOptions: {
      localPickup: { type: Boolean, default: true },
      codShipping: { type: Boolean, default: false },
    },
    price: {
      type: Number,
      required: true,
      min: [0, "Price cannot be negative"],
    },
    description: { type: String, default: "", trim: true },
    images: { type: [FileSchema], default: [] },
    avatar: { type: FileSchema, default: null },
    video: { type: FileSchema, default: null },
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
          "review_requested",
          "approved",
        ],
        message: "{VALUE} is not a valid status",
      },
    },
    aiModerationResult: {
      approved: { type: Boolean, default: null },
      confidence: { type: Number, default: 0, min: 0, max: 1 },
      reasons: [{ type: String }],
      reviewedAt: { type: Date, default: null },
      processingStarted: { type: Date, default: null },
      humanReviewRequested: { type: Boolean, default: false },
      humanReviewRequestedAt: { type: Date, default: null },
      humanReviewRequestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Account",
        default: null,
      },
      bypassAI: { type: Boolean, default: false },
      rejectionReason: { type: String, default: null },
      rejectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Account",
        default: null,
      },
      rejectedAt: { type: Date, default: null },
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Account",
        default: null,
      },
      approvedAt: { type: Date, default: null },
    },
    // Vector embedding for AI semantic product search
    embedding: {
      type: [Number],
      default: [],
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
    condition: {
      type: String,
      enum: ["new", "like_new", "good", "fair", "poor"],
      default: "good",
    },
  },
  {
    timestamps: true,
    collection: "products",
  },
);

// slug đã có unique sparse index từ field definition
ProductSchema.index({ name: "text" }); // Text index for search
ProductSchema.index({ condition: 1 }); // Index for condition filter
ProductSchema.index({ views: -1 }); // Index for views sorting

// Pre-validate middleware to generate slug from name
ProductSchema.pre("validate", async function (next) {
  // Generate slug from name if name is modified and slug is not provided
  if (this.isModified("name") && (!this.slug || this.isNew)) {
    let baseSlug = slugify(this.name, {
      lower: true,
      strict: true, // Remove special characters
      locale: "vi", // Support Vietnamese characters
    });

    // Ensure slug is not empty
    if (!baseSlug) {
      baseSlug = `product-${this._id || Date.now()}`;
    }

    // Check for uniqueness and append number if needed
    let slug = baseSlug;
    let counter = 1;

    while (true) {
      const existingProduct = await this.constructor.findOne({ slug });
      if (
        !existingProduct ||
        existingProduct._id.toString() === this._id?.toString()
      ) {
        break;
      }
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    this.slug = slug;
  }
  next();
});

// Pre-save middleware to handle stock status
ProductSchema.pre("save", async function (next) {
  if (this.stock === 0 && this.status !== "sold") {
    this.status = "sold";
  }
  next();
});

module.exports = mongoose.model("Product", ProductSchema);
