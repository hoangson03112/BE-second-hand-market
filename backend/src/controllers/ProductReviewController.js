const ProductReview = require("../models/ProductReview");
const Order = require("../models/Order");
const Product = require("../models/Product");

class ProductReviewController {
  /**
   * Tạo đánh giá sản phẩm
   * POST /api/v1/product-reviews
   */
  async createReview(req, res) {
    try {
      const { productId, orderId, rating, comment } = req.body;
      const buyerId = req.accountID;

      // Validate input
      if (!productId || !orderId || !rating) {
        return res.status(400).json({
          success: false,
          message: "Thiếu thông tin bắt buộc (productId, orderId, rating)",
        });
      }

      if (rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: "Rating phải từ 1 đến 5 sao",
        });
      }

      // Kiểm tra order có tồn tại và thuộc về buyer này không
      const order = await Order.findOne({ _id: orderId, buyerId });
      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy đơn hàng hoặc bạn không có quyền đánh giá",
        });
      }

      // Kiểm tra order đã hoàn thành chưa
      if (order.status !== "completed") {
        return res.status(400).json({
          success: false,
          message: "Chỉ có thể đánh giá sau khi đơn hàng hoàn thành",
        });
      }

      // Kiểm tra productId có trong order không
      const orderHasProduct = order.items.some(
        (item) => item.productId.toString() === productId.toString()
      );
      if (!orderHasProduct) {
        return res.status(400).json({
          success: false,
          message: "Sản phẩm không có trong đơn hàng này",
        });
      }

      // Kiểm tra đã đánh giá chưa (unique index sẽ catch, nhưng response tốt hơn)
      const existingReview = await ProductReview.findOne({
        productId,
        buyerId,
        orderId,
      });
      if (existingReview) {
        return res.status(400).json({
          success: false,
          message: "Bạn đã đánh giá sản phẩm này trong đơn hàng rồi",
        });
      }

      // Tạo review
      const review = await ProductReview.create({
        productId,
        buyerId,
        orderId,
        rating,
        comment: comment?.trim() || "",
      });

      // Populate thông tin buyer
      await review.populate("buyerId", "fullName avatar");

      res.status(201).json({
        success: true,
        message: "Đánh giá sản phẩm thành công",
        review,
      });
    } catch (error) {
      console.error("Error creating product review:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi server khi tạo đánh giá",
      });
    }
  }

  /**
   * Lấy đánh giá của buyer cho 1 sản phẩm trong 1 order
   * GET /api/v1/product-reviews/by-order/:orderId/product/:productId
   */
  async getByOrderAndProduct(req, res) {
    try {
      const { orderId, productId } = req.params;
      const buyerId = req.accountID;

      const review = await ProductReview.findOne({
        orderId,
        productId,
        buyerId,
      }).populate("buyerId", "fullName avatar");

      res.status(200).json({
        success: true,
        review: review || null,
      });
    } catch (error) {
      console.error("Error fetching review by order and product:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi server",
      });
    }
  }

  /**
   * Lấy tất cả đánh giá của 1 sản phẩm (public - để hiển thị trên trang chi tiết)
   * GET /api/v1/product-reviews/product/:productId
   */
  async getByProduct(req, res) {
    try {
      const { productId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [reviews, total] = await Promise.all([
        ProductReview.find({ productId })
          .populate("buyerId", "fullName avatar")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        ProductReview.countDocuments({ productId }),
      ]);

      // Tính rating trung bình
      const avgRating =
        reviews.length > 0
          ? (
              reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
            ).toFixed(1)
          : 0;

      res.status(200).json({
        success: true,
        reviews,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
        avgRating: parseFloat(avgRating),
        totalReviews: total,
      });
    } catch (error) {
      console.error("Error fetching product reviews:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi server",
      });
    }
  }

  /**
   * Lấy tất cả đánh giá của buyer (của chính mình)
   * GET /api/v1/product-reviews/my
   */
  async getMyReviews(req, res) {
    try {
      const buyerId = req.accountID;
      const { page = 1, limit = 10 } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [reviews, total] = await Promise.all([
        ProductReview.find({ buyerId })
          .populate("productId", "name slug avatar price")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        ProductReview.countDocuments({ buyerId }),
      ]);

      res.status(200).json({
        success: true,
        reviews,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error("Error fetching my reviews:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi server",
      });
    }
  }

  /**
   * Cập nhật đánh giá (chỉ được sửa rating và comment)
   * PUT /api/v1/product-reviews/:reviewId
   */
  async updateReview(req, res) {
    try {
      const { reviewId } = req.params;
      const { rating, comment } = req.body;
      const buyerId = req.accountID;

      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: "Rating phải từ 1 đến 5 sao",
        });
      }

      const review = await ProductReview.findOneAndUpdate(
        { _id: reviewId, buyerId },
        {
          rating,
          comment: comment?.trim() || "",
          updatedAt: new Date(),
        },
        { new: true }
      ).populate("buyerId", "fullName avatar");

      if (!review) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy đánh giá hoặc bạn không có quyền chỉnh sửa",
        });
      }

      res.status(200).json({
        success: true,
        message: "Cập nhật đánh giá thành công",
        review,
      });
    } catch (error) {
      console.error("Error updating review:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi server",
      });
    }
  }

  /**
   * Xóa đánh giá
   * DELETE /api/v1/product-reviews/:reviewId
   */
  async deleteReview(req, res) {
    try {
      const { reviewId } = req.params;
      const buyerId = req.accountID;

      const review = await ProductReview.findOneAndDelete({
        _id: reviewId,
        buyerId,
      });

      if (!review) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy đánh giá hoặc bạn không có quyền xóa",
        });
      }

      res.status(200).json({
        success: true,
        message: "Xóa đánh giá thành công",
      });
    } catch (error) {
      console.error("Error deleting review:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi server",
      });
    }
  }
}

module.exports = new ProductReviewController();
