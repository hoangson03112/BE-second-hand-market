const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const SubCategorySchema = new Schema({
  name: { type: String, required: true },
  status: { type: String, required: true },
});

module.exports = mongoose.model("SubCategory", SubCategorySchema);
