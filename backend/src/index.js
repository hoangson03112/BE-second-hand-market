const express = require("express");
const initializeRoutes = require("./routes");
const db = require("./config/db");
const app = express();
const cors = require("cors");
const cookieParser = require("cookie-parser");
const http = require("http");
const server = http.createServer(app);
const { initializeSocket } = require("./services/socket");
const config = require("../config/env");
const logger = require("./utils/logger");

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
    origin: config.CORS_ORIGIN,
    credentials: true,
  })
);

// Connect to database
db.connect();

app.use(express.json({ extended: true }));
app.use(cookieParser());

// Initialize routes
initializeRoutes(app);

// Start server
const PORT = config.PORT;
server.listen(PORT, () =>
  logger.info(`Server + Socket.IO running on port ${PORT}`)
);
