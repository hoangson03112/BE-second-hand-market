const Cart = require("../../models/Cart");
const Product = require("../../models/Product");
const PersonalDiscount = require("../../models/PersonalDiscount");
const { MESSAGES } = require("../../utils/messages");

class CartController {
  async getCart(req, res) {
    try {
      const cart = await Cart.findOne({ accountId: req.accountID })
        .populate({
          path: "items.productId",
          populate: { path: "sellerId", select: "fullName avatar" },
        })
        .lean();

      let items = (cart?.items || []).filter((item) => item.productId != null);

      if (req.accountID && items.length > 0) {
        const productIds = items.map((i) => i.productId._id.toString());
        const discounts = await PersonalDiscount.find({
          productId: { $in: productIds },
          buyerId: req.accountID,
          isUse: false,
          endDate: { $gt: new Date() },
        });
        const discountMap = new Map();
        discounts.forEach((d) => discountMap.set(d.productId.toString(), d));
        items = items.map((item) => {
          const product = { ...item.productId };
          const discount = discountMap.get(product._id.toString());
          if (discount) {
            product.originalPrice = product.price;
            product.price = discount.price;
            product.hasPersonalDiscount = true;
            product.personalDiscountId = discount._id;
          }
          return { ...item, productId: product };
        });
      }

      return res.status(200).json({ status: "success", cart: items });
    } catch (err) {
      return res.status(500).json({ status: "error", message: err.message });
    }
  }

  async addToCart(req, res) {
    const { productId, quantity } = req.body;

    if (!productId) {
      return res.status(400).json({ status: "error", message: MESSAGES.MISSING_FIELDS });
    }
    if (quantity == null || quantity === "" || Number(quantity) < 1) {
      return res.status(400).json({ status: "error", message: MESSAGES.MISSING_FIELDS });
    }

    try {
      const product = await Product.findById(productId).lean();
      if (!product) {
        return res.status(404).json({ status: "error", message: MESSAGES.CART.PRODUCT_NOT_FOUND });
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
          message: `Ch\u1ec9 c\u00f2n ${product.stock} s\u1ea3n ph\u1ea9m trong kho.`,
        });
      }

      if (existingIndex > -1) {
        cart.items[existingIndex].quantity = newQty;
      } else {
        cart.items.push({ productId, quantity: Number(quantity) });
      }

      await cart.save();

      return res.status(200).json({ status: "success", message: MESSAGES.CART.ADD_SUCCESS });
    } catch (err) {
      return res.status(500).json({ status: "error", message: err.message });
    }
  }

  async deleteItem(req, res) {
    const { productIds } = req.body;
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ status: "error", message: MESSAGES.MISSING_FIELDS });
    }

    try {
      const cart = await Cart.findOneAndUpdate(
        { accountId: req.accountID },
        { $pull: { items: { productId: { $in: productIds } } } },
        { new: true }
      );

      if (!cart) {
        return res.status(404).json({ status: "error", message: MESSAGES.CART.NOT_FOUND });
      }

      return res.status(200).json({ status: "success", message: MESSAGES.CART.ITEMS_REMOVED });
    } catch (error) {
      return res.status(500).json({ status: "error", message: error.message });
    }
  }

  async updateQuantity(req, res) {
    const { productId, quantity } = req.body;
    if (!productId) {
      return res.status(400).json({ status: "error", message: MESSAGES.MISSING_FIELDS });
    }
    if (!Number.isInteger(Number(quantity)) || Number(quantity) < 0) {
      return res.status(400).json({ status: "error", message: MESSAGES.CART.QUANTITY_INVALID });
    }

    try {
      // quantity = 0 => x\u00f3a item kh\u1ecfi cart
      if (Number(quantity) === 0) {
        await Cart.findOneAndUpdate(
          { accountId: req.accountID },
          { $pull: { items: { productId } } }
        );
        return res.status(200).json({ status: "success", message: MESSAGES.CART.ITEM_REMOVED });
      }

      const product = await Product.findById(productId).lean();
      if (!product) {
        return res.status(404).json({ status: "error", message: MESSAGES.CART.PRODUCT_NOT_FOUND });
      }

      if (Number(quantity) > product.stock) {
        return res.status(400).json({
          status: "error",
          message: `Ch\u1ec9 c\u00f2n ${product.stock} s\u1ea3n ph\u1ea9m trong kho.`,
        });
      }

      const cart = await Cart.findOneAndUpdate(
        { accountId: req.accountID, "items.productId": productId },
        { $set: { "items.$.quantity": Number(quantity) } },
        { new: true }
      );

      if (!cart) {
        return res.status(404).json({ status: "error", message: MESSAGES.CART.PRODUCT_NOT_IN_CART });
      }

      const updatedItem = cart.items.find((i) => i.productId.toString() === productId);

      return res.status(200).json({
        status: "success",
        message: MESSAGES.CART.QUANTITY_UPDATED,
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
      return res.status(200).json({ status: "success", message: MESSAGES.CART.CART_CLEARED });
    } catch (err) {
      return res.status(500).json({ status: "error", message: err.message });
    }
  }
}

module.exports = new CartController();

