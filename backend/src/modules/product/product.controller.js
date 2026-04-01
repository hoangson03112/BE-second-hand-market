const Attribute = require("../../models/Attribute");
const Product = require("../../models/Product");
const Category = require("../../models/Category");
const SubCategory = require("../../models/SubCategory");
const Account = require("../../models/Account");
const Address = require("../../models/Address");
const PersonalDiscount = require("../../models/PersonalDiscount");
const mongoose = require("mongoose");
const { saveAndEmitNotification } = require("../../utils/notification");

const {
  deleteFromCloudinary,
  uploadMultipleToCloudinary,
  uploadToCloudinary,
  deleteMultipleFromCloudinary,
} = require("../../utils/CloudinaryUpload");
const Seller = require("../../models/Seller");
const {
  processEnhancedAIModerationBackground,
} = require("../../services/aiModeration.service");
const {
  generateAndSaveEmbedding,
} = require("../../services/productEmbedding.service");
const {
  upsertApprovedProductToMeili,
} = require("../../services/productSearchIndex.service");
const { sendProductApprovedEmail, sendProductRejectedEmail, sendProductUnderReviewEmail } = require("../../services/email.service");
const SellerReview = require("../../models/SellerReview");
const Order = require("../../models/Order");
const { MESSAGES } = require('../../utils/messages');

const ORDER_STATUS_BLOCKING_DELETE = [
  "pending", "confirmed", "picked_up", "shipping", "out_for_delivery",
  "delivered", "refund_requested", "refund_approved", "return_shipping",
  "returning", "returned",
];

const UNVERIFIED_SELLER_PRODUCT_LIMIT = 5;

