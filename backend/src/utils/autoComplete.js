"use strict";

/**
 * autoComplete.js
 *
 * Background job that automatically completes orders that have been in
 * "delivered" status for more than 24 hours without buyer confirmation.
 *
 * Runs once on startup, then every hour.
 */

const Order         = require("../models/Order");
const Product       = require("../models/Product");
const PayoutService = require("../services/payout.service");
const { getStatusTimestampField } = require("./orderStateMachine");

const DELIVERED_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours
const POLL_INTERVAL_MS     = 60 * 60 * 1000;       // 1 hour

async function autoCompleteDeliveredOrders() {
  const cutoff = new Date(Date.now() - DELIVERED_TIMEOUT_MS);

  let orders;
  try {
    orders = await Order.find({
      status:      "delivered",
      deliveredAt: { $lt: cutoff },
    }).lean();
  } catch (err) {
    console.error("[autoComplete] DB query failed:", err.message);
    return;
  }

  if (!orders.length) return;

  console.log(`[autoComplete] Processing ${orders.length} overdue delivered order(s)…`);

  for (const order of orders) {
    try {
      const now     = new Date();
      const tsField = getStatusTimestampField("completed");

      await Order.findByIdAndUpdate(order._id, {
        $set:  {
          status:    "completed",
          [tsField]: now,
        },
        $push: { statusHistory: { status: "completed", updatedAt: now } },
      });

      // Increment soldCount for each product in the order
      for (const item of order.products) {
        await Product.findByIdAndUpdate(item.productId, {
          $inc: { soldCount: item.quantity },
        });
      }

      await PayoutService.releasePayout(String(order._id));

      console.log(`[autoComplete] Order ${order._id} auto-completed & payout released.`);
    } catch (err) {
      console.error(`[autoComplete] Failed for order ${order._id}:`, err.message);
    }
  }
}

function startAutoCompleteJob() {
  // Run once immediately after DB is ready, then on schedule
  autoCompleteDeliveredOrders().catch((e) =>
    console.error("[autoComplete] Initial run failed:", e.message),
  );
  setInterval(() => {
    autoCompleteDeliveredOrders().catch((e) =>
      console.error("[autoComplete] Scheduled run failed:", e.message),
    );
  }, POLL_INTERVAL_MS);
}

module.exports = { startAutoCompleteJob, autoCompleteDeliveredOrders };
