/**
 * Pagination Utilities
 */

const { PAGINATION } = require("../constants");

/**
 * Calculate pagination parameters
 */
const getPaginationParams = (page, limit) => {
  const pageNum = Math.max(1, parseInt(page) || PAGINATION.DEFAULT_PAGE);
  const limitNum = Math.min(
    PAGINATION.MAX_LIMIT,
    Math.max(1, parseInt(limit) || PAGINATION.DEFAULT_LIMIT)
  );
  const skip = (pageNum - 1) * limitNum;

  return { page: pageNum, limit: limitNum, skip };
};

/**
 * Build pagination response
 */
const buildPaginationResponse = (page, limit, total) => {
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage,
    hasPrevPage,
  };
};

module.exports = {
  getPaginationParams,
  buildPaginationResponse,
};






