const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const CoinSchema = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      unique: true,
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
    },
    lastCheckIn: {
      type: Date,
    },
  },
  { timestamps: true, collection: "coins" }
);

module.exports = mongoose.model("Coin", CoinSchema);