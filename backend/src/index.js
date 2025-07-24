// Load environment variables first
require("dotenv").config();

const fs = require("fs");
const https = require("https");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");

const initializeRoutes = require("./routes");
const { connectDB } = require("./config/db");
const { initializeSocket } = require("./services/socket");
const logger = require("./utils/logger");

const app = express();

const options = {
  key: fs.readFileSync(path.join(__dirname, "config/https/key.pem")),
  cert: fs.readFileSync(path.join(__dirname, "config/https/cert.crt")),
};

// Create HTTPS server
const server = https.createServer(options, app);

// Initialize Socket.IO
const io = initializeSocket(server);
app.set("io", io.instance);
app.set("userSocketMap", io.userSocketMap);

// Middlewares
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  })
);

// Connect to MongoDB
connectDB();

// Initialize routes
initializeRoutes(app);

// Start server
const PORT = process.env.PORT || 2000;
server.listen(PORT, () => {
  logger.info(`✅ HTTPS Server + Socket.IO running on port ${PORT}`);
});
