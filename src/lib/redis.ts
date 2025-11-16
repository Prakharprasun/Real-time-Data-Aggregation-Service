import Redis from 'ioredis';
import { config } from '../config';

const redisOptions = {
    maxRetriesPerRequest: 3, // Reduced from null to 3
    enableReadyCheck: true,
    retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    lazyConnect: true,
    // Reduce connection timeout for faster failure
    connectTimeout: 5000,
    commandTimeout: 5000,
};

const redis = new Redis(config.REDIS_URL, redisOptions);

let errorLogged = false;

redis.on('connect', () => {
    console.log('[Redis] ✅ Connected successfully');
    errorLogged = false; // Reset error flag on reconnect
});

redis.on('ready', () => console.log('[Redis] ✅ Ready for commands'));

redis.on('error', (err) => {
    // Only log the first error to reduce spam
    if (!errorLogged) {
        console.error('[Redis] ❌ Connection error:', err.message);
        errorLogged = true;
    }
});

export default redis;