function sanitizeAttributeKey(input) {
  if (typeof input !== "string") return "";
  return input
    .trim()
    // Common UX: users often end label with ":" (e.g. "Dung lượng:")
    .replace(/[:：]+$/u, "")
    // Keep only letters/numbers/spaces/_/-
    .replace(/[^\p{L}\p{N}\s_-]+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

class ProductController {
  async getFeaturedProducts(req, res) {
    try {
      const requestedLimit = parseInt(req.query.limit, 10);
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(requestedLimit, 1), 20)
        : 4;

      const query = {
        status: { $in: ["approved", "active"] },
        stock: { $gt: 0 },
      };

      const products = await Product.find(query)
        .populate({ path: "sellerId", select: "fullName avatar role" })
        .populate({ path: "categoryId", select: "name slug" })
        .populate({ path: "subcategoryId", select: "name slug" })
        .populate({
          path: "address",
          select: "provinceId districtId wardCode specificAddress fullName phoneNumber",
        })
        .sort({ soldCount: -1, views: -1, createdAt: -1 })
        .limit(limit);

      const sellerAccountIds = products
        .map((p) => p.sellerId?._id)
        .filter(Boolean);
      const sellers = await Seller.find({ accountId: { $in: sellerAccountIds } });
      const sellerMap = new Map();
      sellers.forEach((s) => {
        if (s.accountId) sellerMap.set(s.accountId.toString(), s);
      });

      const productsWithSeller = products.map((product) => {
        const sellerId = product.sellerId?._id;
        const seller = sellerId ? sellerMap.get(sellerId.toString()) : null;

        return {
          _id: product._id,
          name: product.name,
          description: product.description,
          price: product.price,
          stock: product.stock ?? 0,
          avatar: product.avatar,
          images: product.images,
          category: product.categoryId,
          subCategory: product.subcategoryId,
          slug: product.slug,
          condition: product.condition,
          createdAt: product.createdAt,
          updatedAt: product.updatedAt,
          status: product.status,
          views: product.views || 0,
          soldCount: product.soldCount || 0,
          seller: {
            _id: sellerId,
            name: product.sellerId?.fullName,
            avatar: product.sellerId?.avatar ?? null,
            role: product.sellerId?.role,
            province: seller?.province,
            from_province_id:
              product.address?.provinceId ?? seller?.from_province_id ?? null,
          },
        };
      });

      if (req.accountID && productsWithSeller.length > 0) {
        const productIds = productsWithSeller.map((p) => p._id);
        const personalDiscounts = await PersonalDiscount.find({
          productId: { $in: productIds },
          buyerId: req.accountID,
          isUse: false,
          endDate: { $gt: new Date() },
        });
        const discountMap = new Map();
        personalDiscounts.forEach((d) => discountMap.set(d.productId.toString(), d));
        productsWithSeller.forEach((product) => {
          const discount = discountMap.get(product._id.toString());
          if (discount) {
            product.originalPrice = product.price;
            product.price = discount.price;
            product.hasPersonalDiscount = true;
            product.personalDiscountId = discount._id;
          }
        });
      }

      return res.json({
        success: true,
        data: productsWithSeller,
        total: productsWithSeller.length,
      });
    } catch (error) {
      console.error("Error fetching featured products:", error);
      return res.status(500).json({
        success: false,
        message: MESSAGES.SERVER_ERROR,
      });
    }
  }

  async getAllPublicProducts(req, res) {
    try {
      const {
        categorySlug,
        subCategorySlug,
        sortBy = "newest",
        page = 1,
        limit = 20,
        minPrice,
        maxPrice,
        condition,
        search,
        transactionMethod,
        provinceId,
      } = req.query;

      let categoryId = null;
      if (categorySlug) {
        const category = await Category.findOne({ slug: categorySlug });
        if (!category) {
          return res.status(404).json({ success: false, message: MESSAGES.PRODUCT.CATEGORY_NOT_FOUND });
        }
        categoryId = category._id;
      }

      let subcategoryId = null;
      if (subCategorySlug) {
        const subcategory = await SubCategory.findOne({ slug: subCategorySlug });
        if (!subcategory) {
          return res.status(404).json({ success: false, message: MESSAGES.PRODUCT.SUBCATEGORY_NOT_FOUND });
        }
        subcategoryId = subcategory._id;
      }

      const query = { status: { $in: ["approved", "active"] }, stock: { $gt: 0 } };

      if (subcategoryId) {
        query.subcategoryId = subcategoryId;
      } else if (categoryId) {
        query.categoryId = categoryId;
      }

      if (minPrice || maxPrice) {
        query.price = {};
        if (minPrice) query.price.$gte = parseFloat(minPrice);
        if (maxPrice) query.price.$lte = parseFloat(maxPrice);
      }

      if (condition) query.condition = condition;

      if (transactionMethod === "meeting") {
        query["deliveryOptions.localPickup"] = true;
      } else if (transactionMethod === "shipping") {
        query["deliveryOptions.codShipping"] = true;
      }

      if (provinceId != null && String(provinceId).trim() !== "") {
        const normalizedProvinceId = String(provinceId).trim();
        const addressesWithProvince = await Address.find({
          provinceId: normalizedProvinceId,
        })
          .select("_id")
          .lean();
        const addressIds = addressesWithProvince.map((a) => a._id);
        if (addressIds.length > 0) {
          query.address = { $in: addressIds };
        } else {
          query.address = { $in: [] };
        }
      }

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }

      let sortObject = {};
      switch (sortBy) {
        case "newest": sortObject = { createdAt: -1 }; break;
        case "oldest": sortObject = { createdAt: 1 }; break;
        case "price_low": sortObject = { price: 1 }; break;
        case "price_high": sortObject = { price: -1 }; break;
        case "popular": sortObject = { soldCount: -1, views: -1 }; break;
        default: sortObject = { createdAt: -1 };
      }

      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 20;
      const skip = (pageNum - 1) * limitNum;

      const total = await Product.countDocuments(query);

      const products = await Product.find(query)
        .populate({ path: "sellerId", select: "fullName avatar role" })
        .populate({ path: "categoryId", select: "name slug" })
        .populate({ path: "subcategoryId", select: "name slug" })
        .populate({ path: "address", select: "provinceId districtId wardCode specificAddress fullName phoneNumber" })
        .sort(sortObject)
        .skip(skip)
        .limit(limitNum);

      const sellerAccountIds = products.map((p) => p.sellerId?._id).filter(Boolean);
      const sellers = await Seller.find({ accountId: { $in: sellerAccountIds } });
      const sellerMap = new Map();
      sellers.forEach((s) => { if (s.accountId) sellerMap.set(s.accountId.toString(), s); });

      const productsWithSeller = products.map((product) => {
        const sellerId = product.sellerId?._id;
        const seller = sellerId ? sellerMap.get(sellerId.toString()) : null;
        return {
          _id: product._id,
          name: product.name,
          description: product.description,
          price: product.price,
          stock: product.stock ?? 0,
          avatar: product.avatar,
          images: product.images,
          category: product.categoryId,
          subCategory: product.subcategoryId,
          slug: product.slug,
          condition: product.condition,
          createdAt: product.createdAt,
          status: product.status,
          views: product.views || 0,
          seller: {
            _id: sellerId,
            name: product.sellerId?.fullName,
            avatar: product.sellerId?.avatar ?? null,
            role: product.sellerId?.role,
            province: seller?.province,
            from_province_id: product.address?.provinceId ?? seller?.from_province_id ?? null,
          },
        };
      });

      if (req.accountID) {
        const productIds = productsWithSeller.map((p) => p._id);
        const personalDiscounts = await PersonalDiscount.find({
          productId: { $in: productIds },
          buyerId: req.accountID,
          isUse: false,
          endDate: { $gt: new Date() },
        });
        const discountMap = new Map();
        personalDiscounts.forEach((d) => discountMap.set(d.productId.toString(), d));
        productsWithSeller.forEach((product) => {
          const discount = discountMap.get(product._id.toString());
          if (discount) {
            product.originalPrice = product.price;
            product.price = discount.price;
            product.hasPersonalDiscount = true;
            product.personalDiscountId = discount._id;
          }
        });
      }

      const totalPages = Math.ceil(total / limitNum);
      res.json({ success: true, data: productsWithSeller, total, page: pageNum, limit: limitNum, totalPages });
    } catch (error) {
      console.error("Error fetching all public products:", error);
      res.status(500).json({ success: false, message: MESSAGES.SERVER_ERROR });
    }
  }

  async getProductListByCategory(req, res) {
    try {
      const {
        categorySlug,
        subCategorySlug,
        sortBy = "newest",
        page = 1,
        limit = 20,
        minPrice,
        maxPrice,
        condition,
        search,
      } = req.query;

      // Validate: categorySlug or subCategorySlug required, EXCEPT when search is provided (global search)
      if (!categorySlug && !subCategorySlug && !search) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.PRODUCT.CATEGORY_SLUG_REQUIRED,
        });
      }

      // Find category by slug if provided
      let categoryId = null;
      if (categorySlug) {
        const category = await Category.findOne({ slug: categorySlug });
        if (!category) {
          return res.status(404).json({
            success: false,
            message: MESSAGES.PRODUCT.CATEGORY_NOT_FOUND,
          });
        }
        categoryId = category._id;
      }

      // Find subcategory by slug if provided
      let subcategoryId = null;
      if (subCategorySlug) {
        const subcategory = await SubCategory.findOne({
          slug: subCategorySlug,
        });
        if (!subcategory) {
          return res.status(404).json({
            success: false,
            message: MESSAGES.PRODUCT.SUBCATEGORY_NOT_FOUND,
          });
        }
        subcategoryId = subcategory._id;
      }

      const query = { status: { $in: ["approved", "active"] }, stock: { $gt: 0 } };

      // N\u1ebfu c\u00f3 subcategoryId => filter theo subcategoryId th\u00f4i (subcategory \u0111\u00e3 thu\u1ed9c category \u0111\u00f3)
      // N\u1ebfu ch\u01b0a c\u00f3 categoryId => filter theo categoryId
      if (subcategoryId) {
        query.subcategoryId = subcategoryId;
      } else if (categoryId) {
        query.categoryId = categoryId;
      }

      // Price filter
      if (minPrice || maxPrice) {
        query.price = {};
        if (minPrice) {
          query.price.$gte = parseFloat(minPrice);
        }
        if (maxPrice) {
          query.price.$lte = parseFloat(maxPrice);
        }
      }

      // Condition filter
      if (condition) query.condition = condition;

      // Search filter
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }

      // Build sort object
      let sortObject = {};
      switch (sortBy) {
        case "newest":
          sortObject = { createdAt: -1 };
          break;
        case "oldest":
          sortObject = { createdAt: 1 };
          break;
        case "price_low":
          sortObject = { price: 1 };
          break;
        case "price_high":
          sortObject = { price: -1 };
          break;
        case "popular":
          sortObject = { soldCount: -1, views: -1 };
          break;
        default:
          sortObject = { createdAt: -1 };
      }

      // Pagination
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 20;
      const skip = (pageNum - 1) * limitNum;

      // Get total count
      const total = await Product.countDocuments(query);

      // Fetch products with pagination and sort
      const products = await Product.find(query)
        .populate({
          path: "sellerId",
          select: "fullName avatar role",
        })
        .populate({
          path: "categoryId",
          select: "name slug",
        })
        .populate({
          path: "subcategoryId",
          select: "name slug",
        })
        .populate({
          path: "address",
          select: "provinceId districtId wardCode specificAddress fullName phoneNumber",
        })
        .sort(sortObject)
        .skip(skip)
        .limit(limitNum);

      // Get seller account IDs
      const sellerAccountIds = products
        .map((p) => p.sellerId?._id)
        .filter((id) => id != null && id !== undefined);

      // Fetch sellers
      const sellers = await Seller.find({
        accountId: { $in: sellerAccountIds },
      });

      // Create seller map
      const sellerMap = new Map();
      sellers.forEach((seller) => {
        if (seller.accountId) {
          sellerMap.set(seller.accountId.toString(), seller);
        }
      });

      // Map products with seller info
      const productsWithSeller = products.map((product) => {
        const sellerId = product.sellerId?._id;
        const seller = sellerId ? sellerMap.get(sellerId.toString()) : null;

        return {
          _id: product._id,
          name: product.name,
          description: product.description,
          price: product.price,
          stock: product.stock ?? 0,
          avatar: product.avatar,
          category: product.categoryId,
          subCategory: product.subcategoryId,
          slug: product.slug,
          condition: product.condition,
          seller: {
            _id: sellerId,
            name: product.sellerId?.fullName,
            avatar: product.sellerId?.avatar ?? null,
            role: product.sellerId?.role,
            province: seller?.province,
            from_province_id: product.address?.provinceId ?? seller?.from_province_id ?? null,
          },
          createdAt: product.createdAt,
          updatedAt: product.updatedAt,
          status: product.status,
          views: product.views || 0,
        };
      });

      // Check for personal discounts if user is logged in
      if (req.accountID) {
        const productIds = productsWithSeller.map(p => p._id);
        const personalDiscounts = await PersonalDiscount.find({
          productId: { $in: productIds },
          buyerId: req.accountID,
          isUse: false,
          endDate: { $gt: new Date() },
        });

        // Create a map of productId -> discount
        const discountMap = new Map();
        personalDiscounts.forEach(discount => {
          discountMap.set(discount.productId.toString(), discount);
        });

        // Apply discounts to products
        productsWithSeller.forEach(product => {
          const discount = discountMap.get(product._id.toString());
          if (discount) {
            product.originalPrice = product.price;
            product.price = discount.price;
            product.hasPersonalDiscount = true;
            product.personalDiscountId = discount._id;
          }
        });
      }

      // Calculate total pages
      const totalPages = Math.ceil(total / limitNum);

      res.json({
        success: true,
        data: productsWithSeller,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
      });
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({
        success: false,
        message: MESSAGES.SERVER_ERROR,
        error: error.message,
      });
    }
  }


  async searchProducts(req, res) {
    try {
      const {
        q,
        sortBy = "newest",
        page = 1,
        limit = 20,
        minPrice,
        maxPrice,
      } = req.query;

      if (!q || typeof q !== "string" || q.trim().length === 0) {
        return res.status(200).json({
          success: true,
          data: [],
          total: 0,
          page: 1,
          limit: parseInt(limit) || 20,
          totalPages: 0,
        });
      }

      const searchTerm = q.trim();

      const query = {
        status: { $in: ["approved", "active"] },
        stock: { $gt: 0 },
        $or: [
          { name: { $regex: searchTerm, $options: "i" } },
          { description: { $regex: searchTerm, $options: "i" } },
          { slug: { $regex: searchTerm.replace(/\s+/g, "-"), $options: "i" } },
        ],
      };

      if (req.accountID) {
        query.sellerId = { $ne: req.accountID };
      }

      if (minPrice || maxPrice) {
        query.price = {};
        if (minPrice) query.price.$gte = parseFloat(minPrice);
        if (maxPrice) query.price.$lte = parseFloat(maxPrice);
      }

      let sortObject = { createdAt: -1 };
      switch (sortBy) {
        case "oldest":
          sortObject = { createdAt: 1 };
          break;
        case "price_low":
          sortObject = { price: 1 };
          break;
        case "price_high":
          sortObject = { price: -1 };
          break;
        case "popular":
          sortObject = { soldCount: -1, views: -1 };
          break;
        default:
          sortObject = { createdAt: -1 };
      }

      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 20;
      const skip = (pageNum - 1) * limitNum;

      const total = await Product.countDocuments(query);

      const products = await Product.find(query)
        .populate({ path: "sellerId", select: "fullName avatar role" })
        .populate({ path: "categoryId", select: "name slug" })
        .populate({ path: "subcategoryId", select: "name slug" })
        .populate({ path: "address", select: "provinceId districtId wardCode specificAddress fullName phoneNumber" })
        .sort(sortObject)
        .skip(skip)
        .limit(limitNum);

      const sellerAccountIds = products
        .map((p) => p.sellerId?._id)
        .filter((id) => id != null);
      const sellers = await Seller.find({
        accountId: { $in: sellerAccountIds },
      });
      const sellerMap = new Map();
      sellers.forEach((s) => {
        if (s.accountId) sellerMap.set(s.accountId.toString(), s);
      });

      const productsWithSeller = products.map((product) => {
        const sellerId = product.sellerId?._id;
        const seller = sellerId ? sellerMap.get(sellerId.toString()) : null;
        return {
          _id: product._id,
          name: product.name,
          description: product.description,
          price: product.price,
          stock: product.stock ?? 0,
          avatar: product.avatar,
          category: product.categoryId,
          subCategory: product.subcategoryId,
          slug: product.slug,
          condition: product.condition || "good",
          seller: {
            _id: sellerId,
            name: product.sellerId?.fullName,
            avatar: product.sellerId?.avatar ?? null,
            role: product.sellerId?.role,
            province: seller?.province,
            from_province_id: product.address?.provinceId ?? seller?.from_province_id ?? null,
          },
          createdAt: product.createdAt,
          updatedAt: product.updatedAt,
          status: product.status,
          views: product.views ?? 0,
        };
      });

      if (req.accountID) {
        const productIds = productsWithSeller.map((p) => p._id);
        const personalDiscounts = await PersonalDiscount.find({
          productId: { $in: productIds },
          buyerId: req.accountID,
          isUse: false,
          endDate: { $gt: new Date() },
        });
        const discountMap = new Map();
        personalDiscounts.forEach((d) => discountMap.set(d.productId.toString(), d));
        productsWithSeller.forEach((product) => {
          const discount = discountMap.get(product._id.toString());
          if (discount) {
            product.originalPrice = product.price;
            product.price = discount.price;
            product.hasPersonalDiscount = true;
            product.personalDiscountId = discount._id;
          }
        });
      }

      const totalPages = Math.ceil(total / limitNum);

      return res.json({
        success: true,
        data: productsWithSeller,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
      });
    } catch (error) {
      console.error("Error searching products:", error);
      res.status(500).json({
        success: false,
        message: MESSAGES.SERVER_ERROR,
        error: error.message,
      });
    }
  }

  async getProduct(req, res) {
    try {
      const { productID } = req.params;

      if (!productID) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.PRODUCT.ID_REQUIRED,
        });
      }

      const product = await Product.findById(productID)
        .populate({
          path: "attributes",
          select: "key value",
        })
        .populate("sellerId")
        .populate({
          path: "categoryId",
          select: "name",
        })
        .populate({
          path: "subcategoryId",
          select: "name",
        })
        .populate({
          path: "address",
        })
        .lean();

      if (!product) {
        return res.status(404).json({
          success: false,
          message: MESSAGES.PRODUCT.NOT_FOUND,
        });
      }

      let seller = null;
      let totalReviews = 0;
      let avgRating = 0;

      if (product.sellerId) {
        seller = await Seller.findOne({ accountId: product.sellerId._id })
          .select(
            "province district  from_district_id from_ward_code createdAt businessAddress"
          )
          .populate("accountId", "phoneNumber")
          .lean();

        const [reviews, totalActiveProducts] = await Promise.all([
          SellerReview.find({ sellerId: product.sellerId._id }),
          Product.countDocuments({ sellerId: product.sellerId._id, status: { $in: ["approved", "active"] } })
        ]);
        totalReviews = reviews.length;
        avgRating =
          totalReviews > 0
            ? (
                reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
              ).toFixed(1)
            : 0;
        seller = { ...seller, totalActiveProducts };
      }
      const {
        sellerId,
        aiModerationResult,
        categoryId,
        subcategoryId,
        ...restProduct
      } = product;

      // \u0110\u1ecba ch\u1ec9 l\u1ea5y h\u00e0ng t\u1eeb Address ref (buyer nh\u1eadp inline / seller ch\u1ecdn s\u1eb5n)
      const addrDoc = product.address;

      // Check for personal discount if user is logged in
      let finalPrice = restProduct.price;
      let originalPrice = null;
      let hasPersonalDiscount = false;
      let personalDiscountId = null;

      if (req.accountID) {
        const personalDiscount = await PersonalDiscount.findOne({
          productId: productID,
          buyerId: req.accountID,
          isUse: false,
          endDate: { $gt: new Date() },
        });

        if (personalDiscount) {
          originalPrice = restProduct.price;
          finalPrice = personalDiscount.price;
          hasPersonalDiscount = true;
          personalDiscountId = personalDiscount._id;
        }
      }

      const productData = {
        ...restProduct,
        price: finalPrice,
        originalPrice: originalPrice,
        hasPersonalDiscount: hasPersonalDiscount,
        personalDiscountId: personalDiscountId,
        address: addrDoc || null,
        seller: {
          _id: sellerId?._id,
          avatar: product.sellerId?.avatar || null,
          fullName: product.sellerId?.fullName || "Người bán ẩn danh",
          role: product.sellerId?.role || null,
          createdAt: product.sellerId?.createdAt || null,
          totalReviews,
          avgRating,
          totalActiveProducts: seller?.totalActiveProducts ?? 0,
        },
        category: {
          _id: categoryId?._id,
          name: categoryId?.name || "Kh\u00f4ng x\u00e1c \u0111\u1ecbnh",
        },
        subcategory: {
          _id: subcategoryId?._id,
          name: subcategoryId?.name || "Kh\u00f4ng x\u00e1c \u0111\u1ecbnh",
        },
        estimatedWeight: product.estimatedWeight?.value
          ? {
              value: product.estimatedWeight.value,
              confidence: product.estimatedWeight.confidence,
            }
          : null,
      };

      res.json({
        success: true,
        data: productData,
      });
    } catch (error) {
      console.error("Error fetching product:", error);

      // 3. C\u1ea3i thi\u1ec7n error handling
      if (error.name === "CastError") {
        return res.status(400).json({
          success: false,
          message: MESSAGES.PRODUCT.INVALID_ID,
        });
      }

      if (error.name === "ValidationError") {
        return res.status(400).json({
          success: false,
          message: MESSAGES.PRODUCT.VALIDATION_FAILED,
        });
      }

      res.status(500).json({
        success: false,
        message: MESSAGES.SERVER_ERROR,
      });
    }
  }

  async getProducts(req, res) {
    try {
      const { limit = 20, status, page = 1 } = req.query;
      const query = {};
      if (status && ["pending", "approved", "rejected", "under_review", "review_requested", "active", "inactive", "sold"].includes(status)) {
        query.status = status;
      }
      // Kh\u00f4ng filter status khi l\u00e0 "T\u1ea5t c\u1ea3" => admin th\u1ea5y m\u1ecdi s\u1ea3n ph\u1ea9m
      const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(limit) || 0;

      const products = await Product.find(query)
        .populate({
          path: "sellerId",
          select: "fullName username email phoneNumber role",
        })
        .populate({
          path: "categoryId",
          select: "name",
        })
        .populate({
          path: "subcategoryId",
          select: "name",
        })
        .populate({
          path: "attributes",
          select: "key value",
        })
        .populate({
          path: "address",
          select: "provinceId districtId wardCode specificAddress fullName phoneNumber",
        })
        .skip(skip)
        .limit(parseInt(limit) || 20)
        .sort({ createdAt: -1 });

      const total = await Product.countDocuments(query);

      const sellerIds = [
        ...new Set(
          products
            .map((product) => product.sellerId?._id)
            .filter((id) => id != null)
        ),
      ];

      const sellers = await Seller.find({ accountId: { $in: sellerIds } });

      const mappedProducts = products.map((product) => {
        const sellerId = product.sellerId?._id;
        const seller = sellerId
          ? sellers.find(
              (s) => s.accountId && s.accountId.toString() === sellerId.toString()
            )
          : null;

        return {
          _id: product._id,
          name: product.name,
          slug: product.slug,
          price: product.price,
          avatar: product.avatar,
          stock: product.stock,
          description: product.description,
          category: product.categoryId,
          subcategory: product.subcategoryId,
          attributes: product.attributes,
          images: product.images,
          status: product.status,
          condition: product.condition,
          estimatedWeight: product.estimatedWeight,
          aiModerationResult: product.aiModerationResult,
          soldCount: product.soldCount,
          createdAt: product.createdAt,
          updatedAt: product.updatedAt,
          seller: seller
            ? {
                _id: seller._id,
                accountId: seller.accountId,
                businessAddress: seller.businessAddress,
                province: seller.province,
                district: seller.district,
                ward: seller.ward,
                stats: {
                  avgRating: seller.stats?.avgRating ?? 0,
                  totalReviews: seller.stats?.totalReviews ?? 0,
                  totalProductsActive: seller.stats?.totalProductsActive ?? 0,
                },
                createdAt: seller.createdAt ?? null,
                account: {
                  _id: product.sellerId._id,
                  fullName: product.sellerId.fullName,
                  username: product.sellerId.username,
                  email: product.sellerId.email,
                  phoneNumber: product.sellerId.phoneNumber ?? null,
                  role: product.sellerId.role ?? null,
                },
              }
            : (product.sellerId && {
                _id: product.sellerId._id,
                account: {
                  _id: product.sellerId._id,
                  fullName: product.sellerId.fullName,
                  username: product.sellerId.username,
                  email: product.sellerId.email,
                },
              }),
          address: product.address ?? null,
        };
      });

      res.json({
        success: true,
        data: mappedProducts,
        total,
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
      });
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ success: false, message: MESSAGES.SERVER_ERROR });
    }
  }

  async addProduct(req, res) {
    try {
      const account = await Account.findById(req.accountID).select("role");
      const isSeller = account && account.role === "seller";

      if (!isSeller) {
        const productCount = await Product.countDocuments({
          sellerId: req.accountID,
        });
        if (productCount >= UNVERIFIED_SELLER_PRODUCT_LIMIT) {
          return res.status(400).json({
            success: false,
            message: `B\u1ea1n \u0111\u00e3 \u0111\u0103ng t\u1ea3i \u0111\u1ee7 ${UNVERIFIED_SELLER_PRODUCT_LIMIT} s\u1ea3n ph\u1ea9m. \u0110\u1ec3 ti\u1ebfp t\u1ee5c \u0111\u0103ng kh\u00f4ng gi\u1edbi h\u1ea1n v\u00e0 nh\u1eadn thanh to\u00e1n online, vui l\u00f2ng x\u00e1c minh t\u00e0i kho\u1ea3n seller t\u1ea1i /become-seller.`,
          });
        }
      }

      const formatAttributes = JSON.parse(req.body.attributes);
      const attributes = formatAttributes
        .map((attribute) => {
          const { id, ...attributeWithoutId } = attribute;
          const key = sanitizeAttributeKey(attributeWithoutId?.key);
          return {
            ...attributeWithoutId,
            key,
          };
        })
        .filter((attribute) => attribute.key);

      if (attributes.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Thuộc tính sản phẩm không hợp lệ",
        });
      }

      const newAttributes = await Attribute.insertMany(attributes);

      const uploadStartTime = Date.now();
      let uploadedFiles = [];
      if (req.files?.images && req.files.images.length > 0) {
        console.log(`[UPLOAD] Starting upload of ${req.files.images.length} images to Cloudinary...`);
        uploadedFiles = await uploadMultipleToCloudinary(
          req.files.images,
          "products/images"
        );
        console.log(`[UPLOAD] Uploaded ${uploadedFiles.length} images in ${Date.now() - uploadStartTime}ms`);
      }

      let uploadedVideo = null;
      if (req.files?.video && req.files.video.length > 0) {
        console.log(`[UPLOAD] Starting upload of video to Cloudinary...`);
        const videoUploadStart = Date.now();
        uploadedVideo = await uploadToCloudinary(
          req.files.video[0],
          "products/videos"
        );
        console.log(`[UPLOAD] Uploaded video in ${Date.now() - videoUploadStart}ms`);
      }

      const formatFileData = (fileData) => {
        if (!fileData) return null;
        return {
          url: fileData.url,
          publicId: fileData.publicId,
          originalName: fileData.name,
          type: fileData.type,
          size: fileData.size,
          uploadedAt: new Date(),
        };
      };


      const { addressId } = req.body;
      if (!addressId || !mongoose.Types.ObjectId.isValid(addressId)) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.PRODUCT.SELLER_ADDRESS_REQUIRED,
        });
      }
      const existing = await Address.findOne({ _id: addressId, accountId: req.accountID });
      if (!existing) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.PRODUCT.SELLER_ADDRESS_INVALID,
        });
      }
      const resolvedAddressId = existing._id;

      let parsedDeliveryOptions = { localPickup: true, codShipping: false };
      if (req.body.deliveryOptions) {
        try {
          parsedDeliveryOptions =
            typeof req.body.deliveryOptions === "string"
              ? JSON.parse(req.body.deliveryOptions)
              : req.body.deliveryOptions;
        } catch {
          // keep default
        }
      }
      if (!parsedDeliveryOptions.localPickup && !parsedDeliveryOptions.codShipping) {
        return res.status(400).json({
          success: false,
          message: "Vui lòng chọn ít nhất một hình thức giao hàng",
        });
      }

      // ⭐ PREPARE PRODUCT DATA
      const productData = {
        ...req.body,
        sellerId: req.accountID,
        address: resolvedAddressId,
        deliveryOptions: parsedDeliveryOptions,
        images: uploadedFiles.map((file) => formatFileData(file)),
        avatar:
          uploadedFiles.length > 0 ? formatFileData(uploadedFiles[0]) : null,
        video: uploadedVideo ? formatFileData(uploadedVideo) : null,
        attributes: newAttributes.map((attribute) => attribute._id),
        createdAt: new Date(),
      };

      const newProduct = await Product.create({
        ...productData,
        status: "pending",
        aiModerationResult: {
          approved: null,
          confidence: 0,
          reasons: [],
          reviewedAt: null,
          processingStarted: new Date(),
        },
      });

      res.status(201).json({
        success: true,
        message: MESSAGES.PRODUCT.CREATE_SUCCESS,
        product: {
          id: newProduct._id,
          name: newProduct.name,
          status: "pending",
        },
        estimatedProcessingTime: "30-60 giây",
      });

      setImmediate(async () => {
        try {
          await processEnhancedAIModerationBackground(
            newProduct._id,
            productData
          );
        } catch (error) {
          console.error(
            `\ud83d\udeab AI moderation failed for product ${newProduct._id}:`,
            error.message
          );
        }
      });

      // NOTE:
      // Không tạo embedding ở bước addProduct vì sản phẩm đang pending.
      // Embedding sẽ được tạo khi sản phẩm được duyệt (approved/active).
    } catch (error) {
      console.error("\ud83d\udeab Product creation error:", error);
      res.status(400).json({
        success: false,
        message: MESSAGES.PRODUCT.CREATE_FAILED,
        error: error.message,
      });
    }
  }
  async updateStatusProduct(req, res) {
    try {
      const productId = req.params.productId || req.body.productId;
      const { status, reason } = req.body;
      if (!productId) {
        return res.status(400).json({ error: "Product ID is required" });
      }
      if (!["approved", "rejected", "pending", "under_review", "review_requested", "active", "inactive"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      // \u2b50 Khi t\u1eeb ch\u1ed1i ph\u1ea3i c\u00f3 l\u00fd do
      if (status === "rejected" && (!reason || !reason.trim())) {
        return res.status(400).json({
          success: false,
          error: "Lý do từ chối là bắt buộc",
          message: MESSAGES.PRODUCT.REJECT_REASON_REQUIRED,
        });
      }

      const updateData = { status };
      
      // \u2b50 L\u01b0u l\u00fd do t\u1eeb ch\u1ed1i v\u00e0o aiModerationResult
      if (status === "rejected" && reason) {
        const product = await Product.findById(productId);
        updateData["aiModerationResult.rejectionReason"] = reason.trim();
        updateData["aiModerationResult.rejectedBy"] = req.accountID;
        updateData["aiModerationResult.rejectedAt"] = new Date();
        updateData["aiModerationResult.reasons"] = [
          ...(product?.aiModerationResult?.reasons || []),
          `\ud83d\udc4e Admin t\u1eeb ch\u1ed1i: ${reason.trim()}`,
        ];
      }

      // ⭐ Nếu approve thì reset rejection reason
      if (status === "approved" || status === "active") {
        updateData["aiModerationResult.rejectionReason"] = null;
        updateData["aiModerationResult.approvedBy"] = req.accountID;
        updateData["aiModerationResult.approvedAt"] = new Date();
      }

      const updatedProduct = await Product.findOneAndUpdate(
        { _id: productId },
        { $set: updateData },
        { new: true }
      ).populate('sellerId', 'email fullName');

      if (!updatedProduct) {
        return res.status(404).json({ error: "Product not found" });
      }

      if (status === "approved" || status === "active") {
        setImmediate(async () => {
          try {
            await generateAndSaveEmbedding(updatedProduct._id, {
              name: updatedProduct.name,
              description: updatedProduct.description,
              condition: updatedProduct.condition,
            });
            await upsertApprovedProductToMeili(updatedProduct._id);
          } catch (error) {
            console.error(
              `[Embedding] updateStatusProduct failed for ${updatedProduct._id}:`,
              error.message
            );
          }
        });
      }

      // G\u1eedi email th\u00f4ng b\u00e1o k\u1ebft qu\u1ea3 duy\u1ec7t
      if ((status === "approved" || status === "active") && updatedProduct.sellerId) {
        try {
          await sendProductApprovedEmail(
            updatedProduct.sellerId.email,
            updatedProduct.sellerId.fullName,
            updatedProduct
          );
        } catch (emailError) {
          console.error("L\u1ed7i g\u1eedi email product approved:", emailError);
        }
      }

      if (status === "rejected" && updatedProduct.sellerId) {
        try {
          await sendProductRejectedEmail(
            updatedProduct.sellerId.email,
            updatedProduct.sellerId.fullName,
            updatedProduct,
            reason
          );
        } catch (emailError) {
          console.error("L\u1ed7i g\u1eedi email product rejected:", emailError);
        }
      }

      if (status === "under_review" && updatedProduct.sellerId) {
        try {
          await sendProductUnderReviewEmail(
            updatedProduct.sellerId.email,
            updatedProduct.sellerId.fullName,
            updatedProduct
          );
        } catch (emailError) {
          console.error("L\u1ed7i g\u1eedi email product under_review:", emailError);
        }
      }

      // Thông báo realtime trong hệ thống: lưu DB + emit socket cho seller (đã gửi email ở trên)
      try {
        const io = req.app.get("io");
        const sellerAccountId = updatedProduct.sellerId?._id ?? updatedProduct.sellerId;
        if (io && sellerAccountId) {
          const productName = updatedProduct.name && updatedProduct.name.length > 40
            ? updatedProduct.name.slice(0, 40) + "..."
            : updatedProduct.name;
          let notification = null;
          if (status === "approved" || status === "active") {
            notification = {
              type: "product",
              title: "Sản phẩm đã được duyệt! 🎉",
              message: `"${productName}" đã được admin chấp thuận và hiển thị trên sàn.`,
              link: "/my/listings",
              productId: updatedProduct._id,
            };
          } else if (status === "rejected") {
            notification = {
              type: "product",
              title: "Sản phẩm bị từ chối ❌",
              message: `"${productName}" bị từ chối. Lý do: ${reason && reason.trim() ? reason.trim() : "Không rõ"}`,
              link: "/my/listings",
              productId: updatedProduct._id,
            };
          } else if (status === "under_review") {
            notification = {
              type: "product",
              title: "Sản phẩm đang được xem xét ⏳",
              message: `"${productName}" đang được admin xem xét thủ công.`,
              link: "/my/listings",
              productId: updatedProduct._id,
            };
          }
          if (notification) {
            await saveAndEmitNotification(io, sellerAccountId, notification);
          }
        }
      } catch (socketError) {
        console.error("Failed to save/emit product notification:", socketError);
      }

      res.status(200).json({
        success: true,
        ...updatedProduct.toObject(),
      });
    } catch (error) {
      console.error("Error updating product status:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
  async deleteProduct(req, res) {
    try {
      const { productId } = req.params;

      const existingOrder = await Order.findOne({
        status: { $in: ORDER_STATUS_BLOCKING_DELETE },
        "products.productId": productId,
      }).lean();

      if (existingOrder) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.PRODUCT.DELETE_HAS_ORDERS,
        });
      }

      const product = await Product.findById(productId).lean();
      if (product) {
        // Xóa ảnh và video trên Cloudinary khi xóa sản phẩm
        if (product.images?.length > 0) {
          const imageIds = product.images.map((img) => img.publicId).filter(Boolean);
          if (imageIds.length > 0) {
            await deleteMultipleFromCloudinary(imageIds).catch((err) =>
              console.error("Cloudinary delete images:", err.message)
            );
          }
        }
        if (product.avatar?.publicId) {
          await deleteFromCloudinary(product.avatar.publicId).catch((err) =>
            console.error("Cloudinary delete avatar:", err.message)
          );
        }
        if (product.video?.publicId) {
          await deleteFromCloudinary(product.video.publicId, {
            resource_type: "video",
          }).catch((err) =>
            console.error("Cloudinary delete video:", err.message)
          );
        }
      }

      await Product.findByIdAndDelete(productId);
      res.status(200).json({ message: MESSAGES.PRODUCT.DELETE_SUCCESS });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: MESSAGES.PRODUCT.DELETE_ERROR });
    }
  }
  /**
   * GET /my/listings - Danh s\u00e1ch s\u1ea3n ph\u1ea9m c\u1ee7a user (ch\u1ec9 fields c\u1ea7n cho list view).
   * Khi user b\u1ea5m Edit th\u00ec FE g\u1ecdi GET /:productID (getProduct) \u0111\u1ec3 l\u1ea5y chi ti\u1ebft \u0111\u1ea7y \u0111\u1ee7 cho form.
   */
  async getProductOfUser(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
      const skip = (pageNum - 1) * limitNum;

      const filter = { sellerId: req.accountID };

      const [productData, total] = await Promise.all([
        Product.find(filter)
          .select(
            "name slug price stock status avatar categoryId subcategoryId createdAt aiModerationResult.rejectionReason aiModerationResult.humanReviewRequested"
          )
          .populate("categoryId", "name _id")
          .populate("subcategoryId", "name _id")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Product.countDocuments(filter),
      ]);

      const productIds = productData.map((p) => p._id);
      const activeDiscounts = await PersonalDiscount.find({
        sellerId: req.accountID,
        productId: { $in: productIds },
        isUse: false,
        endDate: { $gt: new Date() },
      })
        .populate("buyerId", "fullName")
        .lean();
      const discountMap = new Map();
      activeDiscounts.forEach((d) => {
        const pid = d.productId.toString();
        if (!discountMap.has(pid)) discountMap.set(pid, []);
        discountMap.get(pid).push(d);
      });
      const enrichedData = productData.map((p) => ({
        ...p,
        personalDiscounts: discountMap.get(p._id.toString()) || [],
      }));

      return res.status(200).json({
        success: true,
        data: enrichedData,
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalItems: total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ success: false, message: MESSAGES.SERVER_ERROR });
    }
  }

  // \u2b50 User y\u00eau c\u1ea7u duy\u1ec7t l\u1ea1i s\u1ea3n ph\u1ea9m b\u1ecb AI reject (kh\u00f4ng qua AI n\u1eefa, g\u1eedi th\u1eb3ng cho admin)
  // \u2b50 CH\u1ec8 \u0110\u01af\u1ee2C Y\u00caU C\u1ea6U 1 L\u1ea6N - sau \u0111\u00f3 ph\u1ea3i s\u1eeda s\u1ea3n ph\u1ea9m \u0111\u1ec3 y\u00eau c\u1ea7u l\u1ea1i
  async requestReview(req, res) {
    try {
      const { productId } = req.params;
      const product = await Product.findById(productId);

      if (!product) {
        return res.status(404).json({
          success: false,
          message: MESSAGES.PRODUCT.NOT_FOUND,
        });
      }

      // Ch\u1ec9 cho ph\u00e9p user s\u1edf h\u1eefu s\u1ea3n ph\u1ea9m m\u1edbi \u0111\u01b0\u1ee3c y\u00eau c\u1ea7u duy\u1ec7t l\u1ea1i
      if (product.sellerId.toString() !== req.accountID.toString()) {
        return res.status(403).json({
          success: false,
          message: MESSAGES.PRODUCT.REVIEW_REQUEST_UNAUTHORIZED,
        });
      }

      // Ch\u1ec9 cho ph\u00e9p y\u00eau c\u1ea7u duy\u1ec7t l\u1ea1i n\u1ebfu s\u1ea3n ph\u1ea9m \u0111ang \u1edf tr\u1ea1ng th\u00e1i rejected
      if (product.status !== "rejected") {
        return res.status(400).json({
          success: false,
          message: MESSAGES.PRODUCT.REVIEW_REQUEST_INVALID_STATUS,
        });
      }

      // \u2b50 KI\u1ec2M TRA: \u0110\u00e3 y\u00eau c\u1ea7u duy\u1ec7t l\u1ea1i ch\u01b0a? (ch\u1ec9 \u0111\u01b0\u1ee3c 1 l\u1ea7n)
      const hasRequestedBefore =
        product.aiModerationResult?.humanReviewRequested === true;
      
      if (hasRequestedBefore) {
        return res.status(400).json({
          success: false,
          message:
            "B\u1ea1n \u0111\u00e3 y\u00eau c\u1ea7u duy\u1ec7t l\u1ea1i 1 l\u1ea7n. Vui l\u00f2ng s\u1eeda s\u1ea3n ph\u1ea9m v\u00e0 \u0111\u0103ng l\u1ea1i \u0111\u1ec3 y\u00eau c\u1ea7u duy\u1ec7t l\u1ea1i.",
          canEdit: true, // Cho frontend biết có thỒ sửa
        });
      }

      // C\u1eadp nh\u1eadt tr\u1ea1ng th\u00e1i th\u00e0nh "review_requested" (status ri\u00eang bi\u1ec7t, kh\u00f4ng ph\u1ea3i under_review)
      product.status = "review_requested";
      product.aiModerationResult = {
        ...product.aiModerationResult,
        humanReviewRequested: true,
        humanReviewRequestedAt: new Date(),
        humanReviewRequestedBy: req.accountID,
        bypassAI: true, // Đánh dấu không qua AI nữa
        reasons: [
          ...(product.aiModerationResult?.reasons || []),
          "\u2b50 User y\u00eau c\u1ea7u duy\u1ec7t l\u1ea1i - G\u1eedi th\u1eb3ng cho admin (kh\u00f4ng qua AI)",
        ],
      };

      await product.save();

      console.log(
        `[REVIEW] User ${req.accountID} requested review for product ${productId} - Sent to admin (bypass AI)`
      );

      res.status(200).json({
        success: true,
        message: MESSAGES.PRODUCT.REVIEW_REQUEST_SUCCESS,
        product: {
          id: product._id,
          name: product.name,
          status: product.status,
        },
      });
    } catch (error) {
      console.error("Error requesting review:", error);
      res.status(500).json({
        success: false,
        message: MESSAGES.PRODUCT.REVIEW_REQUEST_FAILED,
        error: error.message,
      });
    }
  }

  async updateProduct(req, res) {
    try {
      const { productId } = req.params;
      const { existingImages, removeAvatar } = req.body;

      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ message: MESSAGES.PRODUCT.NOT_FOUND });
      }

      if (req.files?.avatar) {
        const avatarUpload = await uploadToCloudinary(
          req.files.avatar[0],
          "products/avatars"
        );

        if (product.avatar?.publicId) {
          await deleteFromCloudinary(product.avatar.publicId);
        }

        product.avatar = avatarUpload;
      } else if (removeAvatar === "true" && product.avatar?.publicId) {
        await deleteFromCloudinary(product.avatar.publicId);
        product.avatar = null;
      }

      const existingImagesParsed = existingImages
        ? JSON.parse(existingImages)
        : [...product.images]; 

      const imagesToDelete = product.images.filter(
        (img) =>
          !existingImagesParsed.some(
            (existingImg) => existingImg.publicId === img.publicId
          )
      );

      // Xóa ảnh không còn sử dụng
      await deleteMultipleFromCloudinary(
        imagesToDelete.map((img) => img.publicId)
      );

      // Upload \u1ea3nh m\u1edbi
      let newImages = [];
      if (req.files?.newImages) {
        newImages = await uploadMultipleToCloudinary(
          req.files.newImages,
          "products/images"
        );
      }

      // Cập nhật danh sách ảnh
      product.images = [...existingImagesParsed, ...newImages];

      // Cập nhật các trường khác
      const updateFields = [
        "name",
        "price",
        "stock",
        "description",
        "categoryId",
        "subcategoryId",
        "condition",
        "status",
      ];
      updateFields.forEach((field) => {
        if (req.body[field] !== undefined) {
          product[field] = req.body[field];
        }
      });

      // ⭐ Cập nhật attributes
      if (req.body.attributes !== undefined) {
        try {
          const parsedAttributes = typeof req.body.attributes === "string"
            ? JSON.parse(req.body.attributes)
            : req.body.attributes;
          if (Array.isArray(parsedAttributes)) {
            // Xoa cac Attribute docs cu
            if (product.attributes?.length) {
              await Attribute.deleteMany({ _id: { $in: product.attributes } });
            }
            // Insert cac { key, value } moi thanh Attribute docs
            const cleaned = parsedAttributes
              .filter((a) => a.key && a.value !== undefined && a.value !== "")
              .map(({ key, value }) => ({ key, value }));
            if (cleaned.length > 0) {
              const newAttrs = await Attribute.insertMany(cleaned);
              product.attributes = newAttrs.map((a) => a._id);
            } else {
              product.attributes = [];
            }
          }
        } catch (e) {
          console.warn("Could not parse attributes:", e.message);
        }
      }

      // ⭐ Cập nhật address – tất cả users dùng addressId từ danh sách đã lưu
      if (req.body.addressId && mongoose.Types.ObjectId.isValid(req.body.addressId)) {
        const existing = await Address.findOne({ _id: req.body.addressId, accountId: req.accountID });
        if (existing) product.address = existing._id;
      }

      // ⭐ Cập nhật deliveryOptions
      if (req.body.deliveryOptions) {
        try {
          const parsed =
            typeof req.body.deliveryOptions === "string"
              ? JSON.parse(req.body.deliveryOptions)
              : req.body.deliveryOptions;
          if (parsed.localPickup || parsed.codShipping) {
            product.deliveryOptions = parsed;
          }
        } catch {
          // ignore invalid deliveryOptions
        }
      }

      // \u2b50 Khi user s\u1eeda s\u1ea3n ph\u1ea9m \u0111ang \u1edf review_requested => reset v\u1ec1 pending (qua AI l\u1ea1i)
      if (product.status === "review_requested") {
        product.status = "pending";
        product.aiModerationResult.humanReviewRequested = false;
        product.aiModerationResult.humanReviewRequestedAt = null;
        product.aiModerationResult.humanReviewRequestedBy = null;
      } else if (product.status === "rejected" && product.aiModerationResult?.humanReviewRequested) {
      // Sau khi admin reject l\u1ea1i t\u1eeb review_requested => user ph\u1ea3i s\u1eeda => reset
        product.aiModerationResult.humanReviewRequested = false;
        product.aiModerationResult.humanReviewRequestedAt = null;
        product.aiModerationResult.humanReviewRequestedBy = null;
      }

      await product.save();

      const shouldRebuildEmbedding = ["name", "description", "condition"].some(
        (field) => req.body[field] !== undefined,
      );
      const isSearchableStatus = ["approved", "active"].includes(product.status);
      if (shouldRebuildEmbedding && isSearchableStatus) {
        setImmediate(async () => {
          try {
            await generateAndSaveEmbedding(product._id, {
              name: product.name,
              description: product.description,
              condition: product.condition,
            });
          } catch (error) {
            console.error(`[Embedding] updateProduct failed for ${product._id}:`, error.message);
          }
        });
      }
      res.json({
        success: true,
        message: MESSAGES.PRODUCT.UPDATE_SUCCESS,
        product: {
          id: product._id,
          name: product.name,
          status: product.status,
        },
      });
    } catch (error) {
      console.error("Error updating product:", error);
      res.status(500).json({ message: error.message });
    }
  }

}

module.exports = new ProductController();

