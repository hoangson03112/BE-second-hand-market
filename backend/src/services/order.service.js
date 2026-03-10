"use strict";

const mongoose = require("mongoose");
const Order   = require("../models/Order");
const Refund  = require("../models/Refund");
const Product = require("../models/Product");
const Address = require("../models/Address");
const Seller  = require("../models/Seller");
const Account = require("../models/Account");
const BankInfo = require("../models/BankInfo");
const PersonalDiscount = require("../models/PersonalDiscount");
const ghnService   = require("./ghn.service");
const WalletService = require("./wallet.service");
const {
  validateOrderStatusTransition,
  getStatusTimestampField,
} = require("../utils/orderStateMachine");

// Platform fee rate (0% — marketplace is free)
const PLATFORM_FEE_RATE = 0;

// ─── helpers ────────────────────────────────────────────────────────────────

function isGhnShipping(method) {
  return typeof method === "string" && method.toLowerCase().includes("ghn");
}

async function resolveFromAddress(order) {
  const seller = await Seller.findOne({ accountId: order.sellerId })
    .populate("accountId", "fullName phoneNumber")
    .lean();
  const sellerAccount = await Account.findById(order.sellerId)
    .select("fullName phoneNumber")
    .lean();

  if (seller?.from_district_id && seller?.from_ward_code) {
    return {
      from_province_id: seller.from_province_id,
      from_district_id: seller.from_district_id,
      from_ward_code:   seller.from_ward_code,
      businessAddress:  seller.businessAddress,
      from_name:        seller.accountId?.fullName,
      from_phone:       seller.accountId?.phoneNumber,
    };
  }

  const pickupAddr = await Address.findOne({
    accountId: order.sellerId,
    type: "pickup",
  }).lean();

  if (pickupAddr?.districtId && pickupAddr?.wardCode) {
    return {
      from_province_id: pickupAddr.provinceId,
      from_district_id: pickupAddr.districtId,
      from_ward_code:   pickupAddr.wardCode,
      from_address:     pickupAddr.specificAddress || "",
      businessAddress:  pickupAddr.specificAddress || "",
      from_name:        pickupAddr.fullName  || sellerAccount?.fullName,
      from_phone:       pickupAddr.phoneNumber || sellerAccount?.phoneNumber,
    };
  }

  const firstProduct = await Product.findById(order.products[0]?.productId)
    .populate("address")
    .lean();
  const productAddr = firstProduct?.address;

  if (productAddr?.districtId && productAddr?.wardCode) {
    return {
      from_province_id: productAddr.provinceId,
      from_district_id: productAddr.districtId,
      from_ward_code:   productAddr.wardCode,
      from_address:     productAddr.specificAddress || "",
      businessAddress:  productAddr.specificAddress || "",
      from_name:        productAddr.fullName  || sellerAccount?.fullName,
      from_phone:       productAddr.phoneNumber || sellerAccount?.phoneNumber,
    };
  }

  return null;
}

// ─── OrderService ────────────────────────────────────────────────────────────

