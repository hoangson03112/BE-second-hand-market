const Product = require("../models/Product");

class AdminController {
  // Lấy danh sách sản phẩm cần review
  async getPendingReviewProducts(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;
      
      const products = await Product.find({
        $or: [
          { status: "under_review" },
          { "aiModerationResult.needsHumanReview": true }
        ]
      })
      .populate('sellerId', 'fullName email')
      .populate('categoryId', 'name')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

      const total = await Product.countDocuments({
        $or: [
          { status: "under_review" },
          { "aiModerationResult.needsHumanReview": true }
        ]
      });

      res.json({
        success: true,
        data: products,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      });
    } catch (error) {
      console.error("Error fetching pending products:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }

  // Admin approve/reject sản phẩm
  async reviewProduct(req, res) {
    try {
      const { productId } = req.params;
      const { action, reason } = req.body; // action: 'approve' | 'reject'
      
      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({
          success: false,
          message: "Action must be 'approve' or 'reject'"
        });
      }

      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found"
        });
      }

      // Cập nhật status
      const newStatus = action === 'approve' ? 'active' : 'rejected';
      
      await Product.findByIdAndUpdate(productId, {
        status: newStatus,
        'aiModerationResult.needsHumanReview': false,
        'aiModerationResult.humanReviewed': true,
        'aiModerationResult.humanReviewedAt': new Date(),
        'aiModerationResult.humanReviewedBy': req.accountID,
        ...(action === 'reject' && reason && {
          'aiModerationResult.reasons': [...(product.aiModerationResult?.reasons || []), reason]
        })
      });

      res.json({
        success: true,
        message: `Sản phẩm đã được ${action === 'approve' ? 'phê duyệt' : 'từ chối'}`
      });
    } catch (error) {
      console.error("Error reviewing product:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }

  // Thống kê AI moderation
  async getModerationStats(req, res) {
    try {
      const stats = await Product.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            avgConfidence: { $avg: "$aiModerationResult.confidence" }
          }
        }
      ]);

      const aiStats = await Product.aggregate([
        {
          $match: {
            "aiModerationResult.approved": { $ne: null }
          }
        },
        {
          $group: {
            _id: "$aiModerationResult.approved",
            count: { $sum: 1 },
            avgConfidence: { $avg: "$aiModerationResult.confidence" }
          }
        }
      ]);

      res.json({
        success: true,
        data: {
          statusStats: stats,
          aiStats: aiStats,
          needsReview: await Product.countDocuments({
            "aiModerationResult.needsHumanReview": true,
            status: "under_review"
          })
        }
      });
    } catch (error) {
      console.error("Error getting stats:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }

  // Lấy chi tiết sản phẩm với kết quả AI
  async getProductWithAIResult(req, res) {
    try {
      const { productId } = req.params;
      
      const product = await Product.findById(productId)
        .populate('sellerId', 'fullName email')
        .populate('categoryId', 'name')
        .populate('subcategoryId', 'name')
        .populate('attributes');

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found"
        });
      }

      res.json({
        success: true,
        data: product
      });
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
}

module.exports = new AdminController(); 