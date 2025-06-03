// Blog Model - models/Blog.js
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const BlogSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
    },
    excerpt: {
      type: String,
      required: true,
      maxlength: 200,
    },
    image: {
      type: String,
      required: true,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
    },
    tags: [{
      type: String,
      trim: true,
    }],
    views: {
      type: Number,
      default: 0,
    },
    likes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
    }],
    publishedAt: {
      type: Date,
    },
  },
  { 
    timestamps: true, 
    collection: "blogs" 
  }
);

// Index for better search performance
BlogSchema.index({ title: 'text', content: 'text', tags: 'text' });

module.exports = mongoose.model("Blog", BlogSchema);