// Load environment variables first
require('dotenv').config();

const express = require("express");
const initializeRoutes = require("./routes");
const { connectDB } = require("./config/db");
const app = express();
const cors = require("cors");
const cookieParser = require("cookie-parser");
const http = require("http");
const server = http.createServer(app);
const { initializeSocket } = require("./services/socket");
const logger = require("./utils/logger");
const path = require("path");


// Initialize socket.io
const io = initializeSocket(server);

// Make socket.io instance available to Express
app.set("io", io.instance);
app.set("userSocketMap", io.userSocketMap);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Configure CORS
app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  })
);

// Connect to database
connectDB();

app.use(express.json({ extended: true }));
app.use(cookieParser());

// Serve static files cho uploaded images
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Initialize routes
initializeRoutes(app);





// Start server
const PORT = process.env.PORT;
server.listen(PORT, () =>
  logger.info(`Server + Socket.IO running on port ${PORT}`)
);
