const Cart = require("../../models/Cart");
const Product = require("../../models/Product");
const PersonalDiscount = require("../../models/PersonalDiscount");
const { MESSAGES } = require("../../utils/messages");

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function getCartView({ accountId }) {
  const cart = await Cart.findOne({ accountId }).
  populate({
    path: "items.productId",
    populate: { path: "sellerId", select: "fullName avatar" }
  }).
  lean();

  let items = (cart?.items || []).filter((item) => item.productId != null);

  if (accountId && items.length > 0) {
    const productIds = items.map((i) => i.productId._id.toString());
    const discounts = await PersonalDiscount.find({
      productId: { $in: productIds },
      buyerId: accountId,
      isUse: false,
      endDate: { $gt: new Date() }
    });
    const discountMap = new Map();
    discounts.forEach((discount) => discountMap.set(discount.productId.toString(), discount));

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

  return { status: "success", cart: items };
}

async function addItemToCart({ accountId, productId, quantity }) {
  if (!productId) {
    throw createHttpError(400, MESSAGES.MISSING_FIELDS);
  }
  if (quantity == null || quantity === "" || Number(quantity) < 1) {
    throw createHttpError(400, MESSAGES.MISSING_FIELDS);
  }

  const product = await Product.findById(productId).lean();
  if (!product) {
    throw createHttpError(404, MESSAGES.CART.PRODUCT_NOT_FOUND);
  }

  let cart = await Cart.findOne({ accountId });
  if (!cart) {
    cart = new Cart({ accountId, items: [] });
  }

  const existingIndex = cart.items.findIndex((item) => item.productId.toString() === productId.toString());
  const newQty = Number(quantity) + (existingIndex > -1 ? cart.items[existingIndex].quantity : 0);

  if (newQty > product.stock) {
    throw createHttpError(400, `Chỉ còn ${product.stock} sản phẩm trong kho.`);
  }

  if (existingIndex > -1) {
    cart.items[existingIndex].quantity = newQty;
  } else {
    cart.items.push({ productId, quantity: Number(quantity) });
  }

  await cart.save();
  return { status: "success", message: MESSAGES.CART.ADD_SUCCESS };
}

async function removeItemsFromCart({ accountId, productIds }) {
  if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
    throw createHttpError(400, MESSAGES.MISSING_FIELDS);
  }

  const cart = await Cart.findOneAndUpdate(
    { accountId },
    { $pull: { items: { productId: { $in: productIds } } } },
    { new: true }
  );

  if (!cart) {
    throw createHttpError(404, MESSAGES.CART.NOT_FOUND);
  }

  return { status: "success", message: MESSAGES.CART.ITEMS_REMOVED };
}

async function updateCartQuantity({ accountId, productId, quantity }) {
  if (!productId) {
    throw createHttpError(400, MESSAGES.MISSING_FIELDS);
  }
  if (!Number.isInteger(Number(quantity)) || Number(quantity) < 0) {
    throw createHttpError(400, MESSAGES.CART.QUANTITY_INVALID);
  }

  if (Number(quantity) === 0) {
    await Cart.findOneAndUpdate({ accountId }, { $pull: { items: { productId } } });
    return { status: "success", message: MESSAGES.CART.ITEM_REMOVED };
  }

  const product = await Product.findById(productId).lean();
  if (!product) {
    throw createHttpError(404, MESSAGES.CART.PRODUCT_NOT_FOUND);
  }

  if (Number(quantity) > product.stock) {
    throw createHttpError(400, `Chỉ còn ${product.stock} sản phẩm trong kho.`);
  }

  const cart = await Cart.findOneAndUpdate(
    { accountId, "items.productId": productId },
    { $set: { "items.$.quantity": Number(quantity) } },
    { new: true }
  );

  if (!cart) {
    throw createHttpError(404, MESSAGES.CART.PRODUCT_NOT_IN_CART);
  }

  const updatedItem = cart.items.find((item) => item.productId.toString() === productId);

  return {
    status: "success",
    message: MESSAGES.CART.QUANTITY_UPDATED,
    updatedQuantity: updatedItem?.quantity ?? 0
  };
}

async function clearCart({ accountId }) {
  await Cart.findOneAndUpdate({ accountId }, { $set: { items: [] } });
  return { status: "success", message: MESSAGES.CART.CART_CLEARED };
}

module.exports = {
  getCartView,
  addItemToCart,
  removeItemsFromCart,
  updateCartQuantity,
  clearCart
};