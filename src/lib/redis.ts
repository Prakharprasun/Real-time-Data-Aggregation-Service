import Redis from 'ioredis';
import { config } from '../config';

// Enhanced Redis configuration for Railway
const redisOptions: Redis.RedisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    // Railway Redis often needs TLS
    tls: config.NODE_ENV === 'production' ? {} : undefined,
    lazyConnect: true, // Don't fail startup if Redis is unavailable
};

const redis = new Redis(config.REDIS_URL, redisOptions);

redis.on('connect', () => console.log('[Redis] ✅ Connected successfully'));
redis.on('ready', () => console.log('[Redis] ✅ Ready for commands'));
redis.on('error', (err) => {
    console.error('[Redis] ❌ Connection error:', err.message);
    // In production, we can continue without Redis temporarily
    if (config.NODE_ENV === 'production') {
        console.warn('[Redis] Running in degraded mode - real-time features disabled');
    }
});

export default redis;