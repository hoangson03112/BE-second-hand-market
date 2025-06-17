const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const SellerSchema = new Schema(
  {
    accountId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Account", 
      required: true,
      unique: true // Một account chỉ có một seller profile
    },
    // Thông tin địa chỉ
    businessAddress: { type: String, required: true },
    province: { type: String, required: true },
    district: { type: String, required: true },
    ward: { type: String, required: true },
    
    // File uploads - URLs sau khi upload
    avatar: { type: String },
    idCardFront: { type: String, required: true },
    idCardBack: { type: String, required: true },
    
    // Thông tin ngân hàng
    bankInfo: {
      bankName: { type: String, required: true },
      accountNumber: { type: String, required: true },
      accountHolder: { type: String, required: true }
    },
    
    // Trạng thái duyệt
    verificationStatus: { 
      type: String, 
      enum: ["pending", "approved", "rejected"], 
      default: "pending" 
    },
    
    // Điều khoản
    agreeTerms: { type: Boolean, required: true },
    agreePolicy: { type: Boolean, required: true },
    
    // Thông tin duyệt
    approvedDate: { type: Date },
    rejectedReason: { type: String },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Account" }
  },
  { 
    timestamps: true, 
    collection: "sellers" 
  }
);

// Index để tìm kiếm nhanh
SellerSchema.index({ accountId: 1 });
SellerSchema.index({ verificationStatus: 1 });
SellerSchema.index({ 'bankInfo.accountNumber': 1 });

// Prevent OverwriteModelError
module.exports = mongoose.models.Seller || mongoose.model("Seller", SellerSchema);
