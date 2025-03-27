const Order = require("../models/Order");

class OrderController {
  async createOrder(req, res) {
    try {
      const {
        products,
        totalAmount,
        shippingAddress,
        shippingMethod,
        sellerId,
      } = req.body;

      if (!products || !totalAmount || !shippingAddress || !shippingMethod) {
        return res.status(400).json({ message: "Dữ liệu không hợp lệ!" });
      }

      const newOrder = new Order({
        buyerId: req.accountID,
        sellerId,
        products,
        totalAmount,
        shippingAddress,
        shippingMethod,
      });

      await newOrder.save();
      res.status(201).json({ message: "Đơn hàng đã được tạo thành công!" });
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
        .populate("buyerId")
        .populate("sellerId");

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
}

module.exports = new OrderController();
