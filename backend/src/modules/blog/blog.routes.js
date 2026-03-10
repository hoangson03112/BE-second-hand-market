const express = require('express');
const BlogController = require("./blog.controller");
const verifyToken = require('../../middlewares/verifyToken');
const {
  createCacheMiddleware,
  createCacheInvalidationMiddleware,
} = require('../../middlewares/cache');

const router = express.Router();

// Public routes
router.get(
  '/',
  createCacheMiddleware({ ttl: 300, keyPrefix: 'blogs-list' }),
  BlogController.getAllBlogs
);
router.post(
  '/:id/view',
  createCacheInvalidationMiddleware('blog*'),
  BlogController.incrementView
);
router.post(
  '/:id/like',
  verifyToken,
  createCacheInvalidationMiddleware('blog*'),
  BlogController.likeBlog
);
router.get(
  '/:id',
  createCacheMiddleware({ ttl: 300, keyPrefix: 'blog-detail' }),
  BlogController.getBlogById
);
router.get(
  '/search/:keyword',
  createCacheMiddleware({ ttl: 180, keyPrefix: 'blogs-search' }),
  BlogController.searchBlogs
);

// Admin routes
router.post(
  '/',
  verifyToken,
  createCacheInvalidationMiddleware('blog*'),
  BlogController.createBlog
);
router.put(
  '/:id',
  verifyToken,
  createCacheInvalidationMiddleware('blog*'),
  BlogController.updateBlog
);
router.delete(
  '/:id',
  verifyToken,
  createCacheInvalidationMiddleware('blog*'),
  BlogController.deleteBlog
);
router.get('/admin/all', verifyToken, BlogController.getBlogsByAdmin);
router.patch(
  '/:id/status',
  verifyToken,
  createCacheInvalidationMiddleware('blog*'),
  BlogController.updateBlogStatus
);

module.exports = router;
