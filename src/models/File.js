const mongoose = require("mongoose");
const Schema = mongoose.Schema;


const FileSchema = new Schema({
  url: {
    type: String,
    required: true
  },
  publicId: {
    type: String,
    required: true
  },
  originalName: {
    type: String
  },
  type: {
    type: String
  },
  size: {
    type: Number
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
}, {
  _id: false
});

module.exports = FileSchema;