const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const MediaSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["image", "video", "audio", "document"],
  },
  url: {
    type: String,
    required: true,
  },
  publicId: {
    type: String,
  },
  name: {
    type: String,
  },
  size: {
    type: Number,
  },
  thumbnail: {
    type: String, // For video/image preview
  },
  duration: {
    type: Number, // For video/audio (in seconds)
  },
  width: {
    type: Number,
  },
  height: {
    type: Number,
  },
});

const ReactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Account",
    required: true,
  },
  emoji: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const messageSchema = new Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["text", "image", "video", "product", "order", "system"],
      default: "text",
    },
    text: {
      type: String,
      default: null,
      maxlength: 5000,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
    },
    media: [MediaSchema],
    
    // Read & Delivery Status
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
    },
    deliveredAt: {
      type: Date,
    },
    
    // Soft Delete
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
    },
    
    // Edit Support
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
    },
    
    // Reply/Thread Support
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    
    // Reactions
    reactions: [ReactionSchema],
    
    // Metadata for flexible features
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { 
    collection: "messages", 
    timestamps: true,
  }
);

// Compound indexes for faster queries
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, isRead: 1 }); // For unread count
messageSchema.index({ conversationId: 1, type: 1 }); // For filtering by type
messageSchema.index({ conversationId: 1, isDeleted: 1, createdAt: -1 }); // For active messages

// Pre-save validation
messageSchema.pre("save", function (next) {
  // Skip validation if deleted
  if (this.isDeleted) {
    return next();
  }

  // Text required for text type
  if (this.type === "text" && !this.text) {
    return next(new Error("Text is required for text message"));
  }
  
  // ProductId required for product type
  if (this.type === "product" && !this.productId) {
    return next(new Error("ProductId is required for product message"));
  }
  
  // OrderId required for order type
  if (this.type === "order" && !this.orderId) {
    return next(new Error("OrderId is required for order message"));
  }
  
  // Media required for image/video type
  if (
    (this.type === "image" || this.type === "video") &&
    (!this.media || this.media.length === 0)
  ) {
    return next(
      new Error("Media is required for image/video message")
    );
  }
  
  next();
});

// Instance Methods

// Mark message as read
messageSchema.methods.markAsRead = async function () {
  if (!this.isRead) {
    this.isRead = true;
    this.readAt = new Date();
    await this.save();
  }
  return this;
};

// Mark message as delivered
messageSchema.methods.markAsDelivered = async function () {
  if (!this.deliveredAt) {
    this.deliveredAt = new Date();
    await this.save();
  }
  return this;
};

// Soft delete message
messageSchema.methods.softDelete = async function (userId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  await this.save();
  return this;
};

// Add reaction
messageSchema.methods.addReaction = async function (userId, emoji) {
  // Remove existing reaction from this user
  this.reactions = this.reactions.filter(
    (r) => r.userId.toString() !== userId.toString()
  );
  
  // Add new reaction
  this.reactions.push({ userId, emoji });
  await this.save();
  return this;
};

// Remove reaction
messageSchema.methods.removeReaction = async function (userId) {
  this.reactions = this.reactions.filter(
    (r) => r.userId.toString() !== userId.toString()
  );
  await this.save();
  return this;
};

// Edit message
messageSchema.methods.editText = async function (newText) {
  if (this.type !== "text") {
    throw new Error("Only text messages can be edited");
  }
  
  this.text = newText;
  this.isEdited = true;
  this.editedAt = new Date();
  await this.save();
  return this;
};

// Static Methods

// Get unread count for a conversation
messageSchema.statics.getUnreadCount = function (conversationId, userId) {
  return this.countDocuments({
    conversationId,
    senderId: { $ne: userId },
    isRead: false,
    isDeleted: false,
  });
};

// Get conversation messages with pagination
messageSchema.statics.getConversationMessages = function ({
  conversationId,
  page = 1,
  limit = 50,
  before = null,
}) {
  const query = {
    conversationId,
    isDeleted: false,
  };
  
  if (before) {
    query.createdAt = { $lt: before };
  }
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip((page - 1) * limit)
    .populate("senderId", "fullName avatar")
    .populate("productId", "name price images")
    .populate("orderId", "orderCode totalAmount")
    .populate({
      path: "replyTo",
      select: "text senderId type",
      populate: { path: "senderId", select: "fullName" },
    });
};

// Mark all messages as read
messageSchema.statics.markAllAsRead = function (conversationId, userId) {
  return this.updateMany(
    {
      conversationId,
      senderId: { $ne: userId },
      isRead: false,
      isDeleted: false,
    },
    {
      $set: {
        isRead: true,
        readAt: new Date(),
      },
    }
  );
};

// Virtual for checking if message belongs to user
messageSchema.virtual("isMine").get(function () {
  return this.senderId && this._currentUserId 
    ? this.senderId.toString() === this._currentUserId.toString()
    : false;
});

// Ensure virtuals are included in JSON
messageSchema.set("toJSON", { virtuals: true });
messageSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Message", messageSchema);
