const mongoose = require("mongoose");
require("dotenv").config();
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const db = mongoose.connection;

    return db;
  } catch (err) {
    console.error("❌ Lỗi kết nối MongoDB:", err.message);
    throw err;
  }
}

module.exports = { connectDB };
