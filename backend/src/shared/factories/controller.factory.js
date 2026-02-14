function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function sendSuccess(res, data = null, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json({ success: true, message, data });
}

function sendPaginatedResponse(res, data, pagination, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total: pagination.total,
      totalPages: Math.ceil(pagination.total / pagination.limit),
    },
  });
}

function sendError(res, message = 'Error', statusCode = 500, errors = null) {
  const response = { success: false, message };
  if (errors) response.errors = errors;
  return res.status(statusCode).json(response);
}

function getPaginationParams(req, defaultLimit = 20) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || defaultLimit));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function buildSortObject(sortBy, allowedSorts = {}) {
  return (sortBy && allowedSorts[sortBy]) ? allowedSorts[sortBy] : (allowedSorts.default || { createdAt: -1 });
}

function buildFilterObject(filters, allowedFilters = []) {
  const query = {};
  allowedFilters.forEach((key) => {
    if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
      query[key] = filters[key];
    }
  });
  return query;
}

module.exports = {
  asyncHandler,
  sendSuccess,
  sendPaginatedResponse,
  sendError,
  getPaginationParams,
  buildSortObject,
  buildFilterObject,
};
