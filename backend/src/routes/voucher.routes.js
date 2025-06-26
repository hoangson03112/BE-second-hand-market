const express = require('express');
const VoucherController = require('../controllers/VoucherController');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();

// Admin routes
router.post('/create', verifyToken, VoucherController.createVoucher);
router.get('/all', verifyToken, VoucherController.getAllVouchers);
router.put('/:id', verifyToken, VoucherController.updateVoucher);
router.delete('/:id', verifyToken, VoucherController.deleteVoucher);

// User routes
router.get('/available', VoucherController.getAvailableVouchers);
router.post('/apply', verifyToken, VoucherController.applyVoucher);
router.post('/use', verifyToken, VoucherController.useVoucher);

module.exports = router;