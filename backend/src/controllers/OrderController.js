const Order = require("../models/Order");
const Product = require("../models/Product");
const Seller = require("../models/Seller");

class OrderController {
  async createOrder(req, res) {
    try {
      const {
        products,
        totalAmount,
        shippingAddress,
        shippingMethod,
        sellerId,
        paymentMethod,
      } = req.body;

      if (!products || !totalAmount || !shippingAddress || !shippingMethod) {
        return res.status(400).json({ message: "Dữ liệu không hợp lệ!" });
      }
      products.forEach(async (product) => {
        const productData = await Product.findById(product.productId);
        productData.stock -= product.quantity;
        if (productData.stock < 0) {
          return res
            .status(400)
            .json({ message: "Sản phẩm không đủ số lượng!" });
        }
        await productData.save();
      });

      const newOrder = new Order({
        buyerId: req.accountID,
        sellerId,
        products,
        totalAmount,
        shippingAddress,
        shippingMethod,
        paymentMethod,
      });

      await newOrder.save();
      res.status(201).json({ order: newOrder });
    } catch (error) {
      console.error("Error processing order:", error);

      // Trả về phản hồi lỗi
      res.status(500).json({ message: "Có lỗi xảy ra khi xử lý đơn hàng." });
    }
  }
  async getOrderByAccount(req, res) {
    try {
      const orders = await Order.find({ buyerId: req.accountID }).sort({
        createdAt: -1,
      });

      if (!orders.length) {
        return res
          .status(200)
          .json({ orders: [], message: "No orders found for this account" });
      }

      return res.status(200).json({ orders });
    } catch (error) {
      console.error("Error fetching orders:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }
  async updateOrder(req, res) {
    try {
      const { reason, orderId, status } = req.body;
      console.log(reason);

      await Order.findByIdAndUpdate(orderId, { status, reason }, { new: true });

      const allOrders = await Order.find();

      if (allOrders.length === 0) {
        return res
          .status(200)
          .json({ orders: [], message: "No orders found for this account" });
      }

      return res
        .status(200)
        .json({ orders: allOrders, message: "Update order successfully" });
    } catch (error) {
      console.error("Error updating order:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }
  async getOrdersByAdmin(req, res) {
    try {
      const orders = await Order.find()
        .sort({ createdAt: -1 })
        .populate("buyerId", "fullName email phoneNumber")
        .populate("sellerId", "fullName email phoneNumber createdAt")
        .populate({
          path: "products.productId",
          select: "name price images avatar createdAt",
          populate: [
            {
              path: "categoryId",
              select: "name",
            },
            {
              path: "subcategoryId",
              select: "name",
            },
            {
              path: "attributes",
              select: "key value",
            },
          ],
        })
        .populate("shippingAddress");

      if (!orders.length) {
        return res
          .status(200)
          .json({ orders: [], message: "No orders found for this account" });
      }
      // Lấy tất cả seller IDs từ orders (kiểm tra null safety)
      const sellerIds = [
        ...new Set(
          orders
            .filter((order) => order.sellerId && order.sellerId._id)
            .map((order) => order.sellerId._id)
        ),
      ];

      // Query tất cả sellers một lần
      const sellers = await Seller.find({ accountId: { $in: sellerIds } });

      // Tạo map để lookup nhanh
      const sellerMap = new Map();
      sellers.forEach((seller) => {
        sellerMap.set(seller.accountId.toString(), seller);
      });

      // Merge seller data vào orders
      const ordersWithSeller = orders.map((order) => {
        const seller =
          order.sellerId && order.sellerId._id
            ? sellerMap.get(order.sellerId._id.toString())
            : null;

        return {
          ...order.toObject(),
          sellerId: {
            ...(order.sellerId?.toObject() || {}),
            seller: seller
              ? {
                  _id: seller._id,
                  businessAddress: seller.businessAddress,
                  province: seller.province,
                  district: seller.district,
                  ward: seller.ward,
                  verificationStatus: seller.verificationStatus,
                }
              : null,
          },
        };
      });

      return res.status(200).json({ orders: ordersWithSeller });
    } catch (error) {
      console.error("Error fetching orders:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }
  async getTotalAmountOfOrder(req, res) {
    try {
      const { id } = req.params;
      const order = await Order.findById(id);
      return res.status(200).json({ totalAmount: order.totalAmount });
    } catch (error) {
      console.error("Error fetching total amount of order:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }
  async getOrderById(req, res) {
    try {
      const { id } = req.params;
      const order = await Order.findById(id)
        .populate({
          path: "products.productId",
          model: "Product",
        })
        .populate("shippingAddress")
        .populate("sellerId");
      return res.status(200).json({ order });
    } catch (error) {
      console.error("Error fetching order by id:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }

  async getOrdersBySeller(req, res) {
    try {
      const sellerId = req.params.sellerId || req.accountID;

      const orders = await Order.find({ sellerId: sellerId })
        .sort({ createdAt: -1 })
        .populate({
          path: "buyerId",
          select: "fullName email phoneNumber",
        })
        .populate({
          path: "products.productId",
          select: "name price images",
        })
        .populate({
          path: "shippingAddress",
          select: "fullName phoneNumber province district ward specificAddress",
        });

      if (!orders.length) {
        return res
          .status(200)
          .json({ orders: [], message: "No orders found for this seller" });
      }

      return res.status(200).json({ orders });
    } catch (error) {
      console.error("Error fetching seller orders:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }

  async getOrdersOfSeller(req, res) {
    try {
      const orders = await Order.find({ sellerId: req.accountID })
        .sort({ createdAt: -1 })
        .populate({
          path: "buyerId",
          select: "fullName email phoneNumber",
        })
        .populate({
          path: "products.productId",
          select: "name price images",
        })
        .populate({
          path: "shippingAddress",
          select: "fullName phoneNumber province district ward specificAddress",
        });

      if (!orders.length) {
        return res
          .status(200)
          .json({ orders: [], message: "No orders found for this seller" });
      }

      return res.status(200).json({ orders });
    } catch (error) {
      console.error("Error fetching my seller orders:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }

  async updateOrderBySeller(req, res) {
    try {
      const { orderId } = req.params;
      const { status, reason } = req.body;
      const sellerId = req.accountID;

      // Verify that the order belongs to this seller
      const order = await Order.findOne({ _id: orderId, sellerId: sellerId });

      if (!order) {
        return res.status(404).json({
          message:
            "Order not found or you don't have permission to update this order",
        });
      }
      let updatedOrder;
      if (status === "delivered") {
        updatedOrder = await Order.findByIdAndUpdate(
          orderId,
          { status, deliveredAt: new Date() },
          { new: true }
        )
          .populate({
            path: "buyerId",
            select: "fullName email phoneNumber",
          })
          .populate({
            path: "products.productId",
            select: "name price images",
          })
          .populate({
            path: "shippingAddress",
            select:
              "fullName phoneNumber province district ward specificAddress",
          });
      } else {
        updatedOrder = await Order.findByIdAndUpdate(
          orderId,
          { status, reason },
          { new: true }
        )
          .populate({
            path: "buyerId",
            select: "fullName email phoneNumber",
          })
          .populate({
            path: "products.productId",
            select: "name price images",
          })
          .populate({
            path: "shippingAddress",
            select:
              "fullName phoneNumber province district ward specificAddress",
          });
      }

      return res.status(200).json({
        order: updatedOrder,
        message: "Order updated successfully",
      });
    } catch (error) {
      console.error("Error updating order by seller:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }

  async getSellerOrderStats(req, res) {
    try {
      const sellerId = req.accountID;

      const stats = await Order.aggregate([
        { $match: { sellerId: mongoose.Types.ObjectId(sellerId) } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalAmount: { $sum: "$totalAmount" },
          },
        },
      ]);

      const totalOrders = await Order.countDocuments({ sellerId: sellerId });
      const totalRevenue = await Order.aggregate([
        {
          $match: {
            sellerId: mongoose.Types.ObjectId(sellerId),
            status: "delivered",
          },
        },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]);

      return res.status(200).json({
        stats,
        totalOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
      });
    } catch (error) {
      console.error("Error fetching seller order stats:", error);
      return res.status(500).json({ message: "Server error" });
    }
  }
  async updateGHNOrder(req, res) {
    try {
      const { id } = req.params;
      const {
        ghnOrderCode,
        ghnSortCode,
        expectedDeliveryTime,
        transType,
        shippingFee,
        insuranceFee,
        codFee,
        totalShippingFee,
        ghnOrderInfo,
      } = req.body;

      const updateData = {
        ghnOrderCode,
        ghnSortCode,
        expectedDeliveryTime: new Date(expectedDeliveryTime),
        transType,
        shippingFee,
        insuranceFee,
        codFee,
        totalShippingFee,
        ghnTrackingUrl: `https://dev-online.ghn.vn/tracking?order_code=${ghnOrderCode}`,
        ghnStatus: "pending",
        ghnOrderInfo,
      };

      const updatedOrder = await Order.findByIdAndUpdate(id, updateData, {
        new: true,
      });

      res.status(200).json({
        message: "GHN order information updated successfully",
        order: updatedOrder,
      });
    } catch (error) {
      console.error("Error updating GHN order:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
  async updatePaymentStatus(req, res) {
    try {
      const { orderId } = req.body;
      const updatedOrder = await Order.findByIdAndUpdate(
        orderId,
        { statusPayment: true },
        { new: true }
      );
      res.status(200).json({
        message: "Payment status updated successfully",
        order: updatedOrder,
      });
    } catch (error) {
      console.error("Error updating payment status:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
}

module.exports = new OrderController();
