"use strict";

const mongoose = require("mongoose");
const Order = require("../models/Order");
const Refund = require("../models/Refund");
const Product = require("../models/Product");
const Address = require("../models/Address");
const Seller = require("../models/Seller");
const Account = require("../models/Account");
const BankInfo = require("../models/BankInfo");
const PersonalDiscount = require("../models/PersonalDiscount");
const ghnService = require("./ghn.service");
const {
  validateOrderStatusTransition,
  getStatusTimestampField,
} = require("../utils/orderStateMachine");

const PLATFORM_FEE_RATE = 0;

const REFUND_DETAIL_FIELDS_FOR_LIST =
  "status reason description refundAmount refundMethod createdAt updatedAt sellerResponse adminIntervention evidence escalatedToAdmin escalatedAt refundedAt";

const refundListPopulate = {
  path: "refundRequestId",
  select: REFUND_DETAIL_FIELDS_FOR_LIST,
};

/** Refund doc statuses that need buyer bank info on list/detail */
const REFUND_BANKINFO_STATUSES = new Set([
  "return_shipping",
  "returning",
  "returned",
  "bank_info_required",
  "processing",
  "failed",
  "completed",
]);

const GHN_SYNC_STATUSES = ["confirmed", "picked_up", "shipping", "out_for_delivery", "delivered"];

// ─── small utils ─────────────────────────────────────────────────────────────

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function uniqueObjectIds(ids) {
  return [...new Map(ids.map((id) => [String(id), id])).values()];
}

function isRefundRelatedOrderStatus(status) {
  return (
    status === "refund" ||
    status === "refunded" ||
    (typeof status === "string" && status.startsWith("refund"))
  );
}

function isRefundDocPopulated(ref) {
  return !!(ref && typeof ref === "object" && "status" in ref && "reason" in ref);
}

function isGhnShipping(method) {
  return typeof method === "string" && method.toLowerCase().includes("ghn");
}

function normalizeObjectIdInput(value) {
  if (value == null || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return mongoose.Types.ObjectId.isValid(trimmed) ? trimmed : null;
}

function sumLineTotals(lines) {
  return lines.reduce((sum, p) => sum + p.price * p.quantity, 0);
}

// ─── refund / bank enrich (lists) ────────────────────────────────────────────

async function enrichOrdersWithRefundDetails(orders) {
  if (!Array.isArray(orders) || orders.length === 0) return;
  const needs = orders.filter(
    (o) =>
      o &&
      isRefundRelatedOrderStatus(o.status) &&
      !isRefundDocPopulated(o.refundRequestId),
  );
  if (needs.length === 0) return;
  const orderIds = needs.map((o) => o._id);
  const refunds = await Refund.find({ orderId: { $in: orderIds } })
    .select(REFUND_DETAIL_FIELDS_FOR_LIST)
    .sort({ createdAt: -1 })
    .lean();
  const firstByOrder = new Map();
  for (const r of refunds) {
    const k = String(r.orderId);
    if (!firstByOrder.has(k)) firstByOrder.set(k, r);
  }
  for (const o of needs) {
    const doc = firstByOrder.get(String(o._id));
    if (doc) o.refundRequestId = doc;
  }
}

async function attachRefundBankInfoToOrders(orders) {
  if (!Array.isArray(orders) || orders.length === 0) return;
  const need = orders.filter(
    (o) =>
      o &&
      (isRefundRelatedOrderStatus(o.status) ||
        (isRefundDocPopulated(o.refundRequestId) &&
          REFUND_BANKINFO_STATUSES.has(o.refundRequestId.status))),
  );
  if (need.length === 0) return;
  const orderIds = need.map((o) => o._id);
  const bankDocs = await BankInfo.find({
    orderId: { $in: orderIds },
    type: "refund_account",
  }).lean();
  const map = new Map(bankDocs.map((b) => [String(b.orderId), b]));
  for (const o of need) {
    o.refundBankInfo = map.get(String(o._id)) ?? null;
  }
}

async function attachRefundBankInfoToSingleOrder(order) {
  if (!order || !order._id) return;
  if (
    !isRefundRelatedOrderStatus(order.status) &&
    !isRefundDocPopulated(order.refundRequestId)
  ) {
    return;
  }
  const b = await BankInfo.findOne({
    orderId: order._id,
    type: "refund_account",
  }).lean();
  order.refundBankInfo = b ?? null;
}

// ─── address / GHN pickup resolution ────────────────────────────────────────

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
      from_ward_code: seller.from_ward_code,
      businessAddress: seller.businessAddress,
      from_name: seller.accountId?.fullName,
      from_phone: seller.accountId?.phoneNumber,
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
      from_ward_code: pickupAddr.wardCode,
      from_address: pickupAddr.specificAddress || "",
      businessAddress: pickupAddr.specificAddress || "",
      from_name: pickupAddr.fullName || sellerAccount?.fullName,
      from_phone: pickupAddr.phoneNumber || sellerAccount?.phoneNumber,
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
      from_ward_code: productAddr.wardCode,
      from_address: productAddr.specificAddress || "",
      businessAddress: productAddr.specificAddress || "",
      from_name: productAddr.fullName || sellerAccount?.fullName,
      from_phone: productAddr.phoneNumber || sellerAccount?.phoneNumber,
    };
  }

  return null;
}

