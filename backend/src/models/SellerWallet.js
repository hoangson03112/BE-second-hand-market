"use strict";
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * SellerWallet — one document per seller.
 *
 * balance        : funds available for payout (released after order completion)
 * pendingBalance : funds collected by GHN (COD) or confirmed by admin
 *                  (bank_transfer) but not yet released
 * totalEarnings  : lifetime gross earnings credited to this wallet
 * totalWithdrawn : lifetime total paid out
 */
const SellerWalletSchema = new Schema(
  {
    sellerId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      unique: true,
    },
    balance:        { type: Number, default: 0, min: 0 },
    pendingBalance: { type: Number, default: 0, min: 0 },
    totalEarnings:  { type: Number, default: 0 },
    totalWithdrawn: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "seller_wallets" },
);

// Note: sellerId already has a unique index from the field definition above.

module.exports = mongoose.model("SellerWallet", SellerWalletSchema);
