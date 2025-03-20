const Order = require("../models/Order");

class OrderController {
  async createOrder(req, res) {
    try {
      const { products, totalAmount, shippingAddress, shippingMethod } =
        req.body;

      if (!products || !totalAmount || !shippingAddress || !shippingMethod) {
        return res.status(400).json({ message: "Dữ liệu không hợp lệ!" });
      }

      const newOrder = new Order({
        userId: req.accountID,
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
      const orders = await Order.find({ userId: req.accountID }).sort({
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

      // Cập nhật đơn hàng theo orderId
      await Order.findByIdAndUpdate(orderId, { status, reason }, { new: true });

      // Lấy tất cả đơn hàng sau khi cập nhật
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
}

module.exports = new OrderController();
