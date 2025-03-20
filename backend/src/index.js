const express = require("express");
const route = require("./routes");
const db = require("./config/db/index");
const app = express();
const cors = require("cors");
const cookieParser = require("cookie-parser");
const http = require("http");
const { Server } = require("socket.io");

const server = http.createServer(app);
const io = new Server(server);
io.on("connection", (socket) => {
  console.log("A user connected");


  socket.emit("loadMessages", messages);


  socket.on("sendMessage", (message) => {
    messages.push(message);
    io.emit("newMessage", message);
  });


  socket.on("disconnect", () => {
    console.log("A user disconnected");
  });
});
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use(cors());

db.connect();

app.use(express.json({ extended: true }));
app.use(cookieParser());

route(app);
app.listen(2000, () => console.log("Server is running on port 2000"));
