const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// File schema để lưu thông tin chi tiết của file từ Cloudinary
const FileSchema = new Schema({
  url: { 
    type: String, 
    required: true 
  },           // URL từ Cloudinary
  publicId: { 
    type: String, 
    required: true 
  },     // Public ID để xóa file
  originalName: { 
    type: String 
  },                 // Tên file gốc
  type: { 
    type: String 
  },                         // MIME type
  size: { 
    type: Number 
  },                         // Kích thước file (bytes)
  uploadedAt: { 
    type: Date, 
    default: Date.now 
  },  // Thời gian upload
}, { 
  _id: false 
});

module.exports = FileSchema;