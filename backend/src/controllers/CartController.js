const Account = require("../models/Account");

class CartController {
  async addToCart(req, res) {
    const { productId, quantity } = req.body; // Lấy productId và quantity từ request
    try {
      let account = await Account.findById(req.accountID); // Tìm kiếm account theo ID
      if (!account) {
        return res.status(404).json({ message: "User not found" });
      }

      const productIndex = account.cart.findIndex(
        (item) => item.productId.toString() === productId.toString()
      );

      if (productIndex > -1) {
        account.cart[productIndex].quantity += Number(quantity);
      } else {
        account.cart.push({
          productId,
          quantity: Number(quantity),
        });
      }

      await account.save();

      return res.status(200).json({
        status: "success",
        message: "Đã thêm sản phẩm vào giỏ hàng thành công.",
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  async purchaseNow(req, res) {
    try {
      const { productId, quantity } = req.body;

      // Validate required fields
      if (!productId || !quantity) {
        return res.status(400).json({
          status: "error",
          message: "ProductId and quantity are required",
        });
      }

      // Validate quantity is positive number
      if (quantity <= 0 || !Number.isInteger(Number(quantity))) {
        return res.status(400).json({
          status: "error",
          message: "Quantity must be a positive integer",
        });
      }

      // Create new order
      const order = await Order.create({
        userId: req.accountID,
        products: [
          {
            productId,
            quantity: Number(quantity),
          },
        ],
      });

      // Populate product details if needed
      const populatedOrder = await Order.findById(order._id).populate(
        "products.productId"
      );

      res.status(200).json({
        status: "success",
        message: "Order created successfully",
        order: populatedOrder,
      });
    } catch (error) {
      console.error("Error creating order:", error);
      res.status(500).json({
        status: "error",
        message: "Error creating order",
        error: error.message,
      });
    }
  }

  async deleteItem(req, res) {
    const { productIds } = req.body;
    // Validate ids array
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "Valid product ids array is required",
      });
    }

    try {
      const updatedAccount = await Account.findByIdAndUpdate(
        req.accountID,
        {
          $pull: {
            cart: {
              productId: { $in: productIds },
            },
          },
        },
        {
          new: true,
        }
      );

      if (!updatedAccount) {
        return res.status(404).json({
          status: "error",
          message: "Account not found",
        });
      }

      res.status(200).json({
        status: "success",
        message: "Items removed from cart",
        cart: updatedAccount.cart,
      });
    } catch (error) {
      console.error("Error deleting items:", error);
      res.status(500).json({
        status: "error",
        message: "Error removing items from cart",
        error: error.message,
      });
    }
  }

  async updateQuantity(req, res) {
    const { productId, quantity } = req.body;

    if (!productId) {
      return res.status(400).json({
        message: "ProductId is required",
        status: "error",
      });
    }

    if (!Number.isInteger(Number(quantity))) {
      return res.status(400).json({
        message: "Quantity must be an integer",
        status: "error",
      });
    }

    try {
      const updatedAccount = await Account.findOneAndUpdate(
        {
          _id: req.accountID,
          "cart.productId": productId,
        },
        {
          $inc: {
            "cart.$.quantity": Number(quantity),
          },
        },
        {
          new: true,
          runValidators: true,
        }
      );

      if (!updatedAccount) {
        return res.status(404).json({
          message: "Account or product not found in cart",
          status: "error",
        });
      }

      // Find the updated cart item
      const updatedCartItem = updatedAccount.cart.find(
        (item) => item.productId.toString() === productId
      );

      // Remove item if quantity becomes 0 or negative
      if (updatedCartItem.quantity <= 0) {
        await Account.findByIdAndUpdate(
          req.accountID,
          {
            $pull: {
              cart: { productId: productId },
            },
          },
          { new: true }
        );
      }

      // Get final account state after all updates
      const finalAccount = await Account.findById(req.accountID);

      res.status(200).json({
        message: "Quantity updated successfully",
        status: "success",
        updatedQuantity: updatedCartItem ? updatedCartItem.quantity : 0,
        cart: finalAccount.cart,
      });
    } catch (error) {
      console.error("Error updating quantity:", error);
      res.status(500).json({
        message: "Error updating quantity",
        status: "error",
        error: error.message,
      });
    }
  }
}

module.exports = new CartController();
