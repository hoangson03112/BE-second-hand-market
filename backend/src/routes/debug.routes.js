const express = require('express');
const router = express.Router();

// Debug route for socket status
router.get('/socket-status', (req, res) => {
  const io = req.app.get('io'); // Get io instance from app
  if (!io) {
    return res.status(500).json({ 
      success: false, 
      message: "Socket.io instance not available" 
    });
  }

  // Get server-side info about sockets
  const userSocketMap = req.app.get('userSocketMap');
  
  res.json({
    success: true,
    data: {
      connections: {
        numberOfConnections: io.engine.clientsCount,
        numberOfRooms: Object.keys(io.sockets.adapter.rooms).length
      },
      activeUsers: userSocketMap ? Object.keys(userSocketMap).length : 0,
      activeUserIds: userSocketMap ? Object.keys(userSocketMap) : []
    }
  });
});

module.exports = router; 