// ─── createOrder helpers ─────────────────────────────────────────────────────

async function assertGhnDeliveryAddress(buyerId, normalizedShippingAddress) {
  if (!normalizedShippingAddress) {
    throw httpError("Vui lòng chọn địa chỉ giao hàng");
  }
  const address = await Address.findOne({
    _id: normalizedShippingAddress,
    accountId: buyerId,
  })
    .select("_id")
    .lean();
  if (!address) {
    throw httpError("Địa chỉ giao hàng không tồn tại hoặc không thuộc tài khoản");
  }
}

async function assertBankTransferSeller(sellerId) {
  const sellerAccount = await Account.findById(sellerId).select("role").lean();
  if (sellerAccount && sellerAccount.role !== "seller") {
    throw httpError("Seller chưa xác minh. Chỉ hỗ trợ COD.");
  }
}

/**
 * Đọc sản phẩm, kiểm tra tồn & delivery, áp giá discount → dòng đơn + id ưu đãi.
 * (Trừ kho và mark discount nằm trong transaction sau.)
 */
async function buildOrderLines({ products, buyerId, sellerId, shippingMethod }) {
  const productsWithPrice = [];
  const usedDiscountIds = [];

  for (const item of products) {
    const productData = await Product.findById(item.productId);
    if (!productData) {
      throw httpError(`Sản phẩm ${item.productId} không tồn tại`, 404);
    }
    if (productData.stock < item.quantity) {
      throw httpError(
        `Sản phẩm "${productData.name}" không đủ số lượng (còn ${productData.stock})`,
      );
    }

    const opts = productData.deliveryOptions || {};
    if (opts.codShipping === false && isGhnShipping(shippingMethod)) {
      throw httpError(
        `Sản phẩm "${productData.name}" chỉ hỗ trợ giao dịch trực tiếp, không hỗ trợ vận chuyển`,
      );
    }
    if (opts.localPickup === false && shippingMethod === "local_pickup") {
      throw httpError(`Sản phẩm "${productData.name}" không hỗ trợ giao dịch trực tiếp`);
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
      quantity: item.quantity,
      price: finalPrice,
    });
  }

  return { productsWithPrice, usedDiscountIds };
}

async function persistNewOrderTransaction({
  products,
  orderDoc,
  uniqueDiscountIds,
}) {
  const session = await mongoose.startSession();
  let order;
  try {
    await session.withTransaction(async () => {
      for (const item of products) {
        const updated = await Product.findOneAndUpdate(
          { _id: item.productId, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
          { session, new: true },
        );
        if (!updated) {
          const p = await Product.findById(item.productId)
            .session(session)
            .select("name stock")
            .lean();
          throw httpError(
            p
              ? `Sản phẩm "${p.name}" không đủ số lượng (còn ${p.stock ?? 0})`
              : "Sản phẩm không đủ số lượng",
          );
        }
      }

      if (uniqueDiscountIds.length > 0) {
        const discRes = await PersonalDiscount.updateMany(
          { _id: { $in: uniqueDiscountIds }, isUse: false },
          { $set: { isUse: true } },
          { session },
        );
        if (discRes.modifiedCount !== uniqueDiscountIds.length) {
          throw httpError(
            "Ưu đãi cá nhân không còn khả dụng hoặc đã được sử dụng. Vui lòng làm mới giỏ hàng.",
            409,
          );
        }
      }

      const created = await Order.create([orderDoc], { session });
      order = created[0];
    });
  } finally {
    await session.endSession();
  }
  return order;
}

/** Danh sách đơn (buyer / seller): cùng pipeline enrich refund + bank */
async function fetchOrderPageForRole({ filter, page, limit, counterpartyPopulate }) {
  const p = Number(page);
  const l = Number(limit);
  const skip = (p - 1) * l;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(l)
      .populate(counterpartyPopulate)
      .populate("products.productId", "name price avatar images")
      .populate("shippingAddress")
      .populate(refundListPopulate)
      .lean(),
    Order.countDocuments(filter),
  ]);

  await enrichOrdersWithRefundDetails(orders);
  await attachRefundBankInfoToOrders(orders);

  return {
    orders,
    total,
    page: p,
    totalPages: Math.ceil(total / l),
  };
}

