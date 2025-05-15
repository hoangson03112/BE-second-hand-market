const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const socketHandler = require('./socket/socketHandler');
const chatRoutes = require('./routes/chat.routes');

// Configure dotenv
dotenv.config();

// Initialize express app
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

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('MongoDB connection successful');
})
.catch((error) => {
  console.error('MongoDB connection error:', error);
});

// Routes
app.use('/eco-market/chat', chatRoutes);

// Make socket.io instance available to Express
app.set('io', io);

// Initialize socket.io
socketHandler(io);

// Start server
const PORT = process.env.PORT || 2000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, server, io }; 