const mongoose = require("mongoose");
const ProductReview = require("../../models/ProductReview");
const Order = require("../../models/Order");
const Product = require("../../models/Product");
const { MESSAGES } = require('../../utils/messages');

class ProductReviewController {




  async createReview(req, res) {
    try {
      const { productId, orderId, rating, comment } = req.body;
      const buyerId = req.accountID;


      if (!productId || !orderId || !rating) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.REVIEW.MISSING_INFO
        });
      }

      if (rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.REVIEW.INVALID_RATING
        });
      }


      const order = await Order.findOne({ _id: orderId, buyerId });
      if (!order) {
        return res.status(404).json({
          success: false,
          message: MESSAGES.REVIEW.ORDER_NOT_FOUND_OR_UNAUTHORIZED
        });
      }


      if (order.status !== "completed") {
        return res.status(400).json({
          success: false,
          message: MESSAGES.REVIEW.ONLY_AFTER_DELIVERY
        });
      }


      const orderHasProduct = order.products.some(
        (item) => item.productId.toString() === productId.toString()
      );
      if (!orderHasProduct) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.REVIEW.PRODUCT_NOT_IN_ORDER
        });
      }


      const existingReview = await ProductReview.findOne({
        productId,
        buyerId,
        orderId
      });
      if (existingReview) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.REVIEW.ALREADY_REVIEWED
        });
      }


      const review = await ProductReview.create({
        productId,
        buyerId,
        orderId,
        rating,
        comment: comment?.trim() || ""
      });


      await review.populate("buyerId", "fullName avatar");

      res.status(201).json({
        success: true,
        message: MESSAGES.REVIEW.CREATE_SUCCESS,
        review
      });
    } catch (error) {
      console.error("Error creating product review:", error);
      res.status(500).json({
        success: false,
        message: MESSAGES.REVIEW.CREATE_ERROR
      });
    }
  }





  async getByOrderAndProduct(req, res) {
    try {
      const { orderId, productId } = req.params;
      const buyerId = req.accountID;

      const review = await ProductReview.findOne({
        orderId,
        productId,
        buyerId
      }).populate("buyerId", "fullName avatar");

      res.status(200).json({
        success: true,
        review: review || null
      });
    } catch (error) {
      console.error("Error fetching review by order and product:", error);
      res.status(500).json({
        success: false,
        message: MESSAGES.SERVER_ERROR
      });
    }
  }





  async getByProduct(req, res) {
    try {
      const { productId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const productObjectId = new mongoose.Types.ObjectId(productId);

      const [reviews, total, avgAgg] = await Promise.all([
      ProductReview.find({ productId }).
      populate("buyerId", "fullName avatar").
      sort({ createdAt: -1 }).
      skip(skip).
      limit(parseInt(limit)).
      lean(),
      ProductReview.countDocuments({ productId }),
      ProductReview.aggregate([
      { $match: { productId: productObjectId } },
      { $group: { _id: null, avg: { $avg: "$rating" } } }]
      )]
      );

      const avgRaw = avgAgg[0]?.avg;
      const avgRating =
      avgRaw != null && !Number.isNaN(avgRaw) ?
      Math.round(Number(avgRaw) * 10) / 10 :
      0;

      res.status(200).json({
        success: true,
        reviews,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit))
        },
        avgRating,
        totalReviews: total
      });
    } catch (error) {
      console.error("Error fetching product reviews:", error);
      res.status(500).json({
        success: false,
        message: MESSAGES.SERVER_ERROR
      });
    }
  }





  async getMyReviews(req, res) {
    try {
      const buyerId = req.accountID;
      const { page = 1, limit = 10 } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [reviews, total] = await Promise.all([
      ProductReview.find({ buyerId }).
      populate("productId", "name slug avatar price").
      sort({ createdAt: -1 }).
      skip(skip).
      limit(parseInt(limit)).
      lean(),
      ProductReview.countDocuments({ buyerId })]
      );

      res.status(200).json({
        success: true,
        reviews,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      console.error("Error fetching my reviews:", error);
      res.status(500).json({
        success: false,
        message: MESSAGES.SERVER_ERROR
      });
    }
  }





  async updateReview(req, res) {
    try {
      const { reviewId } = req.params;
      const { rating, comment } = req.body;
      const buyerId = req.accountID;

      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.REVIEW.INVALID_RATING
        });
      }

      const review = await ProductReview.findOneAndUpdate(
        { _id: reviewId, buyerId },
        {
          rating,
          comment: comment?.trim() || "",
          updatedAt: new Date()
        },
        { new: true }
      ).populate("buyerId", "fullName avatar");

      if (!review) {
        return res.status(404).json({
          success: false,
          message: MESSAGES.REVIEW.NOT_FOUND_OR_UNAUTHORIZED
        });
      }

      res.status(200).json({
        success: true,
        message: MESSAGES.REVIEW.UPDATE_SUCCESS,
        review
      });
    } catch (error) {
      console.error("Error updating review:", error);
      res.status(500).json({
        success: false,
        message: MESSAGES.SERVER_ERROR
      });
    }
  }





  async deleteReview(req, res) {
    try {
      const { reviewId } = req.params;
      const buyerId = req.accountID;

      const review = await ProductReview.findOneAndDelete({
        _id: reviewId,
        buyerId
      });

      if (!review) {
        return res.status(404).json({
          success: false,
          message: MESSAGES.REVIEW.DELETE_NOT_FOUND_OR_UNAUTHORIZED
        });
      }

      res.status(200).json({
        success: true,
        message: MESSAGES.REVIEW.DELETE_SUCCESS
      });
    } catch (error) {
      console.error("Error deleting review:", error);
      res.status(500).json({
        success: false,
        message: MESSAGES.SERVER_ERROR
      });
    }
  }
}

module.exports = new ProductReviewController();