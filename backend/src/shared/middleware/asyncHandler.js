/**
 * Async Handler Middleware
 * Eliminates try-catch blocks in controllers
 * 
 * Usage:
 * router.get('/', asyncHandler(async (req, res) => {
 *   const data = await SomeModel.find();
 *   res.json({ data });
 * }));
 */

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
