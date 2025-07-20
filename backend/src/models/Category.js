const mongoose = require("mongoose");
const SubCategory = require("./SubCategory");
const Schema = mongoose.Schema;

const CategorySchema = new Schema(
  {
    name: { type: String, required: true },
    subcategories: [
      {
        type: Schema.Types.ObjectId,
        ref: "SubCategory",
      },
    ],
  },
  { timestamps: true }
);

CategorySchema.index({ name: "text" });

module.exports = mongoose.model("Category", CategorySchema, "categories");
