const express = require('express');
const BlogController = require('../controllers/BlogController');
const verifyToken = require('../middleware/verifyToken');

const router = express.Router();

// Public routes
router.get('/', BlogController.getAllBlogs);
router.post('/:id/view', BlogController.incrementView);
router.post('/:id/like', verifyToken, BlogController.likeBlog);
router.get('/:id', BlogController.getBlogById);
router.get('/search/:keyword', BlogController.searchBlogs);


// Admin routes
router.post('/', verifyToken, BlogController.createBlog);
router.put('/:id', verifyToken, BlogController.updateBlog);
router.delete('/:id', verifyToken, BlogController.deleteBlog);
router.get('/admin/all', verifyToken, BlogController.getBlogsByAdmin);
router.patch('/:id/status', verifyToken, BlogController.updateBlogStatus);

module.exports = router;