const mongoose = require("mongoose");
const config = require("../../../config/env");
const logger = require("../../utils/logger");

async function connect() {
  try {
    mongoose.set("strictQuery", false);
    await mongoose.connect(config.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    logger.info("Connected to MongoDB");
  } catch (error) {
    logger.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1); // Exit application if connection fails
  }
}

module.exports = { connect };
