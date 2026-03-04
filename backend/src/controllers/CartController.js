const Cart = require("../models/Cart");
const Product = require("../models/Product");

class CartController {
  async getCart(req, res) {
    try {
      const cart = await Cart.findOne({ accountId: req.accountID })
        .populate({
          path: "items.productId",
          populate: { path: "sellerId", select: "fullName avatar" },
        })
        .lean();

      const items = (cart?.items || []).filter((item) => item.productId != null);

      return res.status(200).json({ status: "success", cart: items });
    } catch (err) {
      return res.status(500).json({ status: "error", message: err.message });
    }
  }

  async addToCart(req, res) {
    const { productId, quantity } = req.body;

    if (!productId) {
      return res.status(400).json({ status: "error", message: "productId is required" });
    }
    if (quantity == null || quantity === "" || Number(quantity) < 1) {
      return res.status(400).json({ status: "error", message: "quantity must be a positive number" });
    }

    try {
      const product = await Product.findById(productId).lean();
      if (!product) {
        return res.status(404).json({ status: "error", message: "Product not found" });
      }

      // Upsert cart document cho account
      let cart = await Cart.findOne({ accountId: req.accountID });
      if (!cart) {
        cart = new Cart({ accountId: req.accountID, items: [] });
      }

      const existingIndex = cart.items.findIndex(
        (item) => item.productId.toString() === productId.toString()
      );

      const newQty = Number(quantity) + (existingIndex > -1 ? cart.items[existingIndex].quantity : 0);

      if (newQty > product.stock) {
        return res.status(400).json({
          status: "error",
          message: `Chỉ còn ${product.stock} sản phẩm trong kho.`,
        });
      }

      if (existingIndex > -1) {
        cart.items[existingIndex].quantity = newQty;
      } else {
        cart.items.push({ productId, quantity: Number(quantity) });
      }

      await cart.save();

      return res.status(200).json({ status: "success", message: "Đã thêm sản phẩm vào giỏ hàng." });
    } catch (err) {
      return res.status(500).json({ status: "error", message: err.message });
    }
  }

  async deleteItem(req, res) {
    const { productIds } = req.body;
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ status: "error", message: "Valid product ids array is required" });
    }

    try {
      const cart = await Cart.findOneAndUpdate(
        { accountId: req.accountID },
        { $pull: { items: { productId: { $in: productIds } } } },
        { new: true }
      );

      if (!cart) {
        return res.status(404).json({ status: "error", message: "Cart not found" });
      }

      return res.status(200).json({ status: "success", message: "Items removed from cart" });
    } catch (error) {
      return res.status(500).json({ status: "error", message: error.message });
    }
  }

  async updateQuantity(req, res) {
    const { productId, quantity } = req.body;
    if (!productId) {
      return res.status(400).json({ status: "error", message: "productId is required" });
    }
    if (!Number.isInteger(Number(quantity)) || Number(quantity) < 0) {
      return res.status(400).json({ status: "error", message: "Quantity must be a non-negative integer" });
    }

    try {
      // quantity = 0 → xóa item khỏi cart
      if (Number(quantity) === 0) {
        await Cart.findOneAndUpdate(
          { accountId: req.accountID },
          { $pull: { items: { productId } } }
        );
        return res.status(200).json({ status: "success", message: "Item removed from cart" });
      }

      const product = await Product.findById(productId).lean();
      if (!product) {
        return res.status(404).json({ status: "error", message: "Product not found" });
      }

      if (Number(quantity) > product.stock) {
        return res.status(400).json({
          status: "error",
          message: `Chỉ còn ${product.stock} sản phẩm trong kho.`,
        });
      }

      const cart = await Cart.findOneAndUpdate(
        { accountId: req.accountID, "items.productId": productId },
        { $set: { "items.$.quantity": Number(quantity) } },
        { new: true }
      );

      if (!cart) {
        return res.status(404).json({ status: "error", message: "Product not found in cart" });
      }

      const updatedItem = cart.items.find((i) => i.productId.toString() === productId);

      return res.status(200).json({
        status: "success",
        message: "Quantity updated successfully",
        updatedQuantity: updatedItem?.quantity ?? 0,
      });
    } catch (error) {
      return res.status(500).json({ status: "error", message: error.message });
    }
  }

  async clearCart(req, res) {
    try {
      await Cart.findOneAndUpdate(
        { accountId: req.accountID },
        { $set: { items: [] } }
      );
      return res.status(200).json({ status: "success", message: "Cart cleared successfully" });
    } catch (err) {
      return res.status(500).json({ status: "error", message: err.message });
    }
  }
}

module.exports = new CartController();
