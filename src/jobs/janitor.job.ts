import { config } from '../config';
import redis from '../lib/redis';
import { Token } from '../types/token.types';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MIN_VOLUME_SOL = 100; // Minimum 24h volume in SOL to be considered "active"

/**
 * The main janitor cycle.
 * Finds and removes stale tokens from our Redis cache.
 */
async function runJanitorCycle() {
    console.log('[Janitor] Starting cleanup cycle...');

    try {
        const now = Date.now();

        // 1. Get all token addresses from our main hash
        const allAddresses = await redis.hkeys('tokens:data');
        if (allAddresses.length === 0) {
            console.log('[Janitor] No tokens found to clean up.');
            return;
        }

        // 2. Fetch all token data in a single pipeline
        const fetchPipeline = redis.pipeline();
        allAddresses.forEach((addr) => fetchPipeline.hget('tokens:data', addr));
        const results = await fetchPipeline.exec();

        const staleAddresses: string[] = [];

        // 3. Filter for stale tokens
        results?.forEach((result, index) => {
            // result[0] is error (null if success), result[1] is the data
            if (result && result[1]) {
                try {
                    const token: Token = JSON.parse(result[1] as string);

                    const isLowVolume = token.volume_sol < MIN_VOLUME_SOL;
                    const isOld = (now - token.last_updated) > ONE_DAY_MS;

                    // Mark for deletion if both low volume AND old
                    if (isLowVolume && isOld) {
                        staleAddresses.push(token.token_address);
                    }
                } catch (e) {
                    console.error(`[Janitor] Failed to parse token data for ${allAddresses[index]}`, e);
                }
            }
        });

        if (staleAddresses.length === 0) {
            console.log('[Janitor] No stale tokens to remove.');
            return;
        }

        // 4. Atomically remove all stale tokens
        console.log(`[Janitor] Removing ${staleAddresses.length} stale tokens...`);
        const deletePipeline = redis.pipeline();
        staleAddresses.forEach((address) => {
            deletePipeline.hdel('tokens:data', address);
            deletePipeline.zrem('tokens:by:volume', address);
            deletePipeline.zrem('tokens:by:marketcap', address);
            deletePipeline.zrem('tokens:by:price_change:1h', address);
            deletePipeline.zrem('tokens:by:price_change:24h', address);
        });

        await deletePipeline.exec();
        console.log(`[Janitor] Cleanup complete. Removed ${staleAddresses.length} tokens.`);

    } catch (error) {
        console.error('[Janitor] Unhandled error in janitor cycle:', error);
    }
}

/**
 * Starts the janitor job on its configured interval.
 */
export function startJanitor() {
    console.log(`[Janitor] Starting janitor with interval: ${config.JANITOR_INTERVAL_MS}ms`);

    // Run it once on start, then on the interval
    runJanitorCycle();

    setInterval(runJanitorCycle, config.JANITOR_INTERVAL_MS);
}