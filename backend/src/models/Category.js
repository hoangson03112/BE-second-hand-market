const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const slug = require("mongoose-slug-updater");
mongoose.plugin(slug, { separator: "-", lang: "en", truncate: 120 });

const SubCategorySchema = new Schema({
  name: { type: String, required: true },
  status: { type: String, required: true },
});

const CategorySchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, slug: "name", unique: true },
    image: { type: String, required: true },
    subcategories: [SubCategorySchema],
  },
  { timestamps: true, collection: "categories" }
);

module.exports = mongoose.model("Category", CategorySchema);
