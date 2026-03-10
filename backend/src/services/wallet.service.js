"use strict";

const mongoose = require("mongoose");
const SellerWallet = require("../models/SellerWallet");
const WalletTransaction = require("../models/WalletTransaction");

/**
 * WalletService
 *
 * All mutations use MongoDB sessions for atomicity.
 * Every financial change produces a WalletTransaction ledger record.
 */
const WalletService = {
  /**
   * Ensure a SellerWallet document exists for the given seller.
   * Idempotent — safe to call multiple times.
   */
  async ensureWallet(sellerId, session) {
    const opts = session ? { session } : {};
    let wallet = await SellerWallet.findOne({ sellerId }, null, opts);
    if (!wallet) {
      [wallet] = await SellerWallet.create([{ sellerId }], opts);
    }
    return wallet;
  },

  /**
   * Credit seller pendingBalance when COD is collected by GHN.
   */
  async recordCODIncome({ sellerId, orderId, amount }, session) {
    const opts = { session, new: true };
    const wallet = await SellerWallet.findOneAndUpdate(
      { sellerId },
      {
        $inc: { pendingBalance: amount, totalEarnings: amount },
      },
      opts,
    );
    if (!wallet) throw new Error(`Wallet not found for seller ${sellerId}`);

    await WalletTransaction.create(
      [
        {
          sellerId,
          orderId,
          type: "COD_INCOME",
          amount,
          balanceAfter: wallet.balance,
          note: `COD income for order ${orderId}`,
        },
      ],
      { session },
    );
    return wallet;
  },

  /**
   * Credit seller pendingBalance when admin confirms bank transfer payment.
   */
  async recordBankTransferIncome({ sellerId, orderId, amount }, session) {
    const opts = { session, new: true };
    const wallet = await SellerWallet.findOneAndUpdate(
      { sellerId },
      { $inc: { pendingBalance: amount, totalEarnings: amount } },
      opts,
    );
    if (!wallet) throw new Error(`Wallet not found for seller ${sellerId}`);

    await WalletTransaction.create(
      [
        {
          sellerId,
          orderId,
          type: "BANK_TRANSFER_INCOME",
          amount,
          balanceAfter: wallet.balance,
          note: `Bank transfer income for order ${orderId}`,
        },
      ],
      { session },
    );
    return wallet;
  },

  /**
   * Release pendingBalance → balance on order completion.
   * Also deducts platformFee from the amount credited to balance.
   */
  async releasePayout({ sellerId, orderId, grossAmount, platformFee }, session) {
    const netAmount = grossAmount - (platformFee || 0);
    const opts = { session, new: true };

    const wallet = await SellerWallet.findOneAndUpdate(
      { sellerId },
      {
        $inc: {
          pendingBalance: -grossAmount,
          balance: netAmount,
        },
      },
      opts,
    );
    if (!wallet) throw new Error(`Wallet not found for seller ${sellerId}`);

    const ledgerEntries = [
      {
        sellerId,
        orderId,
        type: "PAYOUT_RELEASE",
        amount: netAmount,
        balanceAfter: wallet.balance,
        note: `Payout released for order ${orderId}`,
      },
    ];

    if (platformFee > 0) {
      ledgerEntries.push({
        sellerId,
        orderId,
        type: "PLATFORM_FEE",
        amount: platformFee,
        balanceAfter: wallet.balance,
        note: `Platform fee for order ${orderId}`,
      });
    }

    await WalletTransaction.create(ledgerEntries, { session });
    return wallet;
  },

  /**
   * Deduct seller balance on refund approval (COD orders; for bank_transfer
   * the seller refunds the buyer directly, so deduction still records the event).
   */
  async deductForRefund({ sellerId, orderId, refundId, amount }, session) {
    const opts = { session, new: true };
    const wallet = await SellerWallet.findOneAndUpdate(
      { sellerId },
      { $inc: { balance: -amount, totalEarnings: -amount } },
      opts,
    );
    if (!wallet) throw new Error(`Wallet not found for seller ${sellerId}`);

    await WalletTransaction.create(
      [
        {
          sellerId,
          orderId,
          refundId,
          type: "REFUND_DEDUCTION",
          amount,
          balanceAfter: wallet.balance,
          note: `Refund deduction for order ${orderId}`,
        },
      ],
      { session },
    );
    return wallet;
  },

  /**
   * Record a seller withdrawal (seller requests payout to bank account).
   */
  async recordWithdrawal({ sellerId, amount, note }, session) {
    const opts = { session, new: true };
    const wallet = await SellerWallet.findOneAndUpdate(
      { sellerId },
      {
        $inc: { balance: -amount, totalWithdrawn: amount },
      },
      opts,
    );
    if (!wallet) throw new Error(`Wallet not found for seller ${sellerId}`);
    if (wallet.balance < 0) {
      throw new Error("Insufficient wallet balance for withdrawal");
    }

    await WalletTransaction.create(
      [
        {
          sellerId,
          type: "PAYOUT",
          amount,
          balanceAfter: wallet.balance,
          note: note || "Seller withdrawal",
        },
      ],
      { session },
    );
    return wallet;
  },

  async getWallet(sellerId) {
    return SellerWallet.findOne({ sellerId }).lean();
  },

  async getTransactions(sellerId, { page = 1, limit = 20, type } = {}) {
    const filter = { sellerId };
    if (type) filter.type = type;
    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([
      WalletTransaction.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      WalletTransaction.countDocuments(filter),
    ]);
    return { transactions, total, page, totalPages: Math.ceil(total / limit) };
  },
};

module.exports = WalletService;
