const Attribute = require("../models/Attribute");
const Product = require("../models/Product");
const Category = require("../models/Category");
const SubCategory = require("../models/SubCategory");
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

      // Validate categorySlug or subCategorySlug
      if (!categorySlug && !subCategorySlug) {
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

      // Build query
      const query = { status: "approved", stock: { $gt: 0 } };

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
          avatar: product.avatar,
          category: product.categoryId,
          subCategory: product.subcategoryId,
          slug: product.slug,
          condition: product.condition || "good",
          seller: {
            _id: sellerId,
            name: product.sellerId?.fullName,
            province: seller?.province,
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
      const productData = {
        ...restProduct,
        seller: {
          _id: sellerId?._id,
          fullName: product.sellerId?.fullName || "Không xác định",
          avatar: product.sellerId?.avatar || null,
          province: seller?.province || "Không xác định",
          from_district_id: seller?.from_district_id || "Không xác định",
          from_ward_code: seller?.from_ward_code || "Không xác định",
          createdAt: seller?.createdAt || null,
          businessAddress: seller?.businessAddress || "Không xác định",
          phoneNumber: seller?.accountId?.phoneNumber || "Không xác định",
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
      const { limit = 20 } = req.query;

      const products = await Product.find({})
        .populate({
          path: "sellerId",
          select: "fullName",
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
        .limit(parseInt(limit))
        .sort({ createdAt: -1 });

      const sellerIds = [
        ...new Set(products.map((product) => product.sellerId._id)),
      ];

      const sellers = await Seller.find({ accountId: { $in: sellerIds } });

      const mappedProducts = products.map((product) => {
        const seller = sellers.find(
          (seller) =>
            seller.accountId.toString() === product.sellerId._id.toString()
        );

        return {
          _id: product._id,
          name: product.name,
          price: product.price,
          avatar: product.avatar,
          stock: product.stock,
          description: product.description,
          category: product.categoryId,
          subcategory: product.subcategoryId,
          attributes: product.attributes,
          images: product.images,
          status: product.status,
          estimatedWeight: product.estimatedWeight,
          createdAt: product.createdAt,
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
            : null,
        };
      });

      res.json({
        success: true,
        data: mappedProducts,
        total: mappedProducts.length,
      });
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }

  async addProduct(req, res) {
    try {
      const formatAttributes = JSON.parse(req.body.attributes);
      const attributes = formatAttributes.map((attribute) => {
        const { id, ...attributeWithoutId } = attribute;
        return attributeWithoutId;
      });

      const newAttributes = await Attribute.insertMany(attributes);

      let uploadedFiles = [];
      if (req.files?.images && req.files.images.length > 0) {
        uploadedFiles = await uploadMultipleToCloudinary(
          req.files.images,
          "Product"
        );
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

      // ⭐ PREPARE PRODUCT DATA
      const productData = {
        ...req.body,
        sellerId: req.accountID,
        images: uploadedFiles.map((file) => formatFileData(file)),
        avatar:
          uploadedFiles.length > 0 ? formatFileData(uploadedFiles[0]) : null,
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
        message: "Sản phẩm đã được tạo thành công! Đang kiểm duyệt bằng AI...",
        product: {
          id: newProduct._id,
          title: newProduct.title,
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
      const { productId, status } = req.body;
      if (!productId) {
        return res.status(400).json({ error: "Product ID is required" });
      }

      const updatedProduct = await Product.findOneAndUpdate(
        { _id: productId },
        { $set: { status: status } },
        { new: true }
      );

      if (!updatedProduct) {
        return res.status(404).json({ error: "Product not found" });
      }

      res.status(200).json(updatedProduct);
    } catch (error) {
      console.error("Error updating product status:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
  async deleteProduct(req, res) {
    try {
      const { productId } = req.params;

      await Product.findByIdAndDelete(productId);
      res.status(200).json({ message: "Xóa sản phẩm thành công." });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Lỗi khi xóa sản phẩm." });
    }
  }
  async getProductOfUser(req, res) {
    try {
      const productData = await Product.find({ sellerId: req.accountID })
        .populate("categoryId", "name _id")
        .populate("subcategoryId");

      if (!productData.length) {
        return res
          .status(404)
          .json({ message: "No products found for this user." });
      }

      res.status(200).json({ success: true, data: productData });
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

      await product.save();
      res.json(product);
    } catch (error) {
      console.error("Error updating product:", error);
      res.status(500).json({ message: error.message });
    }
  }

}

module.exports = new ProductController();
