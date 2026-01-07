const mongoose = require("mongoose");
const slugify = require("slugify");
const Schema = mongoose.Schema;

const SubCategorySchema = new Schema(
  {
    name: { type: String, required: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  { timestamps: true }
);

SubCategorySchema.index({ name: "text" });
SubCategorySchema.index({ slug: 1 });

SubCategorySchema.pre("validate", function (next) {
  if (this.isModified("name")) {
    this.slug = slugify(this.name, {
      lower: true,
      strict: true,
      locale: "vi",
    });
  }
  next();
});

module.exports = mongoose.model(
  "SubCategory",
  SubCategorySchema,
  "subcategories"
);
