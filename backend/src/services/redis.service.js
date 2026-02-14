const logger = require('../utils/logger');

const isUpstashRest = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;

const Redis = isUpstashRest 
  ? require('@upstash/redis').Redis 
  : require('ioredis');

const redisConfig = isUpstashRest
  ? {
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    }
  : {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB) || 0,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    };

function createRedisClient() {
  const client = new Redis(redisConfig);

  if (isUpstashRest) {
    logger.info('✅ Redis: Upstash REST API');
  } else {
    client.on('connect', () => logger.info('✅ Redis: Connected'));
    client.on('error', (err) => logger.error('❌ Redis error:', err.message));
    client.on('close', () => logger.warn('⚠️ Redis: Connection closed'));
  }

  return client;
}

function createRedisService(redisClient) {
  async function get(key) {
    try {
      const value = await redisClient.get(key);
      if (!value) return null;
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (error) {
      logger.error(`Redis GET error: ${key}`, error.message);
      return null;
    }
  }

  async function set(key, value, ttl = 300) {
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      ttl ? await redisClient.setex(key, ttl, serialized) : await redisClient.set(key, serialized);
      return true;
    } catch (error) {
      logger.error(`Redis SET error: ${key}`, error.message);
      return false;
    }
  }

  async function del(key) {
    try {
      await redisClient.del(key);
      return true;
    } catch (error) {
      logger.error(`Redis DEL error: ${key}`, error.message);
      return false;
    }
  }

  async function deletePattern(pattern) {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length === 0) return 0;
      await redisClient.del(...keys);
      return keys.length;
    } catch (error) {
      logger.error(`Redis DELETE PATTERN error: ${pattern}`, error.message);
      return 0;
    }
  }

  async function clear() {
    try {
      await redisClient.flushdb();
      return true;
    } catch (error) {
      logger.error('Redis CLEAR error:', error.message);
      return false;
    }
  }

  async function getOrSet(key, fn, ttl = 300) {
    try {
      let value = await get(key);
      if (value !== null) return value;
      value = await fn();
      await set(key, value, ttl);
      return value;
    } catch (error) {
      logger.error(`Redis GET_OR_SET error: ${key}`, error.message);
      return await fn();
    }
  }

  async function exists(key) {
    try {
      const result = await redisClient.exists(key);
      return result === 1;
    } catch (error) {
      return false;
    }
  }

  async function expire(key, ttl) {
    try {
      await redisClient.expire(key, ttl);
      return true;
    } catch (error) {
      return false;
    }
  }

  async function ttl(key) {
    try {
      return await redisClient.ttl(key);
    } catch (error) {
      return -2;
    }
  }

  async function increment(key, amount = 1) {
    try {
      return await redisClient.incrby(key, amount);
    } catch (error) {
      return 0;
    }
  }

  async function getStats() {
    try {
      const dbSize = await redisClient.dbsize();
      return {
        connected: redisClient.status === 'ready',
        keysCount: dbSize,
      };
    } catch (error) {
      return { connected: false, keysCount: 0 };
    }
  }

  async function ping() {
    try {
      const result = await redisClient.ping();
      return result === 'PONG';
    } catch (error) {
      return false;
    }
  }

  async function disconnect() {
    try {
      await redisClient.quit();
    } catch (error) {
      redisClient.disconnect();
    }
  }

  return {
    get, set, del, deletePattern, clear, getOrSet,
    exists, expire, ttl, increment,
    getStats, ping, disconnect,
    client: redisClient,
  };
}

let redisService = null;

function initRedisService() {
  if (!redisService) {
    const client = createRedisClient();
    redisService = createRedisService(client);
  }
  return redisService;
}

function getRedisService() {
  return redisService || initRedisService();
}

module.exports = { initRedisService, getRedisService };
