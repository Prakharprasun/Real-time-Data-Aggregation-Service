import Redis from 'ioredis';
import { config } from '../config';

// Enhanced Redis configuration for Railway
const redisOptions = {
    maxRetriesPerRequest: 1, // Reduced to minimize error spam
    enableReadyCheck: false, // Disable ready check for better stability
    retryStrategy: (times: number) => {
        if (times > 3) {
            console.log('[Redis] Giving up on connection after 3 attempts');
            return null; // Stop retrying
        }
        const delay = Math.min(times * 100, 1000);
        return delay;
    },
    lazyConnect: true,
    connectTimeout: 5000,
    commandTimeout: 3000,
    keepAlive: 1000,
};

const redis = new Redis(config.REDIS_URL, redisOptions);

let isConnected = false;

redis.on('connect', () => {
    console.log('[Redis] ✅ Connected successfully');
    isConnected = true;
});

redis.on('ready', () => {
    console.log('[Redis] ✅ Ready for commands');
    isConnected = true;
});

redis.on('error', (err) => {
    if (!isConnected) {
        console.error('[Redis] ❌ Connection failed:', err.message);
        isConnected = false;
    }
});

redis.on('end', () => {
    console.log('[Redis] Connection closed');
    isConnected = false;
});

// Test connection on startup
setTimeout(async () => {
    try {
        await redis.ping();
        console.log('[Redis] ✅ Startup connection test passed');
        isConnected = true;
    } catch (error) {
        console.warn('[Redis] ⚠️ Startup connection test failed');
        isConnected = false;
    }
}, 3000);

export default redis;