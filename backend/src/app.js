const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const socketHandler = require('./socket/socketHandler');
const chatRoutes = require('./routes/chatRoutes');

// Cấu hình dotenv
dotenv.config();

// Khởi tạo express app
const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Kết nối MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('Kết nối MongoDB thành công');
})
.catch((error) => {
  console.error('Lỗi kết nối MongoDB:', error);
});

// Routes
app.use('/eco-market/chat', chatRoutes);

// Khởi tạo socket.io
socketHandler(io);

// Khởi động server
const PORT = process.env.PORT || 2000;
server.listen(PORT, () => {
  console.log(`Server đang chạy trên cổng ${PORT}`);
});

module.exports = { app, server, io }; 