// ─── OrderService ─────────────────────────────────────────────────────────────

const OrderService = {
  async createOrder({
    buyerId,
    sellerId,
    products,
    shippingAddress,
    shippingMethod,
    paymentMethod,
    shippingFee: bodyShippingFee,
    totalShippingFee,
    expectedDeliveryTime,
  }) {
    const normalizedShippingAddress = normalizeObjectIdInput(shippingAddress);
    if (
      shippingAddress != null &&
      typeof shippingAddress === "string" &&
      shippingAddress.trim() !== "" &&
      !normalizedShippingAddress
    ) {
      throw httpError("Địa chỉ giao hàng không hợp lệ");
    }

    if (isGhnShipping(shippingMethod)) {
      await assertGhnDeliveryAddress(buyerId, normalizedShippingAddress);
    }

    if (paymentMethod === "bank_transfer") {
      await assertBankTransferSeller(sellerId);
    }

    const { productsWithPrice, usedDiscountIds } = await buildOrderLines({
      products,
      buyerId,
      sellerId,
      shippingMethod,
    });

    const shippingFee = Number(bodyShippingFee ?? totalShippingFee ?? 0) || 0;
    const productAmount = sumLineTotals(productsWithPrice);
    const totalAmountServer = productAmount + shippingFee;
    const platformFee = Math.round(productAmount * PLATFORM_FEE_RATE);

    const orderDoc = {
      buyerId,
      sellerId,
      products: productsWithPrice,
      productAmount,
      shippingFee,
      platformFee,
      totalAmount: totalAmountServer,
      shippingAddress: normalizedShippingAddress || undefined,
      shippingMethod,
      paymentMethod,
      expectedDeliveryTime: expectedDeliveryTime ? new Date(expectedDeliveryTime) : undefined,
      statusHistory: [{ status: "pending", updatedAt: new Date() }],
    };

    const uniqueDiscountIds = uniqueObjectIds(usedDiscountIds);

    return persistNewOrderTransaction({
      products,
      orderDoc,
      uniqueDiscountIds,
    });
  },

  async updateOrderStatus(orderId, newStatus, { reason, actorId } = {}) {
    const order = await Order.findById(orderId);
    if (!order) throw httpError("Đơn hàng không tồn tại", 404);

    validateOrderStatusTransition(order.status, newStatus);

    const now = new Date();
    const updateSet = { status: newStatus };
    const tsField = getStatusTimestampField(newStatus);
    if (tsField) updateSet[tsField] = now;
    if (reason && newStatus === "cancelled") updateSet.cancelReason = reason;

    if (newStatus === "confirmed") {
      await this._createGHNOrder(order, updateSet);
      const isBankTransfer = String(order.paymentMethod || "").toLowerCase() === "bank_transfer";
      if (isBankTransfer && order.paymentStatus !== "paid" && order.paymentStatus !== "refunded") {
        updateSet.paymentStatus = "paid";
      }
    } else if (newStatus === "completed") {
      await this._markCompleted(order, updateSet);
    } else if (newStatus === "cancelled") {
      await this._cancelOrder(order, updateSet);
    } else if (newStatus === "returned") {
      await this._restoreStock(order);
    } else if (newStatus === "delivered") {
      const isLocal = String(order.shippingMethod || "").toLowerCase() === "local_pickup";
      if (!isLocal) {
        updateSet.returnWindowExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      } else {
        updateSet.returnWindowExpiresAt = null;
      }
      if (order.paymentStatus !== "paid" && order.paymentStatus !== "refunded") {
        const isCod = String(order.paymentMethod || "").toLowerCase() === "cod";
        if (isCod || isLocal) {
          updateSet.paymentStatus = "paid";
        }
      }
    }

    if (isGhnShipping(order.shippingMethod) && GHN_SYNC_STATUSES.includes(newStatus)) {
      updateSet.ghnStatus = newStatus;
    }

    return Order.findByIdAndUpdate(
      orderId,
      {
        $set: updateSet,
        $push: { statusHistory: { status: newStatus, updatedAt: now } },
      },
      { new: true },
    );
  },

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

      const codAmount =
        order.paymentMethod === "cod" ? Math.max(0, order.productAmount) : 0;

      const ghnData = await ghnService.createShippingOrder({
        orderId: String(order._id),
        fromAddress,
        toAddress: address,
        codAmount,
        weight: 500,
        paymentMethod: order.paymentMethod,
      });

      Object.assign(updateSet, ghnData);
    } catch (err) {
      console.error(`[OrderService] GHN creation failed for order ${order._id}:`, err.message);
    }
  },

  async _markCompleted(order, updateSet) {
    updateSet.paymentStatus = "paid";
    updateSet.buyerConfirmedAt = new Date();
    updateSet.payoutStatus = "pending";
    updateSet.payoutAt = null;

    for (const item of order.products) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { soldCount: item.quantity },
      });
    }
  },

  async _cancelOrder(order, updateSet) {
    if (order.ghnOrderCode && isGhnShipping(order.shippingMethod)) {
      try {
        const result = await ghnService.cancelShippingOrder(order.ghnOrderCode);
        if (result.success) updateSet.ghnStatus = "cancelled";
      } catch (err) {
        console.error(`[OrderService] GHN cancel failed for ${order.ghnOrderCode}:`, err.message);
      }
    }
    await this._restoreStock(order);
  },

  async _restoreStock(order) {
    for (const item of order.products) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { stock: item.quantity },
      });
    }
  },

  async getOrderById(orderId) {
    const order = await Order.findById(orderId)
      .populate("products.productId", "name price images avatar condition stock")
      .populate("shippingAddress")
      .populate("sellerId", "fullName email phoneNumber avatar")
      .populate("buyerId", "fullName email phoneNumber avatar")
      .populate("refundRequestId")
      .lean();

    if (
      order &&
      !order.refundRequestId &&
      order.status &&
      order.status.startsWith("refund")
    ) {
      const refundDoc = await Refund.findOne({ orderId: order._id })
        .sort({ createdAt: -1 })
        .lean();
      if (refundDoc) {
        order.refundRequestId = refundDoc;
        await Order.findByIdAndUpdate(order._id, { $set: { refundRequestId: refundDoc._id } });
      }
    }

    await attachRefundBankInfoToSingleOrder(order);
    return order;
  },

  async getOrdersByBuyer(buyerId, queryParams = {}) {
    const { page = 1, limit = 10, status } = queryParams;
    const filter = { buyerId };
    if (status) filter.status = status;
    return fetchOrderPageForRole({
      filter,
      page,
      limit,
      counterpartyPopulate: { path: "sellerId", select: "fullName email phoneNumber avatar" },
    });
  },

  async getOrdersBySeller(sellerId, queryParams = {}) {
    const { page = 1, limit = 10, status } = queryParams;
    const filter = { sellerId };
    if (status) filter.status = status;
    return fetchOrderPageForRole({
      filter,
      page,
      limit,
      counterpartyPopulate: { path: "buyerId", select: "fullName email phoneNumber avatar" },
    });
  },

  async getAdminOrders(queryParams = {}) {
    const { page = 1, limit = 20, status, search, paymentMethod, payoutStatus, startDate, endDate } =
      queryParams;
    const filter = {};
    if (status && status !== "all") filter.status = status;
    if (paymentMethod && paymentMethod !== "all") filter.paymentMethod = paymentMethod;
    if (payoutStatus && payoutStatus !== "all") filter.payoutStatus = payoutStatus;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("buyerId", "fullName email phoneNumber avatar")
        .populate("sellerId", "fullName email phoneNumber avatar")
        .populate({
          path: "products.productId",
          select: "name price avatar images",
          populate: [
            { path: "categoryId", select: "name" },
            { path: "subcategoryId", select: "name" },
          ],
        })
        .populate("shippingAddress")
        .populate(refundListPopulate)
        .lean(),
      Order.countDocuments(filter),
    ]);

    await enrichOrdersWithRefundDetails(orders);

    const sellerIds = [
      ...new Set(orders.filter((o) => o.sellerId?._id).map((o) => String(o.sellerId._id))),
    ];
    const sellers = await Seller.find({ accountId: { $in: sellerIds } }).lean();
    const sellerMap = new Map(sellers.map((s) => [String(s.accountId), s]));

    const enriched = orders.map((o) => {
      const sellerData = o.sellerId?._id ? sellerMap.get(String(o.sellerId._id)) : null;
      return {
        ...o,
        sellerId: {
          ...(o.sellerId || {}),
          seller: sellerData
            ? {
                _id: sellerData._id,
                businessAddress: sellerData.businessAddress,
                verificationStatus: sellerData.verificationStatus,
              }
            : null,
        },
      };
    });

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

    await attachRefundBankInfoToOrders(result);

    return {
      orders: result,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
    };
  },
};

module.exports = OrderService;
module.exports.resolveFromAddress = resolveFromAddress;
module.exports.isGhnShipping = isGhnShipping;
