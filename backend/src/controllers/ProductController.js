const Attribute = require("../models/Attribute");
const Product = require("../models/Product");
const Category = require("../models/Category");
const SubCategory = require("../models/SubCategory");
const Account = require("../models/Account");
const mongoose = require("mongoose");

const {
  deleteFromCloudinary,
  uploadMultipleToCloudinary,
  uploadToCloudinary,
  deleteMultipleFromCloudinary,
} = require("../utils/CloudinaryUpload");
const Seller = require("../models/Seller");
const {
  processEnhancedAIModerationBackground,
} = require("../services/aiModeration.service");
const SellerReview = require("../models/SellerReview");

const UNVERIFIED_SELLER_PRODUCT_LIMIT = 5;

class ProductController {
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
          message: "Category Slug or SubCategory Slug is required",
        });
      }

      // Find category by slug if provided
      let categoryId = null;
      if (categorySlug) {
        const category = await Category.findOne({ slug: categorySlug });
        if (!category) {
          return res.status(404).json({
            success: false,
            message: "Category not found",
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
            message: "SubCategory not found",
          });
        }
        subcategoryId = subcategory._id;
      }

      const query = { status: "approved", stock: { $gt: 0 } };

      if (req.accountID) {
        query.sellerId = { $ne: req.accountID };
      }

      if (categoryId) {
        query.categoryId = categoryId;
      }

      if (subcategoryId) {
        query.subcategoryId = subcategoryId;
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

      // Condition filter (if needed in future)
      if (condition) {
        // Add condition filter if product model has condition field
        // query.condition = condition;
      }

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
          select: "fullName avatar",
        })
        .populate({
          path: "categoryId",
          select: "name slug",
        })
        .populate({
          path: "subcategoryId",
          select: "name slug",
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
            province: seller?.province,
            from_province_id: product.pickupAddress?.provinceId ?? null,
          },
          createdAt: product.createdAt,
          updatedAt: product.updatedAt,
          status: product.status,
          views: product.views || 0,
        };
      });

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
        message: "Server error",
        error: error.message,
      });
    }
  }

  /**
   * GET /products/search?q=... - Tìm kiếm sản phẩm toàn hệ thống
   * Không cần category, tìm trong name + description
   */
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
        .populate({ path: "sellerId", select: "fullName avatar" })
        .populate({ path: "categoryId", select: "name slug" })
        .populate({ path: "subcategoryId", select: "name slug" })
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
            province: seller?.province,
            from_province_id: product.pickupAddress?.provinceId ?? null,
          },
          createdAt: product.createdAt,
          updatedAt: product.updatedAt,
          status: product.status,
          views: product.views ?? 0,
        };
      });

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
        message: "Server error",
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
          message: "Product ID is required",
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
        .lean();

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Sản phẩm không tồn tại",
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

        const reviews = await SellerReview.find({
          sellerId: product.sellerId._id,
        });
        totalReviews = reviews.length;
        avgRating =
          totalReviews > 0
            ? (
                reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
              ).toFixed(1)
            : 0;
      }
      const {
        sellerId,
        aiModerationResult,
        categoryId,
        subcategoryId,
        ...restProduct
      } = product;

      let subcategory = null;
      // Ưu tiên pickupAddress lưu theo sp (buyer), fallback sang Seller (verified seller)
      const pickup = product.pickupAddress?.provinceId
        ? product.pickupAddress
        : seller;

      const productData = {
        ...restProduct,
        pickupAddress: product.pickupAddress || null,
        seller: {
          _id: sellerId?._id,
          fullName: product.sellerId?.fullName || "Không xác định",
          avatar: product.sellerId?.avatar || null,
          province: pickup?.province ?? seller?.province ?? "Không xác định",
          from_province_id: pickup?.provinceId ?? null,
          from_district_id: pickup?.districtId ?? seller?.from_district_id ?? "Không xác định",
          from_ward_code: pickup?.wardCode ?? seller?.from_ward_code ?? "Không xác định",
          createdAt: seller?.createdAt || null,
          businessAddress: pickup?.businessAddress ?? seller?.businessAddress ?? "Không xác định",
          phoneNumber: pickup?.phoneNumber ?? seller?.accountId?.phoneNumber ?? "Không xác định",
          totalReviews,
          avgRating,
        },
        category: {
          _id: categoryId?._id,
          name: categoryId?.name || "Không xác định",
        },
        subcategory: {
          _id: subcategoryId?._id,
          name: subcategoryId?.name || "Không xác định",
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

      // 3. Cải thiện error handling
      if (error.name === "CastError") {
        return res.status(400).json({
          success: false,
          message: "Invalid product ID format",
        });
      }

      if (error.name === "ValidationError") {
        return res.status(400).json({
          success: false,
          message: "Product validation failed",
        });
      }

      res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  }

  async getProducts(req, res) {
    try {
      const { limit = 20, status, page = 1 } = req.query;
      const query = {};
      if (status && ["pending", "approved", "rejected", "under_review", "active", "inactive", "sold"].includes(status)) {
        query.status = status;
      } else {
        // Nếu không có status filter cụ thể, chỉ hiển thị sản phẩm approved và có stock > 0
        query.status = { $in: ["approved", "active"] };
        query.stock = { $gt: 0 };
      }
      const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(limit) || 0;

      const products = await Product.find(query)
        .populate({
          path: "sellerId",
          select: "fullName username email",
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
                account: {
                  _id: product.sellerId._id,
                  fullName: product.sellerId.fullName,
                  username: product.sellerId.username,
                  email: product.sellerId.email,
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
      res.status(500).json({ success: false, message: "Server error" });
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
            message: `Bạn đã đăng tối đa ${UNVERIFIED_SELLER_PRODUCT_LIMIT} sản phẩm. Để tiếp tục đăng không giới hạn và nhận thanh toán online, vui lòng xác minh tài khoản seller tại /become-seller.`,
          });
        }
      }

      const formatAttributes = JSON.parse(req.body.attributes);
      const attributes = formatAttributes.map((attribute) => {
        const { id, ...attributeWithoutId } = attribute;
        return attributeWithoutId;
      });

      const newAttributes = await Attribute.insertMany(attributes);

      // ⭐ Tất cả ảnh và video đều đẩy lên Cloudinary (folder products/images, products/videos)
      const uploadStartTime = Date.now();
      let uploadedFiles = [];
      if (req.files?.images && req.files.images.length > 0) {
        console.log(`📤 Starting upload of ${req.files.images.length} images to Cloudinary...`);
        uploadedFiles = await uploadMultipleToCloudinary(
          req.files.images,
          "products/images"
        );
        console.log(`✅ Uploaded ${uploadedFiles.length} images in ${Date.now() - uploadStartTime}ms`);
      }

      let uploadedVideo = null;
      if (req.files?.video && req.files.video.length > 0) {
        console.log(`📤 Starting upload of video to Cloudinary...`);
        const videoUploadStart = Date.now();
        uploadedVideo = await uploadToCloudinary(
          req.files.video[0],
          "products/videos"
        );
        console.log(`✅ Uploaded video in ${Date.now() - videoUploadStart}ms`);
      }

      // ⭐ FORMAT FILE DATA
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

      // ⭐ Pickup address (cho buyer – mỗi sp có thể khác địa chỉ)
      const pickupAddress =
        req.body.pickupProvinceId &&
        req.body.pickupDistrictId &&
        req.body.pickupWardCode &&
        req.body.pickupBusinessAddress
          ? {
              provinceId: req.body.pickupProvinceId,
              districtId: req.body.pickupDistrictId,
              wardCode: req.body.pickupWardCode,
              businessAddress: req.body.pickupBusinessAddress,
              phoneNumber: req.body.pickupPhoneNumber || null,
            }
          : null;

      // ⭐ PREPARE PRODUCT DATA
      const productData = {
        ...req.body,
        sellerId: req.accountID,
        images: uploadedFiles.map((file) => formatFileData(file)),
        avatar:
          uploadedFiles.length > 0 ? formatFileData(uploadedFiles[0]) : null,
        video: uploadedVideo ? formatFileData(uploadedVideo) : null,
        attributes: newAttributes.map((attribute) => attribute._id),
        pickupAddress,
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
        message: "Sản phẩm đã được tạo thành công! Đang kiểm duyệt bằng AI...",
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
            `❌ AI moderation failed for product ${newProduct._id}:`,
            error.message
          );
        }
      });
    } catch (error) {
      console.error("❌ Product creation error:", error);
      res.status(400).json({
        success: false,
        message: "Không thể tạo sản phẩm",
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
      if (!["approved", "rejected", "pending", "under_review", "active", "inactive"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      // ⭐ Khi từ chối phải có lý do
      if (status === "rejected" && (!reason || !reason.trim())) {
        return res.status(400).json({
          success: false,
          error: "Lý do từ chối là bắt buộc",
          message: "Vui lòng nhập lý do từ chối sản phẩm",
        });
      }

      const updateData = { status };
      
      // ⭐ Lưu lý do từ chối vào aiModerationResult
      if (status === "rejected" && reason) {
        const product = await Product.findById(productId);
        updateData["aiModerationResult.rejectionReason"] = reason.trim();
        updateData["aiModerationResult.rejectedBy"] = req.accountID;
        updateData["aiModerationResult.rejectedAt"] = new Date();
        updateData["aiModerationResult.reasons"] = [
          ...(product?.aiModerationResult?.reasons || []),
          `👤 Admin từ chối: ${reason.trim()}`,
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
      );

      if (!updatedProduct) {
        return res.status(404).json({ error: "Product not found" });
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
      res.status(200).json({ message: "Xóa sản phẩm thành công." });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Lỗi khi xóa sản phẩm." });
    }
  }
  /**
   * GET /my/listings – Danh sách sản phẩm của user (chỉ fields cần cho list view).
   * Khi user bấm Edit thì FE gọi GET /:productID (getProduct) để lấy chi tiết đầy đủ cho form.
   */
  async getProductOfUser(req, res) {
    try {
      const productData = await Product.find({ sellerId: req.accountID })
        .select(
          "name slug price stock status avatar categoryId subcategoryId createdAt aiModerationResult.rejectionReason aiModerationResult.humanReviewRequested"
        )
        .populate("categoryId", "name _id")
        .populate("subcategoryId", "name _id")
        .sort({ createdAt: -1 })
        .lean();

      return res.status(200).json({ success: true, data: productData });
    } catch (error) {
      console.error("Error fetching products:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error." });
    }
  }

  async getProductOfSeller(req, res) {
    try {
      const productData = await Product.find({ sellerId: req.accountID })
        .populate("categoryId", "name _id")
        .populate({
          path: "categoryId",
          select: "name",
          populate: {
            path: "subcategories",
            select: "name",
          },
        })
        .populate("subcategoryId");
      if (!productData.length) {
        return res.status(404).json({
          success: false,
          message: "No products found for this user.",
        });
      }

      return res.status(200).json({
        success: true,
        data: productData,
      });
    } catch (error) {
      console.error("Error fetching products:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error.",
      });
    }
  }

  async getProductsByUser(req, res) {
    try {
      const products = await Product.find({ sellerId: req.accountID });
      res.status(200).json({ success: true, data: products });
    } catch (error) {
      console.error("Error fetching products:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error." });
    }
  }

  // ⭐ User yêu cầu duyệt lại sản phẩm bị AI reject (không qua AI nữa, gửi thẳng cho admin)
  // ⭐ CHỈ ĐƯỢC YÊU CẦU 1 LẦN - sau đó phải sửa sản phẩm để yêu cầu lại
  async requestReview(req, res) {
    try {
      const { productId } = req.params;
      const product = await Product.findById(productId);

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Sản phẩm không tồn tại",
        });
      }

      // Chỉ cho phép user sở hữu sản phẩm mới được yêu cầu duyệt lại
      if (product.sellerId.toString() !== req.accountID.toString()) {
        return res.status(403).json({
          success: false,
          message: "Bạn không có quyền yêu cầu duyệt lại sản phẩm này",
        });
      }

      // Chỉ cho phép yêu cầu duyệt lại nếu sản phẩm đang ở trạng thái rejected
      if (product.status !== "rejected") {
        return res.status(400).json({
          success: false,
          message: "Chỉ có thể yêu cầu duyệt lại sản phẩm đã bị từ chối",
        });
      }

      // ⭐ KIỂM TRA: Đã yêu cầu duyệt lại chưa? (chỉ được 1 lần)
      const hasRequestedBefore =
        product.aiModerationResult?.humanReviewRequested === true;
      
      if (hasRequestedBefore) {
        return res.status(400).json({
          success: false,
          message:
            "Bạn đã yêu cầu duyệt lại 1 lần. Vui lòng sửa sản phẩm và đăng lại để yêu cầu duyệt lại.",
          canEdit: true, // Cho frontend biết có thể sửa
        });
      }

      // Cập nhật trạng thái thành "under_review" và đánh dấu là user request review
      product.status = "under_review";
      product.aiModerationResult = {
        ...product.aiModerationResult,
        humanReviewRequested: true,
        humanReviewRequestedAt: new Date(),
        humanReviewRequestedBy: req.accountID,
        bypassAI: true, // Đánh dấu không qua AI nữa
        reasons: [
          ...(product.aiModerationResult?.reasons || []),
          "👤 User yêu cầu duyệt lại - Gửi thẳng cho admin (không qua AI)",
        ],
      };

      await product.save();

      console.log(
        `✅ User ${req.accountID} requested review for product ${productId} - Sent to admin (bypass AI)`
      );

      res.status(200).json({
        success: true,
        message: "Đã gửi yêu cầu duyệt lại. Admin sẽ xem xét sản phẩm của bạn.",
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
        message: "Không thể gửi yêu cầu duyệt lại. Vui lòng thử lại.",
        error: error.message,
      });
    }
  }

  async updateProduct(req, res) {
    try {
      const { productId } = req.params;
      const { existingImages, removeAvatar } = req.body;

      // Tìm sản phẩm hiện tại
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Xử lý avatar
      if (req.files?.avatar) {
        // Upload avatar mới
        const avatarUpload = await uploadToCloudinary(
          req.files.avatar[0],
          "products/avatars"
        );

        // Xóa avatar cũ nếu có
        if (product.avatar?.publicId) {
          await deleteFromCloudinary(product.avatar.publicId);
        }

        product.avatar = avatarUpload;
      } else if (removeAvatar === "true" && product.avatar?.publicId) {
        // Xóa avatar nếu người dùng yêu cầu
        await deleteFromCloudinary(product.avatar.publicId);
        product.avatar = null;
      }

      // Xử lý ảnh bổ sung
      const existingImagesParsed = existingImages
        ? JSON.parse(existingImages)
        : [];

      // Xác định ảnh cần xóa (ảnh cũ không có trong existingImages)
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

      // Upload ảnh mới
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
        "status",
      ];
      updateFields.forEach((field) => {
        if (req.body[field] !== undefined) {
          product[field] = req.body[field];
        }
      });

      // ⭐ Cập nhật pickup address (cho buyer)
      if (
        req.body.pickupProvinceId &&
        req.body.pickupDistrictId &&
        req.body.pickupWardCode &&
        req.body.pickupBusinessAddress
      ) {
        product.pickupAddress = {
          provinceId: req.body.pickupProvinceId,
          districtId: req.body.pickupDistrictId,
          wardCode: req.body.pickupWardCode,
          businessAddress: req.body.pickupBusinessAddress,
          phoneNumber: req.body.pickupPhoneNumber || null,
        };
      }

      // ⭐ Khi user sửa sản phẩm bị reject → reset request review để có thể yêu cầu lại
      if (product.status === "rejected" && product.aiModerationResult?.humanReviewRequested) {
        product.aiModerationResult.humanReviewRequested = false;
        product.aiModerationResult.humanReviewRequestedAt = null;
        product.aiModerationResult.humanReviewRequestedBy = null;
        // Giữ lại rejectionReason để user biết lý do từ chối
      }

      await product.save();
      res.json(product);
    } catch (error) {
      console.error("Error updating product:", error);
      res.status(500).json({ message: error.message });
    }
  }

}

module.exports = new ProductController();
