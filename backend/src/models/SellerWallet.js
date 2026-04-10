"use strict";
const mongoose = require("mongoose");
const Schema = mongoose.Schema;


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


module.exports = mongoose.model("SellerWallet", SellerWalletSchema);
