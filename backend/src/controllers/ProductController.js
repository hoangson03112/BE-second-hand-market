const Attribute = require("../models/Attribute");
const Product = require("../models/Product");
const { uploadMultipleToCloudinary } = require("../utils/CloudinaryUpload");
const Seller = require("../models/Seller");
const aiModerationService = require("../services/openRouterModeration");
const notificationService = require("../services/notificationService");
const Account = require("../models/Account");

async function processAIModerationBackground(productId, productData) {
  try {
    const moderationResult = await aiModerationService.moderateProduct(
      productData
    );
    console.log(moderationResult);
    let productStatus = "pending";
    const score = moderationResult.score || 0;

    if (score >= 6) {
      productStatus = "approved";
    } else {
      productStatus = "rejected";
    }

    const updateData = {
      status: productStatus,
      "aiModerationResult.approved": moderationResult.approved,
      "aiModerationResult.confidence": moderationResult.confidence,
      "aiModerationResult.reviewedAt": new Date(),

      "aiModerationResult.totalCost": moderationResult.totalCost || 0,
      "aiModerationResult.score": moderationResult.score || 0,
      "aiModerationResult.consistency_check":
        moderationResult.consistency_check || {},
    };

    if (
      !moderationResult.approved &&
      moderationResult.reasons &&
      moderationResult.reasons.length > 0
    ) {
      updateData["aiModerationResult.reasons"] = moderationResult.reasons;
    } else {
      updateData["aiModerationResult.reasons"] = []; // Xóa lý do cũ nếu approve
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      updateData,
      { new: true }
    ).populate("sellerId", "fullName email");

    // Gửi thông báo cho seller
    await notificationService.notifyModerationResult(
      updatedProduct,
      productStatus,
      moderationResult
    );

    return updatedProduct;
  } catch (error) {
    console.error(
      `Background AI moderation failed for product ${productId}:`,
      error
    );

    // Nếu AI lỗi, đánh dấu cần human review
    await Product.findByIdAndUpdate(productId, {
      status: "under_review",
      "aiModerationResult.needsHumanReview": true,
      "aiModerationResult.reasons": [
        "AI moderation failed - needs manual review",
      ],
      "aiModerationResult.reviewedAt": new Date(),
    });
  }
}

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
      console.log(product);
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
    // console.log(req.body);
    // console.log(req.files);
    const formatAttributes = JSON.parse(req.body.attributes);
    const attributes = formatAttributes.map((attribute) => {
      const { id, ...attributeWithoutId } = attribute;
      return attributeWithoutId;
    });
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
    try {
      const newAttributes = await Attribute.insertMany(attributes);
      const uploadedFiles = await uploadMultipleToCloudinary(
        req.files.images,
        "Product"
      );

      // Chuẩn bị dữ liệu sản phẩm để kiểm tra AI
      const productData = {
        ...req.body,
        sellerId: req.accountID,
        images: uploadedFiles.map((file) => formatFileData(file)),
        avatar: formatFileData(uploadedFiles[0]),
        attributes: newAttributes.map((attribute) => attribute._id),
      };

      // Tạo sản phẩm với status "pending" ngay lập tức
      const newProduct = await Product.create({
        ...productData,
        status: "pending", // ⭐ QUAN TRỌNG: Phải có dòng này
        aiModerationResult: {
          approved: null,
          confidence: 0,
          reasons: [],
          reviewedAt: null,
          needsHumanReview: false,
        },
      });

      // Trả về response thành công ngay lập tức
      await res.status(201).json({
        message:
          "Sản phẩm đã được thêm thành công! Chúng tôi sẽ duyệt và thông báo kết quả sớm nhất.",
        product: newProduct,
        status: "pending",
        note: "Sản phẩm đang được xem xét tự động, bạn sẽ nhận được thông báo khi có kết quả.",
      });

      try {
        // Delay một chút để đảm bảo response đã được gửi
        await new Promise((resolve) => setTimeout(resolve, 100));
        return await processAIModerationBackground(newProduct._id, productData);
      } catch (error) {
        console.error("❌ Background AI moderation failed:", error);
        console.error("❌ Error stack:", error.stack);
      }
    } catch (validationError) {
      console.error("Attribute validation error:", validationError.message);

      if (validationError.errors) {
        Object.keys(validationError.errors).forEach((field) => {
          console.error(
            `Field ${field}:`,
            validationError.errors[field].message
          );
        });
      }
      throw validationError;
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

  // Helper để tạo message về trạng thái moderation
  getModerationStatusMessage(product) {
    const aiResult = product.aiModerationResult;

    switch (product.status) {
      case "pending":
        return {
          status: "pending",
          message: "⏳ Đang được xem xét tự động...",
          canEdit: false,
        };
      case "active":
        return {
          status: "approved",
          message: "✅ Đã được duyệt và đang bán",
          confidence: aiResult?.confidence,
          canEdit: true,
        };
      case "rejected":
        return {
          status: "rejected",
          message: `❌ Bị từ chối: ${
            aiResult?.reasons?.join(", ") || "Vi phạm chính sách"
          }`,
          reasons: aiResult?.reasons,
          canEdit: true,
          canResubmit: true,
        };
      case "under_review":
        return {
          status: "under_review",
          message: "👁️ Đang được kiểm tra thủ công",
          canEdit: false,
        };
      default:
        return {
          status: "unknown",
          message: "Trạng thái không xác định",
          canEdit: false,
        };
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

  // API để manually trigger AI moderation cho sản phẩm pending
  async retryAIModeration(req, res) {
    try {
      const { productId } = req.params;

      const product = await Product.findById(productId).populate("sellerId");
      if (!product) {
        return res
          .status(404)
          .json({ success: false, message: "Product not found" });
      }

      // Chỉ cho phép retry nếu là pending hoặc under_review
      if (!["pending", "under_review"].includes(product.status)) {
        return res.status(400).json({
          success: false,
          message:
            "Can only retry AI moderation for pending or under_review products",
        });
      }

      // Kiểm tra quyền (chỉ owner hoặc admin)
      if (product.sellerId._id.toString() !== req.accountID) {
        return res
          .status(403)
          .json({ success: false, message: "Unauthorized" });
      }

      // Reset về pending
      await Product.findByIdAndUpdate(productId, {
        status: "pending",
        "aiModerationResult.approved": null,
        "aiModerationResult.confidence": 0,
        "aiModerationResult.reasons": [],
        "aiModerationResult.reviewedAt": null,
        "aiModerationResult.needsHumanReview": false,
      });

      // Chạy AI moderation lại - wrapper function để đảm bảo context
      const retryInBackground = async () => {
        try {
          await new Promise((resolve) => setTimeout(resolve, 100));
          await processAIModerationBackground(productId, product);
        } catch (error) {
          console.error("Retry AI moderation failed:", error);
        }
      };
      retryInBackground();

      res.json({
        success: true,
        message:
          "AI moderation retry initiated. You will be notified of the result.",
      });
    } catch (error) {
      console.error("Error retrying AI moderation:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }

  // API để check tất cả sản phẩm pending và process chúng
  async processPendingProducts(req, res) {
    try {
      const pendingProducts = await Product.find({
        status: "pending",
        "aiModerationResult.approved": null,
      });

      if (pendingProducts.length === 0) {
        return res.json({
          success: true,
          message: "No pending products to process",
        });
      }

      // Process từng sản phẩm - wrapper function để đảm bảo context
      pendingProducts.forEach((product) => {
        const processProductInBackground = async () => {
          try {
            await new Promise((resolve) => setTimeout(resolve, 100));
            await processAIModerationBackground(product._id, product);
          } catch (error) {
            console.error(
              `Failed to process pending product ${product._id}:`,
              error
            );
          }
        };
        processProductInBackground();
      });

      res.json({
        success: true,
        message: `Started processing ${pendingProducts.length} pending products`,
        count: pendingProducts.length,
      });
    } catch (error) {
      console.error("Error processing pending products:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }

  // 🆕 API để user yêu cầu admin review sản phẩm bị reject
  async requestAdminReview(req, res) {
    try {
      const { productId } = req.params;
      const { reason } = req.body; // Lý do user yêu cầu review

      const product = await Product.findById(productId).populate("sellerId");
      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy sản phẩm",
        });
      }

      // Kiểm tra quyền sở hữu
      if (product.sellerId._id.toString() !== req.accountID) {
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

      // Kiểm tra đã request chưa
      if (product.adminReviewRequested) {
        return res.status(400).json({
          success: false,
          message: "Bạn đã yêu cầu admin review cho sản phẩm này rồi",
        });
      }

      // Cập nhật trạng thái
      const updatedProduct = await Product.findByIdAndUpdate(
        productId,
        {
          status: "under_review",
          adminReviewRequested: true,
          adminReviewReason: reason || "Người dùng yêu cầu xem xét lại",
          adminReviewRequestedAt: new Date(),
        },
        { new: true }
      );

      // Thông báo admin
      await notificationService.notifyAdminReview(updatedProduct, reason);

      res.json({
        success: true,
        message:
          "Đã gửi yêu cầu xem xét lại tới admin. Chúng tôi sẽ phản hồi trong 24-48h.",
        product: updatedProduct,
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
