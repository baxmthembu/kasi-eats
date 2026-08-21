const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

const FIXED_WINDOW_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
if ttl < 0 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { count, ttl }
`;

const DECREMENT_SCRIPT = `
local count = tonumber(redis.call("GET", KEYS[1]) or "0")
if count <= 1 then
  redis.call("DEL", KEYS[1])
  return 0
end
return redis.call("DECR", KEYS[1])
`;

const redisCredentials = (environment = process.env) => ({
  url:
    environment.KV_REST_API_URL?.trim() ||
    environment.UPSTASH_REDIS_REST_URL?.trim() ||
    '',
  token:
    environment.KV_REST_API_TOKEN?.trim() ||
    environment.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    '',
});

class DistributedRateLimitStore {
  constructor({ namespace, redis, environment = process.env }) {
    this.namespace = namespace;
    this.environment = environment;
    this.windowMs = 60_000;

    if (redis) {
      this.redis = redis;
      return;
    }

    const { url, token } = redisCredentials(environment);
    if (!url || !token) {
      throw new Error('Distributed rate limiting requires Redis REST credentials.');
    }
    this.redis = new Redis({ url, token });
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  redisKey(key) {
    const deployment =
      this.environment.RATE_LIMIT_NAMESPACE?.trim() ||
      this.environment.RAILWAY_ENVIRONMENT_NAME?.trim() ||
      this.environment.NODE_ENV ||
      'local';
    const digest = crypto.createHash('sha256').update(String(key)).digest('hex');
    return `streetplate:api-rate-limit:v1:${deployment}:${this.namespace}:${digest}`;
  }

  async increment(key) {
    const result = await this.redis.eval(
      FIXED_WINDOW_SCRIPT,
      [this.redisKey(key)],
      [String(this.windowMs)],
    );
    const totalHits = Number(result?.[0]);
    const ttlMs = Number(result?.[1]);
    if (!Number.isSafeInteger(totalHits) || totalHits < 1 || ttlMs < 0) {
      throw new Error('Invalid response from the distributed rate-limit store.');
    }
    return { totalHits, resetTime: new Date(Date.now() + ttlMs) };
  }

  async decrement(key) {
    await this.redis.eval(DECREMENT_SCRIPT, [this.redisKey(key)], []);
  }

  async resetKey(key) {
    await this.redis.del(this.redisKey(key));
  }
}

const createDistributedStore = (namespace, environment = process.env) => {
  const { url, token } = redisCredentials(environment);
  if (!url || !token) {
    if (environment.NODE_ENV === 'production') {
      throw new Error('Distributed rate limiting is not configured for production.');
    }
    return undefined;
  }
  return new DistributedRateLimitStore({ namespace, environment });
};

module.exports = {
  DistributedRateLimitStore,
  createDistributedStore,
  redisCredentials,
};
