const Account = require("../models/Account");
const Product = require("../models/Product");

class CartController {
  async addToCart(req, res) {
    const { productId, quantity } = req.body;
    try {
      let account = await Account.findById(req.accountID);
      if (!account) {
        return res.status(404).json({ message: "User not found" });
      }

      // Fetch product to check stock
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Find if product is already in cart
      const productIndex = account.cart.findIndex(
        (item) => item.productId.toString() === productId.toString()
      );

      // Calculate new total quantity in cart for this product
      let newCartQuantity = Number(quantity);
      if (productIndex > -1) {
        newCartQuantity += account.cart[productIndex].quantity;
      }

      // Check if requested quantity exceeds stock
      if (newCartQuantity > product.stock) {
        return res.status(400).json({
          status: "error",
          message: `Chỉ còn ${product.stock} sản phẩm trong kho. Không thể thêm vượt quá số lượng này.`,
        });
      }

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

    if (!Number.isInteger(Number(quantity)) || Number(quantity) < 0) {
      return res.status(400).json({
        message: "Quantity must be a non-negative integer",
        status: "error",
      });
    }

    try {
      // If quantity is 0, remove the item from cart
      if (Number(quantity) === 0) {
        const updatedAccount = await Account.findByIdAndUpdate(
          req.accountID,
          {
            $pull: {
              cart: { productId: productId },
            },
          },
          { new: true }
        );

        return res.status(200).json({
          message: "Item removed from cart",
          status: "success",
        });
      }

      // Fetch product to check stock
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({
          message: "Product not found",
          status: "error",
        });
      }

      if (Number(quantity) > product.stock) {
        return res.status(400).json({
          message: `Chỉ còn ${product.stock} sản phẩm trong kho. Không thể cập nhật vượt quá số lượng này.`,
          status: "error",
        });
      }

      const updatedAccount = await Account.findOneAndUpdate(
        {
          _id: req.accountID,
          "cart.productId": productId,
        },
        {
          $set: {
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

      res.status(200).json({
        message: "Quantity updated successfully",
        status: "success",
        updatedQuantity: updatedCartItem ? updatedCartItem.quantity : 0,
        cart: updatedAccount.cart,
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
  async clearCart(req, res) {
    const account = await Account.findById(req.accountID);
    account.cart = [];
    await account.save();
    res.status(200).json({ message: "Cart cleared successfully" });
  }
}

module.exports = new CartController();
