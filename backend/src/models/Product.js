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
      enum: ["pending", "active", "inactive", "sold"],
    },
    location: { type: String, required: false },
    brand: { type: String, required: false },
    color: { type: [String], required: false },
    keywords: { type: [String], required: false },
    isPopular: { type: Boolean, default: false },
    viewCount: { type: Number, default: 0 },
    soldCount: { type: Number, default: 0 },

    normalizedName: { type: String }, // Tên chuẩn hóa không dấu
    normalizedBrand: { type: String }, // Thương hiệu chuẩn hóa
    normalizedDescription: { type: String }, // Mô tả chuẩn hóa
    normalizedKeywords: { type: [String] }, // Keywords chuẩn hóa

    // Giá range để dễ tìm kiếm
    priceRange: {
      type: String,
      enum: [
        "under_100k",
        "100k_500k",
        "500k_1m",
        "1m_5m",
        "5m_10m",
        "over_10m",
      ],
    },

    // Tags để Dialogflow dễ nhận diện
    searchTags: { type: [String] }, // Tags tổng hợp cho search
    customSearchTags: { type: [String] }, // Tags do admin tự thêm

    // Thông tin bổ sung cho chatbot
    shortDescription: { type: String, maxlength: 200 }, // Mô tả ngắn cho chatbot
    features: { type: [String] }, // Các tính năng chính
    specifications: {
      type: Map,
      of: String,
    }, // Thông số kỹ thuật dạng key-value

    // Metadata cho analytics
    searchCount: { type: Number, default: 0 }, // Số lần được tìm kiếm
    lastSearched: { type: Date },
    chatbotInteractions: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: "products",
  }
);

ProductSchema.index(
  {
    normalizedName: "text",
    normalizedDescription: "text",
    normalizedBrand: "text",
    normalizedKeywords: "text",
    searchTags: "text",
    features: "text",
  },
  {
    weights: {
      normalizedName: 15,
      searchTags: 10,
      normalizedKeywords: 8,
      features: 6,
      normalizedBrand: 4,
      normalizedDescription: 2,
    },
    name: "chatbot_search_index",
    default_language: "none",
  }
);

// Compound indexes cho các truy vấn phổ biến từ chatbot
ProductSchema.index({ status: 1, categoryId: 1, priceRange: 1 });
ProductSchema.index({ status: 1, normalizedBrand: 1, priceRange: 1 });
ProductSchema.index({ status: 1, priceRange: 1, isPopular: -1 });
ProductSchema.index({ status: 1, stock: -1, price: 1 });

// Indexes đơn cho tìm kiếm nhanh
ProductSchema.index({ subcategoryId: 1, status: 1 });
ProductSchema.index({ searchTags: 1 });
ProductSchema.index({ priceRange: 1 });
ProductSchema.index({ searchCount: -1 });
ProductSchema.index({ isPopular: -1, searchCount: -1 });

// Giữ lại các indexes cũ cần thiết
ProductSchema.index({ categoryId: 1, status: 1 });
ProductSchema.index({ brand: 1, status: 1 });
ProductSchema.index({ price: 1 });
ProductSchema.index({ createdAt: -1 });
ProductSchema.index({ viewCount: -1 });
ProductSchema.index({ soldCount: -1 });

// Helper methods cho chatbot
ProductSchema.methods.updateSearchCount = function () {
  this.searchCount += 1;
  this.lastSearched = new Date();
  return this.save();
};

ProductSchema.methods.incrementChatbotInteraction = function () {
  this.chatbotInteractions += 1;
  return this.save();
};

// Pre-save middleware để tự động tạo normalized fields
ProductSchema.pre("save", function (next) {
  if (this.isModified("name") || this.isNew) {
    this.normalizedName = normalizeVietnamese(this.name);
  }

  if (this.isModified("brand") || this.isNew) {
    this.normalizedBrand = this.brand ? normalizeVietnamese(this.brand) : "";
  }

  if (this.isModified("description") || this.isNew) {
    this.normalizedDescription = this.description
      ? normalizeVietnamese(this.description)
      : "";
  }

  if (this.isModified("keywords") || this.isNew) {
    this.normalizedKeywords = this.keywords
      ? this.keywords.map((k) => normalizeVietnamese(k))
      : [];
  }

  // Tự động tạo price range
  if (this.isModified("price") || this.isNew) {
    this.priceRange = getPriceRange(this.price);
  }

  // Tự động tạo search tags
  this.searchTags = generateSearchTags(this);

  next();
});

// Static methods cho chatbot search
ProductSchema.statics.searchForChatbot = function (query, options = {}) {
  const {
    category,
    priceRange,
    brand,
    limit = 10,
    sort = { searchCount: -1, isPopular: -1 },
  } = options;

  let searchQuery = {
    status: "active",
    stock: { $gt: 0 },
  };

  if (query) {
    searchQuery.$text = { $search: normalizeVietnamese(query) };
  }

  if (category) searchQuery.categoryId = category;
  if (priceRange) searchQuery.priceRange = priceRange;
  if (brand) searchQuery.normalizedBrand = normalizeVietnamese(brand);

  return this.find(searchQuery)
    .sort(sort)
    .limit(limit)
    .populate("categoryId", "name")
    .populate("subcategoryId", "name")
    .select(
      "name price avatar shortDescription features priceRange brand location stock"
    );
};

ProductSchema.statics.getPopularForChatbot = function (limit = 5) {
  return this.find({
    status: "active",
    stock: { $gt: 0 },
    isPopular: true,
  })
    .sort({ searchCount: -1, viewCount: -1 })
    .limit(limit)
    .select("name price avatar shortDescription");
};

// Utility functions
function normalizeVietnamese(str) {
  if (!str) return "";

  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Loại bỏ dấu
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .trim();
}

function getPriceRange(price) {
  if (!price) return null;

  if (price < 100000) return "under_100k";
  if (price < 500000) return "100k_500k";
  if (price < 1000000) return "500k_1m";
  if (price < 5000000) return "1m_5m";
  if (price < 10000000) return "5m_10m";
  return "over_10m";
}

function generateSearchTags(product) {
  const tags = [];

  // Tags tự động từ các trường có sẵn
  if (product.name) tags.push(normalizeVietnamese(product.name));
  if (product.brand) tags.push(normalizeVietnamese(product.brand));
  if (product.color && product.color.length) {
    tags.push(...product.color.map((c) => normalizeVietnamese(c)));
  }
  if (product.keywords && product.keywords.length) {
    tags.push(...product.keywords.map((k) => normalizeVietnamese(k)));
  }

  // Thêm custom tags nếu có
  if (product.customSearchTags && product.customSearchTags.length) {
    tags.push(...product.customSearchTags.map((t) => normalizeVietnamese(t)));
  }

  // Thêm một số tags thông minh dựa trên logic business
  if (product.price) {
    if (product.price < 500000) tags.push("gia re", "re");
    if (product.price > 5000000) tags.push("cao cap", "dat");
  }

  if (product.isPopular) tags.push("pho bien", "hot", "ban chay");

  return [...new Set(tags)]; // Remove duplicates
}

module.exports = mongoose.model("Product", ProductSchema);
