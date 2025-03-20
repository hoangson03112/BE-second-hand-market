const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const SubCategorySchema = new Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true },
});

const CategorySchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    image: { type: String, required: true },
    subcategories: [SubCategorySchema],
  },
  { timestamps: true, collection: "categories" }
);

module.exports = mongoose.model("Category", CategorySchema);
