const express = require('express');
const ProductController = require('../controllers/ProductController');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();

// Public product routes
router.get('/by-category', ProductController.getProductListByCategory);
router.get('/details', ProductController.getProduct);
router.get('/', ProductController.getProducts);
router.get('/by-user',verifyToken, ProductController.getProductsByUser);
// Protected product routes (requiring authentication)
router.get('/my-products', verifyToken, ProductController.getProductOfUser);
router.post('/create', verifyToken, ProductController.addProduct);
router.patch('/update-status', verifyToken, ProductController.updateStatusProduct);
router.delete('/:productId', verifyToken, ProductController.deleteProduct);

module.exports = router; 