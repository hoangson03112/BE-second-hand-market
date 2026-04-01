const mongoose = require("mongoose");

const SearchQueryLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      index: true,
    },
    queryRaw: { type: String, required: true, trim: true },
    queryNormalized: { type: String, required: true, trim: true },
    filters: {
      minPrice: { type: Number, default: null },
      maxPrice: { type: Number, default: null },
      condition: { type: String, default: null },
    },
    resultProductIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    clickedProductId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
    clickedRank: { type: Number, default: null },
    clickedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

SearchQueryLogSchema.index({ createdAt: -1 });
SearchQueryLogSchema.index({ userId: 1, createdAt: -1 });
SearchQueryLogSchema.index({ queryNormalized: 1, createdAt: -1 });

module.exports = mongoose.model("SearchQueryLog", SearchQueryLogSchema);

