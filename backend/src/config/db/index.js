const mongoose = require("mongoose");
const logger = require("../../utils/logger");

async function connectDB() {
  try {
    mongoose.set("strictQuery", false);
    await mongoose.connect("mongodb://localhost:27017/Second_Hand_Maket", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    logger.info("Connected to MongoDB");
  } catch (error) {
    logger.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1); // Exit application if connection fails
  }
}

module.exports = { connectDB };