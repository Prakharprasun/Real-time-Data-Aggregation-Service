import Redis from 'ioredis';
import { config } from '../config';

const redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
    }
});

redis.on('connect', () => console.log('[Redis] Connected.'));
redis.on('ready', () => console.log('[Redis] Ready for commands.'));
redis.on('error', (err) => console.error('[Redis] Error:', err.message));

export default redis;