const OrderService = {

  /**
   * Create a new order.
   * Validates stock, resolves discounts, deducts stock, persists order.
   *
   * Returns the saved Order document.
   */
  async createOrder({
    buyerId,
    sellerId,
    products,
    totalAmount,
    shippingAddress,
    shippingMethod,
    paymentMethod,
    productAmount: bodyProductAmount,
    shippingFee: bodyShippingFee,
    totalShippingFee,
    expectedDeliveryTime,
  }) {
    // Verify seller can accept bank_transfer
    if (paymentMethod === "bank_transfer") {
      const sellerAccount = await Account.findById(sellerId).select("role").lean();
      if (sellerAccount && sellerAccount.role !== "seller") {
        throw Object.assign(new Error("Seller chưa xác minh. Chỉ hỗ trợ COD."), { status: 400 });
      }
    }

    const productsWithPrice = [];
    const usedDiscountIds   = [];

    for (const item of products) {
      const productData = await Product.findById(item.productId);
      if (!productData) {
        throw Object.assign(new Error(`Sản phẩm ${item.productId} không tồn tại`), { status: 404 });
      }
      if (productData.stock < item.quantity) {
        throw Object.assign(
          new Error(`Sản phẩm "${productData.name}" không đủ số lượng (còn ${productData.stock})`),
          { status: 400 },
        );
      }

      let finalPrice = productData.price;
      const discount = await PersonalDiscount.findOne({
        productId: item.productId,
        buyerId,
        sellerId,
        isUse: false,
        endDate: { $gt: new Date() },
      });
      if (discount) {
        finalPrice = discount.price;
        usedDiscountIds.push(discount._id);
      }

      productsWithPrice.push({
        productId: item.productId,
        quantity:  item.quantity,
        price:     finalPrice,
      });
    }

    if (usedDiscountIds.length > 0) {
      await PersonalDiscount.updateMany(
        { _id: { $in: usedDiscountIds } },
        { isUse: true },
      );
    }

    const shippingFee   = Number(bodyShippingFee ?? totalShippingFee ?? 0) || 0;
    const productAmount = typeof bodyProductAmount === "number"
      ? bodyProductAmount
      : Math.max(0, Number(totalAmount) - shippingFee);
    const platformFee   = Math.round(productAmount * PLATFORM_FEE_RATE);

    const order = await Order.create({
      buyerId,
      sellerId,
      products: productsWithPrice,
      productAmount,
      shippingFee,
      platformFee,
      totalAmount,
      shippingAddress,
      shippingMethod,
      paymentMethod,
      expectedDeliveryTime: expectedDeliveryTime ? new Date(expectedDeliveryTime) : undefined,
      statusHistory: [{ status: "pending", updatedAt: new Date() }],
    });

    // Deduct stock
    for (const item of products) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { stock: -item.quantity },
      });
    }

    // Ensure wallet exists for seller
    await WalletService.ensureWallet(sellerId, null);

    return order;
  },

  /**
   * Apply a validated status transition to an order.
   * Handles all side effects: GHN calls, stock restore, timestamps, history.
   *
   * Returns the updated Order document.
   */
  async updateOrderStatus(orderId, newStatus, { reason, actorId } = {}) {
    const order = await Order.findById(orderId);
    if (!order) throw Object.assign(new Error("Đơn hàng không tồn tại"), { status: 404 });

    validateOrderStatusTransition(order.status, newStatus); // throws on invalid

    const now       = new Date();
    const updateSet = { status: newStatus };
    const tsField   = getStatusTimestampField(newStatus);
    if (tsField) updateSet[tsField] = now;
    if (reason) {
      if (newStatus === "cancelled")       updateSet.cancelReason = reason;
      if (newStatus === "refund_requested") updateSet.refundReason = reason;
    }

    // ── Side effects ──────────────────────────────────────────────────────────

    if (newStatus === "confirmed") {
      await this._createGHNOrder(order, updateSet);

    } else if (newStatus === "completed") {
      await this._markCompleted(order, updateSet);

    } else if (newStatus === "cancelled") {
      await this._cancelOrder(order, updateSet);

    } else if (newStatus === "returned") {
      await this._restoreStock(order);

    } else if (newStatus === "delivered") {
      // Set 24-hour inspection window for return/refund eligibility
      updateSet.returnWindowExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      // COD payment is confirmed on delivery
      if (order.paymentMethod === "cod" && order.paymentStatus !== "paid") {
        updateSet.paymentStatus = "paid";
      }
    }

    // Sync ghnStatus for shipping stages
    const ghnSyncStatuses = ["confirmed", "picked_up", "shipping", "out_for_delivery", "delivered"];
    if (ghnSyncStatuses.includes(newStatus)) {
      updateSet.ghnStatus = newStatus;
    }

    const updated = await Order.findByIdAndUpdate(
      orderId,
      {
        $set:  updateSet,
        $push: { statusHistory: { status: newStatus, updatedAt: now } },
      },
      { new: true },
    );

    return updated;
  },

  // ── Private helpers ─────────────────────────────────────────────────────────

  async _createGHNOrder(order, updateSet) {
    if (order.ghnOrderCode || !order.shippingAddress || !isGhnShipping(order.shippingMethod)) {
      return;
    }
    try {
      const [address, fromAddress] = await Promise.all([
        Address.findById(order.shippingAddress).lean(),
        resolveFromAddress(order),
      ]);

      if (!address || !fromAddress) {
        console.warn(`[OrderService] Cannot create GHN — missing address for order ${order._id}`);
        return;
      }

      const codAmount = order.paymentMethod === "cod"
        ? Math.max(0, order.productAmount)
        : 0;

      const ghnData = await ghnService.createShippingOrder({
        orderId:       String(order._id),
        fromAddress,
        toAddress:     address,
        codAmount,
        weight:        500,
        paymentMethod: order.paymentMethod,
      });

      Object.assign(updateSet, ghnData);
    } catch (err) {
      // GHN failure must not block order confirmation
      console.error(`[OrderService] GHN creation failed for order ${order._id}:`, err.message);
    }
  },

  async _markCompleted(order, updateSet) {
    // Mark payment as settled when buyer confirms receipt
    updateSet.paymentStatus   = "paid";
    updateSet.buyerConfirmedAt = new Date();

    // Bank transfer: seller already received money externally — no platform payout needed.
    // COD: funds sit in seller pendingBalance until admin releases them.
    if (order.paymentMethod === "bank_transfer") {
      updateSet.payoutStatus = "paid";
      updateSet.payoutAt     = new Date();
    } else {
      updateSet.payoutStatus = "pending"; // payout release triggered by admin or auto-job
    }

    // Increment soldCount
    for (const item of order.products) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { soldCount: item.quantity },
      });
    }
  },

  async _cancelOrder(order, updateSet) {
    // Cancel GHN shipment if applicable
    if (order.ghnOrderCode && isGhnShipping(order.shippingMethod)) {
      try {
        const result = await ghnService.cancelShippingOrder(order.ghnOrderCode);
        if (result.success) updateSet.ghnStatus = "cancelled";
      } catch (err) {
        console.error(`[OrderService] GHN cancel failed for ${order.ghnOrderCode}:`, err.message);
      }
    }
    // Restore stock
    await this._restoreStock(order);
  },

  async _restoreStock(order) {
    for (const item of order.products) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { stock: item.quantity },
      });
    }
  },

  // ── Queries ──────────────────────────────────────────────────────────────────

  async getOrderById(orderId) {
    const order = await Order.findById(orderId)
      .populate("products.productId", "name price images avatar condition stock")
      .populate("shippingAddress")
      .populate("sellerId", "fullName email phoneNumber")
      .populate("buyerId", "fullName email phoneNumber")
      .populate("refundRequestId")
      .lean();

    // Backfill: old orders may have refundRequestId = null even though a Refund doc exists
    if (
      order &&
      !order.refundRequestId &&
      order.status &&
      order.status.startsWith("refund")
    ) {
      const refundDoc = await Refund.findOne({ orderId: order._id }).sort({ createdAt: -1 }).lean();
      if (refundDoc) {
        order.refundRequestId = refundDoc;
        // Also persist the link so future fetches don’t need this fallback
        await Order.findByIdAndUpdate(order._id, { $set: { refundRequestId: refundDoc._id } });
      }
    }

    return order;
  },

  async getOrdersByBuyer(buyerId, queryParams = {}) {
    const { page = 1, limit = 10, status } = queryParams;
    const filter = { buyerId };
    if (status) filter.status = status;
    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("sellerId", "fullName email phoneNumber")
        .populate("products.productId", "name price avatar images")
        .populate("shippingAddress")
        .lean(),
      Order.countDocuments(filter),
    ]);
    return { orders, total, page: Number(page), totalPages: Math.ceil(total / limit) };
  },

  async getOrdersBySeller(sellerId, queryParams = {}) {
    const { page = 1, limit = 10, status } = queryParams;
    const filter = { sellerId };
    if (status) filter.status = status;
    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("buyerId", "fullName email phoneNumber")
        .populate("products.productId", "name price avatar images")
        .populate("shippingAddress")
        .lean(),
      Order.countDocuments(filter),
    ]);
    return { orders, total, page: Number(page), totalPages: Math.ceil(total / limit) };
  },

  async getAdminOrders(queryParams = {}) {
    const { page = 1, limit = 20, status, search } = queryParams;
    const filter = {};
    if (status && status !== "all") filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("buyerId",  "fullName email phoneNumber")
        .populate("sellerId", "fullName email phoneNumber")
        .populate({
          path: "products.productId",
          select: "name price avatar images",
          populate: [
            { path: "categoryId",    select: "name" },
            { path: "subcategoryId", select: "name" },
          ],
        })
        .populate("shippingAddress")
        .lean(),
      Order.countDocuments(filter),
    ]);

    // Join seller business info
    const sellerIds = [...new Set(
      orders.filter((o) => o.sellerId?._id).map((o) => String(o.sellerId._id)),
    )];
    const sellers = await Seller.find({ accountId: { $in: sellerIds } }).lean();
    const sellerMap = new Map(sellers.map((s) => [String(s.accountId), s]));

    const enriched = orders.map((o) => {
      const sellerData = o.sellerId?._id
        ? sellerMap.get(String(o.sellerId._id))
        : null;
      return {
        ...o,
        sellerId: {
          ...(o.sellerId || {}),
          seller: sellerData
            ? {
                _id:                sellerData._id,
                businessAddress:    sellerData.businessAddress,
                verificationStatus: sellerData.verificationStatus,
              }
            : null,
        },
      };
    });

    // Client-side text search (for small result sets from DB; use Atlas Search for scale)
    const result = search
      ? enriched.filter((o) => {
          const q = search.toLowerCase();
          return (
            o._id.toString().includes(q) ||
            o.buyerId?.fullName?.toLowerCase().includes(q) ||
            o.buyerId?.email?.toLowerCase().includes(q) ||
            o.sellerId?.fullName?.toLowerCase().includes(q) ||
            o.ghnOrderCode?.toLowerCase().includes(q)
          );
        })
      : enriched;

    // Attach refund bank info for orders that are in returned/refunded state
    const returnedOrderIds = result
      .filter((o) => ["returned", "refunded"].includes(o.status))
      .map((o) => o._id);

    let refundBankInfoMap = new Map();
    if (returnedOrderIds.length > 0) {
      const bankInfoDocs = await BankInfo.find({
        orderId: { $in: returnedOrderIds },
        type: "refund_account",
      }).lean();
      bankInfoDocs.forEach((b) => {
        refundBankInfoMap.set(String(b.orderId), b);
      });
    }

    const withBankInfo = result.map((o) => ({
      ...o,
      refundBankInfo: refundBankInfoMap.get(String(o._id)) ?? null,
    }));

    return { orders: withBankInfo, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) };
  },
};

module.exports = OrderService;
module.exports.resolveFromAddress = resolveFromAddress;
