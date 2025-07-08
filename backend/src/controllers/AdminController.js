const Product = require("../models/Product");
const { getModerationSystemHealth, processEnhancedAIModerationBackground } = require("../services/aiModeration.service");

// Import MODERATION_CONFIG to access and modify settings
const MODERATION_CONFIG = require("../services/aiModeration.service").MODERATION_CONFIG || {
  STRICT_MODE: false,
  getThresholds() { return {}; }
};

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

  // ⭐ NEW: Toggle AI Moderation Mode (Strict vs Balanced)
  async toggleModerationMode(req, res) {
    try {
      const { mode } = req.body; // 'strict' | 'balanced'
      
      if (!['strict', 'balanced'].includes(mode)) {
        return res.status(400).json({
          success: false,
          message: "Mode must be 'strict' or 'balanced'"
        });
      }

      // Update global config
      const aiModerationService = require("../services/aiModeration.service");
      aiModerationService.MODERATION_CONFIG.STRICT_MODE = (mode === 'strict');
      
      const thresholds = aiModerationService.MODERATION_CONFIG.getThresholds();
      
      res.json({
        success: true,
        message: `AI Moderation mode changed to ${mode.toUpperCase()}`,
        currentMode: mode,
        thresholds: thresholds,
        effectiveFrom: new Date().toISOString()
      });
      
      console.log(`🔧 Admin changed AI moderation mode to: ${mode.toUpperCase()}`);
    } catch (error) {
      console.error("Error toggling moderation mode:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }

  // ⭐ NEW: Manually reprocess a rejected product
  async reprocessProduct(req, res) {
    try {
      const { productId } = req.params;
      const { forceApprove = false } = req.body;
      
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found"
        });
      }

      if (forceApprove) {
        // Admin force approve
        await Product.findByIdAndUpdate(productId, {
          status: "approved",
          "aiModerationResult.approved": true,
          "aiModerationResult.humanOverride": true,
          "aiModerationResult.humanReviewedBy": req.accountID,
          "aiModerationResult.humanReviewedAt": new Date(),
          "aiModerationResult.reasons": ["Admin force approved"]
        });
        
        res.json({
          success: true,
          message: "Product force approved by admin",
          status: "approved"
        });
        
        console.log(`🔧 Admin force approved product ${productId}`);
      } else {
        // Rerun AI moderation with current settings
        await Product.findByIdAndUpdate(productId, {
          status: "pending",
          "aiModerationResult.reprocessing": true,
          "aiModerationResult.reprocessedBy": req.accountID,
          "aiModerationResult.reprocessedAt": new Date()
        });
        
        // Process in background
        setImmediate(async () => {
          try {
            const productData = {
              name: product.name,
              description: product.description,
              images: product.images || []
            };
            
            await processEnhancedAIModerationBackground(productId, productData);
            console.log(`🔧 Admin reprocessed product ${productId} successfully`);
          } catch (error) {
            console.error(`❌ Admin reprocess failed for ${productId}:`, error.message);
          }
        });
        
        res.json({
          success: true,
          message: "Product queued for reprocessing",
          status: "pending",
          estimatedTime: "30-60 seconds"
        });
      }
    } catch (error) {
      console.error("Error reprocessing product:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }

  // ⭐ NEW: Get AI Moderation System Health
  async getModerationHealth(req, res) {
    try {
      const healthData = getModerationSystemHealth();
      
      // Add admin-specific data
      const adminHealthData = {
        ...healthData,
        totalProducts: await Product.countDocuments(),
        pendingProducts: await Product.countDocuments({ status: "pending" }),
        rejectedProducts: await Product.countDocuments({ status: "rejected" }),
        approvedProducts: await Product.countDocuments({ status: "approved" }),
        needsReview: await Product.countDocuments({ 
          $or: [
            { status: "under_review" },
            { "aiModerationResult.needsHumanReview": true }
          ]
        }),
        lastHour: {
          processed: await Product.countDocuments({
            "aiModerationResult.reviewedAt": {
              $gte: new Date(Date.now() - 60 * 60 * 1000)
            }
          }),
          approved: await Product.countDocuments({
            status: "approved",
            "aiModerationResult.reviewedAt": {
              $gte: new Date(Date.now() - 60 * 60 * 1000)
            }
          })
        }
      };
      
      res.json({
        success: true,
        data: adminHealthData
      });
    } catch (error) {
      console.error("Error getting moderation health:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
}

module.exports = new AdminController(); 