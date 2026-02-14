function createService(model) {
  async function findAll(query = {}, options = {}) {
    const {
      select = null,
      populate = null,
      sort = { createdAt: -1 },
      page = 1,
      limit = 20,
      lean = false,
    } = options;

    const skip = (page - 1) * limit;
    let queryBuilder = model.find(query).sort(sort).skip(skip).limit(limit);

    if (select) queryBuilder = queryBuilder.select(select);
    if (populate) queryBuilder = queryBuilder.populate(populate);
    if (lean) queryBuilder = queryBuilder.lean();

    const [data, total] = await Promise.all([
      queryBuilder.exec(),
      model.countDocuments(query),
    ]);

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async function findById(id, options = {}) {
    const { select = null, populate = null, lean = false } = options;
    let query = model.findById(id);
    if (select) query = query.select(select);
    if (populate) query = query.populate(populate);
    if (lean) query = query.lean();
    return await query.exec();
  }

  async function findOne(query, options = {}) {
    const { select = null, populate = null, lean = false } = options;
    let queryBuilder = model.findOne(query);
    if (select) queryBuilder = queryBuilder.select(select);
    if (populate) queryBuilder = queryBuilder.populate(populate);
    if (lean) queryBuilder = queryBuilder.lean();
    return await queryBuilder.exec();
  }

  async function create(data) {
    const doc = new model(data);
    return await doc.save();
  }

  async function createMany(dataArray) {
    return await model.insertMany(dataArray);
  }

  async function updateById(id, data, options = { new: true, runValidators: true }) {
    return await model.findByIdAndUpdate(id, data, options);
  }

  async function updateOne(query, data, options = { new: true, runValidators: true }) {
    return await model.findOneAndUpdate(query, data, options);
  }

  async function updateMany(filter, update) {
    return await model.updateMany(filter, update);
  }

  async function deleteById(id) {
    return await model.findByIdAndDelete(id);
  }

  async function deleteOne(query) {
    return await model.findOneAndDelete(query);
  }

  async function deleteMany(filter) {
    return await model.deleteMany(filter);
  }

  async function exists(query) {
    const count = await model.countDocuments(query);
    return count > 0;
  }

  async function count(query = {}) {
    return await model.countDocuments(query);
  }

  async function aggregate(pipeline) {
    return await model.aggregate(pipeline);
  }

  return {
    findAll, findById, findOne, exists, count,
    create, createMany,
    updateById, updateOne, updateMany,
    deleteById, deleteOne, deleteMany,
    aggregate,
    model,
  };
}

function createCachedService(model, cacheService, options = {}) {
  const baseService = createService(model);
  const { keyPrefix = model.modelName.toLowerCase(), defaultTTL = 300 } = options;

  async function findByIdCached(id, queryOptions = {}, ttl = defaultTTL) {
    const cacheKey = `${keyPrefix}:${id}`;
    return await cacheService.getOrSet(
      cacheKey,
      () => baseService.findById(id, queryOptions),
      ttl
    );
  }

  async function findAllCached(query = {}, queryOptions = {}, ttl = defaultTTL) {
    const cacheKey = `${keyPrefix}:list:${JSON.stringify({ query, queryOptions })}`;
    return await cacheService.getOrSet(
      cacheKey,
      () => baseService.findAll(query, queryOptions),
      ttl
    );
  }

  async function invalidateCache(id) {
    const cacheKey = `${keyPrefix}:${id}`;
    await cacheService.del(cacheKey);
  }

  async function invalidateAllCache() {
    await cacheService.deletePattern(`${keyPrefix}:*`);
  }

  return {
    ...baseService,
    findByIdCached,
    findAllCached,
    invalidateCache,
    invalidateAllCache,
  };
}

module.exports = { createService, createCachedService };
