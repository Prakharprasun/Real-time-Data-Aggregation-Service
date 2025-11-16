import { config } from '../config';
import redis from '../lib/redis';
import { Token, DexScreenerPair, JupiterToken } from '../types/token.types';

const SOL_PRICE_USD = config.SOL_PRICE_USD;

/**
 * Merges and normalizes data from DexScreener and Jupiter into our Token format.
 * DexScreener is the primary source. Jupiter provides metadata enrichment (optional).
 *
 * @param dexPairs - Array of DexScreener pairs
 * @param jupiterTokens - Array of Jupiter tokens (optional)
 * @returns Array of normalized Token objects
 */
export function mergeAndNormalize(
    dexPairs: DexScreenerPair[],
    jupiterTokens: JupiterToken[]
): Token[] {
    console.log(`[Aggregator] Normalizing ${dexPairs.length} DEX pairs...`);

    // Create lookup map for Jupiter metadata (for enrichment)
    const jupiterMap = new Map(
        jupiterTokens.map((t) => [t.address, t])
    );

    const tokens: Token[] = dexPairs.map((pair) => {
        // Get Jupiter metadata if available
        const jupiterToken = jupiterMap.get(pair.baseToken.address);

        // Calculate SOL-denominated values
        const priceUsd = parseFloat(pair.priceUsd);
        const priceSol = priceUsd / SOL_PRICE_USD;
        const volumeSol = pair.volume.h24 / SOL_PRICE_USD;
        const liquiditySol = pair.liquidity.usd / SOL_PRICE_USD;
        const marketCapSol = pair.fdv / SOL_PRICE_USD;

        // Calculate transaction count
        const transactionCount =
            (pair.txns?.h24?.buys || 0) + (pair.txns?.h24?.sells || 0);

        return {
            token_address: pair.baseToken.address,
            token_name:
                pair.baseToken.name ||
                jupiterToken?.name ||
                'Unknown Token',
            token_ticker: pair.baseToken.symbol,
            price_sol: priceSol,
            market_cap_sol: marketCapSol,
            volume_sol: volumeSol,
            liquidity_sol: liquiditySol,
            price_1hr_change: pair.priceChange?.h1 || 0,
            price_24hr_change: pair.priceChange?.h24 || 0,
            transaction_count: transactionCount,
            protocol: pair.dexId,
            last_updated: Date.now(),
        };
    });

    console.log(`[Aggregator] Normalized ${tokens.length} tokens`);
    return tokens;
}

/**
 * Performs atomic Redis update using the temp keys + RENAME strategy.
 * This ensures zero-downtime updates.
 *
 * @param tokens - Array of Token objects to store
 */
export async function atomicRedisUpdate(tokens: Token[]): Promise<void> {
    console.log(`[Aggregator] Starting atomic Redis update for ${tokens.length} tokens...`);

    try {
        // PHASE 1: Write to temporary keys
        const writePipeline = redis.pipeline();

        for (const token of tokens) {
            // Store full token data in hash
            writePipeline.hset(
                'tokens:data:temp',
                token.token_address,
                JSON.stringify(token)
            );

            // Create sorted indexes
            writePipeline.zadd(
                'tokens:by:volume:temp',
                token.volume_sol,
                token.token_address
            );
            writePipeline.zadd(
                'tokens:by:marketcap:temp',
                token.market_cap_sol,
                token.token_address
            );
            writePipeline.zadd(
                'tokens:by:price_change:1h:temp',
                token.price_1hr_change,
                token.token_address
            );
            writePipeline.zadd(
                'tokens:by:price_change:24h:temp',
                token.price_24hr_change,
                token.token_address
            );
        }

        console.log('[Aggregator] Writing to temporary keys...');
        await writePipeline.exec();

        // PHASE 2: Atomic swap using RENAME
        console.log('[Aggregator] Performing atomic RENAME...');
        const renamePipeline = redis.pipeline();

        renamePipeline.rename('tokens:data:temp', 'tokens:data');
        renamePipeline.rename('tokens:by:volume:temp', 'tokens:by:volume');
        renamePipeline.rename('tokens:by:marketcap:temp', 'tokens:by:marketcap');
        renamePipeline.rename(
            'tokens:by:price_change:1h:temp',
            'tokens:by:price_change:1h'
        );
        renamePipeline.rename(
            'tokens:by:price_change:24h:temp',
            'tokens:by:price_change:24h'
        );

        await renamePipeline.exec();

        console.log('[Aggregator] ✅ Atomic update completed successfully');
    } catch (error) {
        console.error('[Aggregator] ❌ RENAME failed, cleaning up temp keys');

        // Cleanup temp keys on failure
        await redis.del(
            'tokens:data:temp',
            'tokens:by:volume:temp',
            'tokens:by:marketcap:temp',
            'tokens:by:price_change:1h:temp',
            'tokens:by:price_change:24h:temp'
        );

        throw error;
    }
}

/**
 * Main aggregation function that fetches, normalizes, and updates Redis.
 * This is called by the poller job.
 *
 * @param dexPairs - Array of DexScreener pairs
 * @param jupiterTokens - Array of Jupiter tokens (optional)
 */
export async function aggregateAndUpdate(
    dexPairs: DexScreenerPair[],
    jupiterTokens: JupiterToken[]
): Promise<void> {
    if (dexPairs.length === 0) {
        console.warn('[Aggregator] No DEX pairs to process, skipping update');
        return;
    }

    // 1. Normalize data
    const tokens = mergeAndNormalize(dexPairs, jupiterTokens);

    // 2. Update Redis atomically
    await atomicRedisUpdate(tokens);

    // 3. Update system timestamp for health checks
    await redis.set('system:last_poll', Date.now().toString(), 'EX', 120);

    console.log('[Aggregator] Aggregation cycle completed');
}