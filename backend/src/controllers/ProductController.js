const Attribute = require("../models/Attribute");
const Product = require("../models/Product");
const Category = require("../models/Category");
const mongoose = require("mongoose");

const { deleteFromCloudinary , uploadMultipleToCloudinary , uploadToCloudinary , deleteMultipleFromCloudinary  } = require("../utils/CloudinaryUpload");
const { uploadMultipleToCloudinary } = require("../utils/CloudinaryUpload");
const Seller = require("../models/Seller");
const { processEnhancedAIModerationBackground } = require("../services/aiModeration.service");



class ProductController {
  async getProductListByCategory(req, res) {
    try {
      const { categoryID, subcategoryID } = req.query;
      if (!categoryID && !subcategoryID) {
        return res.status(400).json({
          success: false,
          message: "At least one of Category ID or Subcategory ID is required",
        });
      }

      const query = { status: "approved" };
      if (categoryID) {
        query.categoryId = categoryID;
      }
      if (subcategoryID) {
        query.subcategoryId = subcategoryID;
      }
      query.status = "approved";

      const products = await Product.find(query).populate({
        path: "sellerId",
      });

      // Lấy tất cả seller account IDs hợp lệ
      const sellerAccountIds = products
        .map((p) => p.sellerId?._id)
        .filter((id) => id != null && id !== undefined); // Lọc bỏ undefined/null

      // Query tất cả sellers cùng lúc thay vì N+1 queries
      const sellers = await Seller.find({
        accountId: { $in: sellerAccountIds },
      });

      // Tạo map để lookup nhanh seller by accountId
      const sellerMap = new Map();
      sellers.forEach((seller) => {
        if (seller.accountId) {
          sellerMap.set(seller.accountId.toString(), seller);
        }
      });

      // Map products với thông tin seller
      const productsWithSeller = products.map((product) => {
        const sellerId = product.sellerId?._id;
        const seller = sellerId ? sellerMap.get(sellerId.toString()) : null;

        return {
          _id: product._id,
          name: product.name,
          price: product.price,
          avatar: product.avatar,
          seller: {
            _id: sellerId,
            fullName: product.sellerId?.fullName || "Người bán ẩn danh",
            province: seller?.province || "Không xác định",
            district: seller?.district || "Không xác định",
            ward: seller?.ward || "Không xác định",
          },
        };
      });
      res.json({
        success: true,
        data: productsWithSeller,
        total: productsWithSeller.length,
      });
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }

  async getProduct(req, res) {
    try {
      const { productID } = req.query;

      if (!productID) {
        return res.status(400).json({
          success: false,
          message: "Product ID is required",
        });
      }

      // 1,2,4. Tối ưu performance, fix N+1, memory với populate + lean
      const product = await Product.findById(productID)
        .populate({
          path: "attributes",
          select: "key value",
        })
        .populate("sellerId")
        .populate({
          path: "categoryId",
          select: "name   subcategories",
          populate: {
            path: "subcategories",
          },
        })
        .lean();

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Sản phẩm không tồn tại",
        });
      }

      // 2. Fix N+1 - Chỉ query seller nếu cần thêm thông tin
      let seller = null;

      if (product.sellerId) {
        seller = await Seller.findOne({ accountId: product.sellerId._id })
          .select("province")
          .lean();
      }
      // Map dữ liệu với thông tin seller, category và subcategory
      const {
        sellerId,
        aiModerationResult,
        categoryId,
        subcategoryId,
        ...restProduct
      } = product;

      // Tìm subcategory từ category.subcategories array
      let subcategory = null;
      if (categoryId?.subcategories && subcategoryId) {
        subcategory = categoryId.subcategories.find(
          (sub) => sub._id.toString() === subcategoryId.toString()
        );
      }

