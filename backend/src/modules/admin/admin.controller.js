const Product = require("../../models/Product");
const { getModerationSystemHealth, processEnhancedAIModerationBackground } = require("../../services/aiModeration.service");
const AdminAuditLog = require("../../models/AdminAuditLog");
const { MESSAGES } = require("../../utils/messages");

// Import MODERATION_CONFIG to access and modify settings
const MODERATION_CONFIG = require("../../services/aiModeration.service").MODERATION_CONFIG || {
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
      res.status(500).json({ success: false, message: MESSAGES.SERVER_ERROR });
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
          message: MESSAGES.ADMIN.ACTION_MUST_BE_APPROVE_OR_REJECT
        });
      }

      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: MESSAGES.ADMIN.PRODUCT_NOT_FOUND
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
        message: MESSAGES.ADMIN.PRODUCT_APPROVED_OR_REJECTED(action),
      });
    } catch (error) {
      console.error("Error reviewing product:", error);
      res.status(500).json({ success: false, message: MESSAGES.SERVER_ERROR });
    }
  }

  // Th\u1ed1ng k\u00ea AI moderation
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
      res.status(500).json({ success: false, message: MESSAGES.SERVER_ERROR });
    }
  }

  // L\u1ea5y chi ti\u1ebft s\u1ea3n ph\u1ea9m v\u1edbi k\u1ebft qu\u1ea3 AI
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
          message: MESSAGES.ADMIN.PRODUCT_NOT_FOUND
        });
      }

      res.json({
        success: true,
        data: product
      });
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ success: false, message: MESSAGES.SERVER_ERROR });
    }
  }

  // ⭐ NEW: Toggle AI Moderation Mode (Strict vs Balanced)
  async toggleModerationMode(req, res) {
    try {
      const { mode } = req.body; // 'strict' | 'balanced'
      
      if (!['strict', 'balanced'].includes(mode)) {
        return res.status(400).json({
          success: false,
          message: MESSAGES.ADMIN.AI_MODE_INVALID
        });
      }

      // Update global config
      const aiModerationService = require("../../services/aiModeration.service");
const { MESSAGES } = require('../../utils/messages');
      aiModerationService.MODERATION_CONFIG.STRICT_MODE = (mode === 'strict');
      
      const thresholds = aiModerationService.MODERATION_CONFIG.getThresholds();
      
      res.json({
        success: true,
        message: MESSAGES.ADMIN.AI_MODE_CHANGED(mode),
        currentMode: mode,
        thresholds: thresholds,
        effectiveFrom: new Date().toISOString()
      });
      
      console.log(`[ADMIN] Changed AI moderation mode to: ${mode.toUpperCase()}`);
    } catch (error) {
      console.error("Error toggling moderation mode:", error);
      res.status(500).json({ success: false, message: MESSAGES.SERVER_ERROR });
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
          message: MESSAGES.ADMIN.PRODUCT_NOT_FOUND
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
          message: MESSAGES.ADMIN.PRODUCT_FORCE_APPROVED,
          status: "approved"
        });
        
      console.log(`[ADMIN] Force approved product ${productId}`);
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
            console.log(`[ADMIN] Reprocessed product ${productId} successfully`);
          } catch (error) {
            console.error(`[ADMIN] Reprocess failed for ${productId}:`, error.message);
          }
        });
        
        res.json({
          success: true,
          message: MESSAGES.ADMIN.PRODUCT_QUEUED_REPROCESSING,
          status: "pending",
          estimatedTime: "30-60 seconds"
        });
      }
    } catch (error) {
      console.error("Error reprocessing product:", error);
      res.status(500).json({ success: false, message: MESSAGES.SERVER_ERROR });
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
      res.status(500).json({ success: false, message: MESSAGES.SERVER_ERROR });
    }
  }

  async getAuditLogs(req, res) {
    try {
      const { page = 1, limit = 20, action, targetType, adminId, startDate, endDate } = req.query;
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const skip = (pageNum - 1) * limitNum;

      const filter = {};
      if (action) filter.action = action;
      if (targetType) filter.targetType = targetType;
      if (adminId) filter.adminId = adminId;
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          filter.createdAt.$lte = end;
        }
      }

      const [logs, total] = await Promise.all([
        AdminAuditLog.find(filter)
          .populate("adminId", "fullName email")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        AdminAuditLog.countDocuments(filter),
      ]);

      return res.status(200).json({
        success: true,
        data: logs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalItems: total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      console.error("Error fetching admin audit logs:", error);
      return res.status(500).json({ success: false, message: MESSAGES.SERVER_ERROR });
    }
  }
}

module.exports = new AdminController(); 
