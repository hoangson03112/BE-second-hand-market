const { getRedisService } = require('../config/redis');

function createCacheMiddleware(options = {}) {
  const {
    ttl = 300,
    keyPrefix = 'api',
    includeQuery = true,
    includeUser = false,
  } = options;

  return async (req, res, next) => {
    if (req.method !== 'GET') return next();

    try {
      const redis = getRedisService();
      let cacheKey = `${keyPrefix}:${req.originalUrl || req.url}`;
      
      if (includeQuery && Object.keys(req.query).length > 0) {
        cacheKey += `:${JSON.stringify(req.query)}`;
      }
      if (includeUser && req.accountID) {
        cacheKey += `:user:${req.accountID}`;
      }

      const cachedResponse = await redis.get(cacheKey);
      if (cachedResponse) {
        console.log(`✅ Cache HIT: ${cacheKey}`);
        return res.json(cachedResponse);
      }

      console.log(`❌ Cache MISS: ${cacheKey}`);
      const originalJson = res.json.bind(res);

      res.json = function(body) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          redis.set(cacheKey, body, ttl).catch(err => {
            console.error('Cache SET error:', err.message);
          });
        }
        return originalJson(body);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error.message);
      next();
    }
  };
}

function createCacheInvalidationMiddleware(pattern) {
  return async (req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      try {
        const redis = getRedisService();
        const deletedCount = await redis.deletePattern(pattern);
        if (deletedCount > 0) {
          console.log(`🧹 Cache invalidated: ${pattern} (${deletedCount} keys)`);
        }
      } catch (error) {
        console.error('Cache invalidation error:', error.message);
      }
    }
    next();
  };
}

function createConditionalCacheMiddleware(condition, cacheOptions = {}) {
  const cacheMiddleware = createCacheMiddleware(cacheOptions);
  return (req, res, next) => {
    if (condition(req)) return cacheMiddleware(req, res, next);
    next();
  };
}

function cacheByUser(options = {}) {
  return createCacheMiddleware({
    ...options,
    includeUser: true,
    keyPrefix: options.keyPrefix || 'user-api',
  });
}

function shortCache(keyPrefix = 'api') {
  return createCacheMiddleware({ ttl: 30, keyPrefix });
}

function longCache(keyPrefix = 'api') {
  return createCacheMiddleware({ ttl: 3600, keyPrefix });
}

module.exports = {
  createCacheMiddleware,
  createCacheInvalidationMiddleware,
  createConditionalCacheMiddleware,
  cacheByUser,
  shortCache,
  longCache,
};

