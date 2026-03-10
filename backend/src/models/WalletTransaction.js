"use strict";
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * WalletTransaction — immutable ledger entry.
 *
 * type:
 *   COD_INCOME        — GHN remits COD to platform; seller pending++ 
 *   BANK_TRANSFER_INCOME — admin confirms bank transfer; seller pending++
 *   PAYOUT_RELEASE    — platform releases pending → balance after completion
 *   PAYOUT            — seller withdraws balance
 *   PLATFORM_FEE      — platform commission deducted on payout release
 *   REFUND_DEDUCTION  — seller balance reduced on refund approval
 */
const TRANSACTION_TYPES = [
  "COD_INCOME",
  "BANK_TRANSFER_INCOME",
  "PAYOUT_RELEASE",
  "PAYOUT",
  "PLATFORM_FEE",
  "REFUND_DEDUCTION",
];

const WalletTransactionSchema = new Schema(
  {
    sellerId:     { type: Schema.Types.ObjectId, ref: "Account",       required: true },
    orderId:      { type: Schema.Types.ObjectId, ref: "Order",         default: null },
    refundId:     { type: Schema.Types.ObjectId, ref: "Refund",        default: null },
    type:         { type: String, enum: TRANSACTION_TYPES,             required: true },
    amount:       { type: Number, required: true },   // always positive
    balanceAfter: { type: Number, required: true },   // wallet.balance snapshot
    note:         { type: String, default: "" },
  },
  { timestamps: true, collection: "wallet_transactions" },
);

WalletTransactionSchema.index({ sellerId: 1, createdAt: -1 });
WalletTransactionSchema.index({ orderId: 1 });

module.exports = mongoose.model("WalletTransaction", WalletTransactionSchema);
