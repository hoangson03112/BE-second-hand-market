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

ProductSchema.index({ name: "text" });
ProductSchema.index({ condition: 1 });
ProductSchema.index({ views: -1 });
ProductSchema.index({ status: 1 });
ProductSchema.index({ stock: 1 });

ProductSchema.pre("validate", async function () {
  if (this.isModified("name") && (!this.slug || this.isNew)) {
    let baseSlug = slugify(this.name, {
      lower: true,
      strict: true,
      locale: "vi",
    });

    if (!baseSlug) {
      baseSlug = `product-${this._id || Date.now()}`;
    }

    const slugRegex = new RegExp(`^${baseSlug}(-[0-9]+)?$`, "i");
    const existingProducts = await this.constructor.find({ slug: slugRegex });
    const otherProducts = existingProducts.filter(
      (doc) => doc._id.toString() !== this._id?.toString(),
    );

    if (otherProducts.length === 0) {
      this.slug = baseSlug;
      return;
    }

    const existingSlugs = new Set(otherProducts.map((doc) => doc.slug));

    if (!existingSlugs.has(baseSlug)) {
      this.slug = baseSlug;
    } else {
      let counter = 1;
      while (existingSlugs.has(`${baseSlug}-${counter}`)) {
        counter++;
      }
      this.slug = `${baseSlug}-${counter}`;
    }
  }
});

ProductSchema.pre("save", async function (next) {
  if (this.stock === 0 && this.status !== "sold") {
    this.status = "sold";
  }
  next();
});

module.exports = mongoose.model("Product", ProductSchema);
