const express = require('express');
const OrderController = require('../controllers/OrderController');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();

// All order routes require authentication
router.post('/', verifyToken, OrderController.createOrder);
router.get('/my-orders', verifyToken, OrderController.getOrderByAccount);
router.get('/admin/all', verifyToken, OrderController.getOrdersByAdmin);
router.patch('/update', verifyToken, OrderController.updateOrder);
router.get('/:id/totalAmount', verifyToken, OrderController.getTotalAmountOfOrder);
module.exports = router; 