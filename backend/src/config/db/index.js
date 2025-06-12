
const mongoose = require("mongoose");

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Đã kết nối MongoDB Atlas với Mongoose");

    const db = mongoose.connection;

    return db;
  } catch (err) {
    console.error("❌ Lỗi kết nối MongoDB:", err.message);
    throw err;
  }
}

module.exports = { connectDB };