      const productData = {
        ...restProduct,
        seller: {
          _id: sellerId?._id,
          fullName: product.sellerId?.fullName || "Không xác định",
          avatar: product.sellerId?.avatar || null,
          province: seller?.province || "Không xác định",
        },
        category: {
          _id: categoryId?._id,
          name: categoryId?.name || "Không xác định",
        },
        subcategory: subcategory
          ? {
              _id: subcategory._id,
              name: subcategory.name,
            }
          : null,
        // 🆕 Weight estimation info
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
      const { status = "approved", limit = 20 } = req.query;

      const products = await Product.find({ status })
        .populate({
          path: "sellerId",
          select: "fullName",
        })
        .limit(parseInt(limit))
        .sort({ createdAt: -1 });

      // Map dữ liệu cơ bản
      const mappedProducts = products.map((product) => ({
        _id: product._id,
        name: product.name,
        price: product.price,
        avatar: product.avatar,
        location: product.location,
        createdAt: product.createdAt,
        seller: {
          _id: product.sellerId?._id,
          fullName: product.sellerId?.fullName || "Người bán ẩn danh",
        },
      }));

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
      // ⭐ PROCESS ATTRIBUTES
      const formatAttributes = JSON.parse(req.body.attributes);
      const attributes = formatAttributes.map((attribute) => {
        const { id, ...attributeWithoutId } = attribute;
        return attributeWithoutId;
      });

      // ⭐ PROCESS FILES
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

      // ⭐ CREATE PRODUCT WITH PENDING STATUS
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

      // ⭐ IMMEDIATE RESPONSE TO USER
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

      // ⭐ BACKGROUND AI MODERATION (NON-BLOCKING)
      setImmediate(async () => {
        try {
          console.log(
            `🔍 Starting AI moderation for product ${newProduct._id}`
          );
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
      const { slug, status } = req.body;
      if (!slug) {
        return res.status(400).json({ error: "Slug is required" });
      }

      const updatedProduct = await Product.findOneAndUpdate(
        { slug },
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
      const productData = await Product.find({ sellerId: req.accountID });

      if (!productData.length) {
        return res
          .status(404)
          .json({ message: "No products found for this user." });
      }

      // Thêm thông tin về AI moderation status
      const productsWithStatus = productData.map((product) => ({
        ...product.toObject(),
        moderationStatus: this.getModerationStatusMessage(product),
      }));

      res.status(200).json({ success: true, data: productsWithStatus });
    } catch (error) {
      console.error("Error fetching products:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error." });
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
      return res.status(404).json({ message: 'Product not found' });
    }

    // Xử lý avatar
    if (req.files?.avatar) {
      // Upload avatar mới
      const avatarUpload = await uploadToCloudinary(req.files.avatar[0], 'products/avatars');
      
      // Xóa avatar cũ nếu có
      if (product.avatar?.publicId) {
        await deleteFromCloudinary(product.avatar.publicId);
      }
      
      product.avatar = avatarUpload;
    } else if (removeAvatar === 'true' && product.avatar?.publicId) {
      // Xóa avatar nếu người dùng yêu cầu
      await deleteFromCloudinary(product.avatar.publicId);
      product.avatar = null;
    }

    // Xử lý ảnh bổ sung
    const existingImagesParsed = existingImages ? JSON.parse(existingImages) : [];
    
    // Xác định ảnh cần xóa (ảnh cũ không có trong existingImages)
    const imagesToDelete = product.images.filter(img => 
      !existingImagesParsed.some(existingImg => existingImg.publicId === img.publicId)
    );
    
    // Xóa ảnh không còn sử dụng
    await deleteMultipleFromCloudinary(imagesToDelete.map(img => img.publicId));
    
    // Upload ảnh mới
    let newImages = [];
    if (req.files?.newImages) {
      newImages = await uploadMultipleToCloudinary(req.files.newImages, 'products/images');
    }
    
    // Cập nhật danh sách ảnh
    product.images = [...existingImagesParsed, ...newImages];

    // Cập nhật các trường khác
    const updateFields = ['name', 'price', 'stock', 'description', 'categoryId', 'subcategoryId', 'status'];
    updateFields.forEach(field => {
      if (req.body[field] !== undefined) {
        product[field] = req.body[field];
      }
    });

    await product.save();
    res.json(product);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ message: error.message });
  }
};

  // API để user yêu cầu admin review sản phẩm bị reject
  async requestAdminReview(req, res) {
    try {
      const { productId } = req.params;
      const { reason } = req.body;

      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy sản phẩm",
        });
      }

      // Kiểm tra quyền sở hữu
      if (product.sellerId.toString() !== req.accountID) {
        return res.status(403).json({
          success: false,
          message: "Bạn không có quyền thực hiện hành động này",
        });
      }

      // Chỉ cho phép request review nếu sản phẩm bị reject
      if (product.status !== "rejected") {
        return res.status(400).json({
          success: false,
          message: "Chỉ có thể yêu cầu review lại cho sản phẩm bị từ chối",
        });
      }

      // Cập nhật trạng thái
      await Product.findByIdAndUpdate(productId, {
        status: "under_review",
        "aiModerationResult.adminReviewRequested": true,
        "aiModerationResult.adminReviewReason":
          reason || "Người dùng yêu cầu xem xét lại",
        "aiModerationResult.adminReviewRequestedAt": new Date(),
      });

      res.json({
        success: true,
        message:
          "Đã gửi yêu cầu xem xét lại tới admin. Chúng tôi sẽ phản hồi trong 24-48h.",
      });
    } catch (error) {
      console.error("Error requesting admin review:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi server",
      });
    }
  }
}




module.exports = new ProductController();
