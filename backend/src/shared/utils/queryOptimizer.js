/**
 * Query Optimizer Utilities
 * Helps build optimized MongoDB queries
 */

/**
 * Build lean query (returns plain JS objects instead of Mongoose documents)
 * Use for read-only operations to improve performance
 */
function buildLeanQuery(model, query = {}) {
  return model.find(query).lean();
}

/**
 * Build optimized pagination query with proper indexing hints
 */
async function paginateOptimized(model, query = {}, options = {}) {
  const {
    page = 1,
    limit = 20,
    sort = { createdAt: -1 },
    select = null,
    populate = null,
    lean = true,
  } = options;

  const skip = (page - 1) * limit;

  // Build query with optimizations
  let queryBuilder = model
    .find(query)
    .sort(sort)
    .skip(skip)
    .limit(limit);

  if (select) {
    queryBuilder = queryBuilder.select(select);
  }

  if (lean) {
    queryBuilder = queryBuilder.lean();
  }

  if (populate) {
    queryBuilder = queryBuilder.populate(populate);
  }

  // Use countDocuments with same query for consistency
  const [data, total] = await Promise.all([
    queryBuilder.exec(),
    model.countDocuments(query),
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  };
}

/**
 * Build aggregation pipeline with proper indexing
 */
function buildAggregationPipeline(stages = []) {
  return stages.filter((stage) => stage !== null);
}

/**
 * Get recommended indexes for a query
 * Analyzes query and suggests indexes
 */
function analyzeQuery(query) {
  const indexes = [];
  const fields = Object.keys(query);

  fields.forEach((field) => {
    if (
      field !== "_id" &&
      typeof query[field] !== "object" &&
      !field.startsWith("$")
    ) {
      indexes.push({ [field]: 1 });
    }
  });

  return indexes;
}

/**
 * Batch operations helper
 * Processes items in batches to avoid memory issues
 */
async function batchProcess(items, batchSize, processFn) {
  const results = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await processFn(batch);
    results.push(...batchResults);
  }

  return results;
}

/**
 * Optimize text search queries
 */
function buildTextSearchQuery(searchTerm, fields = []) {
  if (!searchTerm) {
    return {};
  }

  // If model has text index
  const textSearchQuery = { $text: { $search: searchTerm } };

  // Fallback: regex search on specific fields
  if (fields.length > 0) {
    return {
      $or: fields.map((field) => ({
        [field]: { $regex: searchTerm, $options: "i" },
      })),
    };
  }

  return textSearchQuery;
}

/**
 * Build date range query
 */
function buildDateRangeQuery(field, startDate, endDate) {
  const query = {};

  if (startDate || endDate) {
    query[field] = {};
    if (startDate) {
      query[field].$gte = new Date(startDate);
    }
    if (endDate) {
      query[field].$lte = new Date(endDate);
    }
  }

  return query;
}

/**
 * Build price range query
 */
function buildPriceRangeQuery(field = "price", minPrice, maxPrice) {
  const query = {};

  if (minPrice !== undefined || maxPrice !== undefined) {
    query[field] = {};
    if (minPrice !== undefined) {
      query[field].$gte = parseFloat(minPrice);
    }
    if (maxPrice !== undefined) {
      query[field].$lte = parseFloat(maxPrice);
    }
  }

  return query;
}

module.exports = {
  buildLeanQuery,
  paginateOptimized,
  buildAggregationPipeline,
  analyzeQuery,
  batchProcess,
  buildTextSearchQuery,
  buildDateRangeQuery,
  buildPriceRangeQuery,
};
