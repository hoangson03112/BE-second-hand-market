const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const MediaSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["image", "video", "audio", "document"]
  },
  url: {
    type: String,
    required: true
  },
  publicId: {
    type: String
  },
  name: {
    type: String
  },
  size: {
    type: Number
  },
  thumbnail: {
    type: String
  },
  duration: {
    type: Number
  },
  width: {
    type: Number
  },
  height: {
    type: Number
  }
});

const ReactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Account",
    required: true
  },
  emoji: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const messageSchema = new Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true
    },
    type: {
      type: String,
      required: true,
      enum: ["text", "image", "video", "product", "order", "system"],
      default: "text"
    },
    text: {
      type: String,
      default: null,
      maxlength: 5000
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product"
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order"
    },
    media: [MediaSchema],


    isRead: {
      type: Boolean,
      default: false,
      index: true
    },
    readAt: {
      type: Date
    },
    deliveredAt: {
      type: Date
    },


    isDeleted: {
      type: Boolean,
      default: false
    },
    deletedAt: {
      type: Date
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account"
    },


    isEdited: {
      type: Boolean,
      default: false
    },
    editedAt: {
      type: Date
    },


    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message"
    },


    reactions: [ReactionSchema],


    metadata: {
      type: Schema.Types.Mixed,
      default: {}
    }
  },
  {
    collection: "messages",
    timestamps: true
  }
);


messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, isRead: 1 });
messageSchema.index({ conversationId: 1, type: 1 });
messageSchema.index({ conversationId: 1, isDeleted: 1, createdAt: -1 });


messageSchema.pre("save", function (next) {

  if (this.isDeleted) {
    return next();
  }


  if (this.type === "text" && !this.text) {
    return next(new Error("Text is required for text message"));
  }


  if (this.type === "product" && !this.productId) {
    return next(new Error("ProductId is required for product message"));
  }


  if (this.type === "order" && !this.orderId) {
    return next(new Error("OrderId is required for order message"));
  }


  if (
  (this.type === "image" || this.type === "video") && (
  !this.media || this.media.length === 0))
  {
    return next(
      new Error("Media is required for image/video message")
    );
  }

  next();
});




messageSchema.methods.markAsRead = async function () {
  if (!this.isRead) {
    this.isRead = true;
    this.readAt = new Date();
    await this.save();
  }
  return this;
};


messageSchema.methods.markAsDelivered = async function () {
  if (!this.deliveredAt) {
    this.deliveredAt = new Date();
    await this.save();
  }
  return this;
};


messageSchema.methods.softDelete = async function (userId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  await this.save();
  return this;
};


messageSchema.methods.addReaction = async function (userId, emoji) {

  this.reactions = this.reactions.filter(
    (r) => r.userId.toString() !== userId.toString()
  );


  this.reactions.push({ userId, emoji });
  await this.save();
  return this;
};


messageSchema.methods.removeReaction = async function (userId) {
  this.reactions = this.reactions.filter(
    (r) => r.userId.toString() !== userId.toString()
  );
  await this.save();
  return this;
};


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




messageSchema.statics.getUnreadCount = function (conversationId, userId) {
  return this.countDocuments({
    conversationId,
    senderId: { $ne: userId },
    isRead: false,
    isDeleted: false
  });
};


messageSchema.statics.getConversationMessages = function ({
  conversationId,
  page = 1,
  limit = 50,
  before = null
}) {
  const query = {
    conversationId,
    isDeleted: false
  };

  if (before) {
    query.createdAt = { $lt: before };
  }

  return this.find(query).
  sort({ createdAt: -1 }).
  limit(limit).
  skip((page - 1) * limit).
  populate("senderId", "fullName avatar").
  populate("productId", "name price images").
  populate("orderId", "orderCode totalAmount").
  populate({
    path: "replyTo",
    select: "text senderId type",
    populate: { path: "senderId", select: "fullName" }
  });
};


messageSchema.statics.markAllAsRead = function (conversationId, userId) {
  return this.updateMany(
    {
      conversationId,
      senderId: { $ne: userId },
      isRead: false,
      isDeleted: false
    },
    {
      $set: {
        isRead: true,
        readAt: new Date()
      }
    }
  );
};


messageSchema.virtual("isMine").get(function () {
  return this.senderId && this._currentUserId ?
  this.senderId.toString() === this._currentUserId.toString() :
  false;
});


messageSchema.set("toJSON", { virtuals: true });
messageSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Message", messageSchema);