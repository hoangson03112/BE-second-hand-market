const mongoose = require("mongoose");
const ProductReview = require("../../models/ProductReview");
const Order = require("../../models/Order");
const Product = require("../../models/Product");
const { MESSAGES } = require('../../utils/messages');

class ProductReviewController {
  /**
   * T\u1ea1o \u0111\u00e1nh gi\u00e1 s\u1ea3n ph\u1ea9m
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
        message: MESSAGES.REVIEW.MISSING_INFO,
        });
      }

      if (rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.REVIEW.INVALID_RATING,
        });
      }

      // Ki\u1ec3m tra order c\u00f3 t\u1ed3n t\u1ea1i v\u00e0 thu\u1ed9c v\u1ec1 buyer n\u00e0y kh\u00f4ng
      const order = await Order.findOne({ _id: orderId, buyerId });
      if (!order) {
        return res.status(404).json({
          success: false,
          message: MESSAGES.REVIEW.ORDER_NOT_FOUND_OR_UNAUTHORIZED,
        });
      }

      // Ki\u1ec3m tra order \u0111\u00e3 ho\u00e0n th\u00e0nh ch\u01b0a
      if (order.status !== "completed") {
        return res.status(400).json({
          success: false,
          message: MESSAGES.REVIEW.ONLY_AFTER_DELIVERY,
        });
      }

      // Kiểm tra productId có trong order không (schema: products[])
      const orderHasProduct = order.products.some(
        (item) => item.productId.toString() === productId.toString()
      );
      if (!orderHasProduct) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.REVIEW.PRODUCT_NOT_IN_ORDER,
        });
      }

      // Ki\u1ec3m tra \u0111\u00e3 \u0111\u00e1nh gi\u00e1 ch\u01b0a (unique index s\u1ebd catch, nh\u01b0ng response t\u1ed1t h\u01a1n)
      const existingReview = await ProductReview.findOne({
        productId,
        buyerId,
        orderId,
      });
      if (existingReview) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.REVIEW.ALREADY_REVIEWED,
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
        message: MESSAGES.REVIEW.CREATE_SUCCESS,
        review,
      });
    } catch (error) {
      console.error("Error creating product review:", error);
      res.status(500).json({
        success: false,
        message: MESSAGES.REVIEW.CREATE_ERROR,
      });
    }
  }

  /**
   * L\u1ea5y \u0111\u00e1nh gi\u00e1 c\u1ee7a buyer cho 1 s\u1ea3n ph\u1ea9m trong 1 order
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
        message: MESSAGES.SERVER_ERROR,
      });
    }
  }

  /**
   * L\u1ea5y t\u1ea5t c\u1ea3 \u0111\u00e1nh gi\u00e1 c\u1ee7a 1 s\u1ea3n ph\u1ea9m (public - \u0111\u1ec3 hi\u1ec3n th\u1ecb tr\u00ean trang chi ti\u1ebft)
   * GET /api/v1/product-reviews/product/:productId
   */
  async getByProduct(req, res) {
    try {
      const { productId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const productObjectId = new mongoose.Types.ObjectId(productId);

      const [reviews, total, avgAgg] = await Promise.all([
        ProductReview.find({ productId })
          .populate("buyerId", "fullName avatar")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        ProductReview.countDocuments({ productId }),
        ProductReview.aggregate([
          { $match: { productId: productObjectId } },
          { $group: { _id: null, avg: { $avg: "$rating" } } },
        ]),
      ]);

      const avgRaw = avgAgg[0]?.avg;
      const avgRating =
        avgRaw != null && !Number.isNaN(avgRaw)
          ? Math.round(Number(avgRaw) * 10) / 10
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
        avgRating,
        totalReviews: total,
      });
    } catch (error) {
      console.error("Error fetching product reviews:", error);
      res.status(500).json({
        success: false,
        message: MESSAGES.SERVER_ERROR,
      });
    }
  }

  /**
   * L\u1ea5y t\u1ea5t c\u1ea3 \u0111\u00e1nh gi\u00e1 c\u1ee7a buyer (c\u1ee7a ch\u00ednh m\u00ecnh)
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
        message: MESSAGES.SERVER_ERROR,
      });
    }
  }

  /**
   * C\u1eadp nh\u1eadt \u0111\u00e1nh gi\u00e1 (ch\u1ec9 \u0111\u01b0\u1ee3c s\u1eeda rating v\u00e0 comment)
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
          message: MESSAGES.REVIEW.INVALID_RATING,
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
          message: MESSAGES.REVIEW.NOT_FOUND_OR_UNAUTHORIZED,
        });
      }

      res.status(200).json({
        success: true,
        message: MESSAGES.REVIEW.UPDATE_SUCCESS,
        review,
      });
    } catch (error) {
      console.error("Error updating review:", error);
      res.status(500).json({
        success: false,
        message: MESSAGES.SERVER_ERROR,
      });
    }
  }

  /**
   * X\u00f3a \u0111\u00e1nh gi\u00e1
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
          message: MESSAGES.REVIEW.DELETE_NOT_FOUND_OR_UNAUTHORIZED,
        });
      }

      res.status(200).json({
        success: true,
        message: MESSAGES.REVIEW.DELETE_SUCCESS,
      });
    } catch (error) {
      console.error("Error deleting review:", error);
      res.status(500).json({
        success: false,
        message: MESSAGES.SERVER_ERROR,
      });
    }
  }
}

module.exports = new ProductReviewController();

