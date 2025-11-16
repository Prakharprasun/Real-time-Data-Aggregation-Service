import Redis from 'ioredis';
import { config } from '../config';

// --- THIS IS THE FIX ---
// We add "?family=0" to the URL to handle Railway's networking
const connectionString = config.REDIS_URL.includes('?')
    ? config.REDIS_URL
    : config.REDIS_URL + '?family=0';
// --- END OF FIX ---

const redisOptions = {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    lazyConnect: true,
    connectTimeout: 5000,
    commandTimeout: 5000,
};

// Use the new connectionString here
const redis = new Redis(connectionString, redisOptions);

let errorLogged = false;

redis.on('connect', () => {
    console.log('[Redis] ✅ Connected successfully');
    errorLogged = false; // Reset error flag on reconnect
});

redis.on('ready', () => console.log('[Redis] ✅ Ready for commands'));

redis.on('error', (err: Error) => {
    // Only log the first error to reduce spam
    if (!errorLogged) {
        console.error('[Redis] ❌ Connection error:', err.message);
        errorLogged = true;
    }
});

export default redis;