const Order = require("../../models/Order");
const Product = require("../../models/Product");
const Account = require("../../models/Account");
const Seller = require("../../models/Seller");
const Refund = require("../../models/Refund");
const Report = require("../../models/Report");
const { MESSAGES } = require("../../utils/messages");

exports.getDashboardStats = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
    } = req.query;

    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.createdAt.$lte = end;
      }
    }

    // 1. Order stats by status
    const orderMatch = { ...(Object.keys(dateFilter).length ? dateFilter : {}) };
    const orderStatusAgg = await Order.aggregate([
      { $match: orderMatch },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$totalAmount" },
        },
      },
    ]);

    const orderStats = {
      pending: 0,
      confirmed: 0,
      shipping: 0,
      delivered: 0,
      refund: 0,
      refunded: 0,
      cancelled: 0,
      totalRevenue: 0,
    };
    orderStatusAgg.forEach((o) => {
      const status = o._id;
      if (orderStats[status] !== undefined) {
        orderStats[status] = o.count;
      }
      if (status === "delivered" || status === "refunded" || status === "completed") {
        orderStats.totalRevenue += o.totalAmount || 0;
      }
    });

    // 2. Refund stats by status
    const refundMatch = { ...(Object.keys(dateFilter).length ? dateFilter : {}) };
    const refundAgg = await Refund.aggregate([
      { $match: refundMatch },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          amount: { $sum: "$refundAmount" },
        },
      },
    ]);

    const refundStats = {
      pending: 0,
      approved: 0,
      returned: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      totalRefundAmount: 0,
    };
    refundAgg.forEach((r) => {
      const status = r._id;
      if (refundStats[status] !== undefined) {
        refundStats[status] = r.count;
      }
      if (status === "completed") {
        refundStats.totalRefundAmount += r.amount || 0;
      }
    });

    // 3. Account and seller stats
    const [bannedAccounts, bannedSellers] = await Promise.all([
      Account.countDocuments({ status: "banned" }),
      Account.countDocuments({ status: "banned", role: "seller" }),
    ]);

    // 4. Pending reports
    const pendingReports = await Report.countDocuments({ status: "pending" });

    // 5. Quick KPIs for cards
    const totalOrders = await Order.countDocuments(orderMatch);
    const completedOrders = await Order.countDocuments({
      ...orderMatch,
      status: { $in: ["delivered", "completed", "refunded"] },
    });
    const completionRate = totalOrders
      ? Math.round((completedOrders / totalOrders) * 100)
      : 0;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const [newUsers, newSellers] = await Promise.all([
      Account.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Seller.countDocuments({ createdAt: { $gte: startOfMonth } }),
    ]);

    res.json({
      success: true,
      data: {
        // Summary cards
        kpis: {
          totalRevenue: orderStats.totalRevenue,
          totalOrders,
          completionRate,
          totalRefundAmount: refundStats.totalRefundAmount,
          newUsers,
          newSellers,
        },
        // Order funnel
        ordersByStatus: orderStats,
        // Refund funnel
        refundsByStatus: refundStats,
        // Risk / moderation
        risk: {
          bannedAccounts,
          bannedSellers,
          pendingReports,
        },
      },
    });
  } catch (err) {
    console.error("getDashboardStats error:", err);
    res.status(500).json({ success: false, message: MESSAGES.SERVER_ERROR });
  }
};

