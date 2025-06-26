const mongoose = require("mongoose");
const FileSchema = require("./File");
const AttributeSchema = require("./Attribute").schema;
const Schema = mongoose.Schema;

// Function to generate slug from product name
function generateSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

const ProductSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { 
      type: String, 
      unique: true,
      sparse: true // This allows multiple null values if needed
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
        values: ["pending", "active", "inactive", "sold"],
        message: "{VALUE} is not a valid status",
      },
    },
    attributes: { type: [AttributeSchema], default: [] },
    soldCount: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    collection: "products",
  }
);

// Pre-save middleware to generate slug
ProductSchema.pre('save', async function(next) {
  if (this.isModified('name') || this.isNew) {
    let baseSlug = generateSlug(this.name);
    let slug = baseSlug;
    let counter = 1;
    
    // Check if slug already exists and create unique one
    while (await this.constructor.findOne({ slug: slug, _id: { $ne: this._id } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
    
    this.slug = slug;
  }
  next();
});

module.exports = mongoose.model("Product", ProductSchema);