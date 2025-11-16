import axios from 'axios';
import { config } from '../config';
import apiClient from '../lib/api-client';
import {
    DexScreenerPair,
    DexScreenerSearchResponse,
    JupiterToken,
} from '../types/token.types';

const DEX_API_URL = config.DEXSCREENER_API_URL;

/**
 * Fetches trending pairs from DexScreener for Solana chain.
 *
 * @returns Array of DexScreener pairs, or empty array on failure
 */
export async function fetchDexScreenerTrending(): Promise<DexScreenerPair[]> {
    try {
        console.log('[Fetcher] Fetching trending Solana pairs from DexScreener...');

        const response = await apiClient.get<DexScreenerSearchResponse>(
            `${DEX_API_URL}/latest/dex/search`,
            {
                params: {
                    q: 'pump',
                },
            }
        );

        if (!response.data || !Array.isArray(response.data.pairs)) {
            console.warn('[Fetcher] DexScreener returned unexpected response format');
            return [];
        }

        const pairs = response.data.pairs;

        // Filter for Solana chain AND valid data
        const validPairs = pairs.filter((pair) => {
            return (
                pair.chainId === 'solana' &&
                pair.baseToken?.address &&
                pair.priceUsd &&
                typeof pair.volume?.h24 === 'number' &&
                typeof pair.liquidity?.usd === 'number'
            );
        });

        console.log(
            `[Fetcher] DexScreener: Received ${pairs.length} pairs, ` +
            `${validPairs.length} valid Solana pairs after filtering`
        );

        return validPairs;

    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error(
                `[Fetcher] DexScreener API error: ${error.message}`,
                {
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    url: error.config?.url,
                }
            );
        } else {
            console.error('[Fetcher] Unexpected error fetching from DexScreener:', error);
        }

        return [];
    }
}

/**
 * Fetches token metadata from Jupiter (OPTIONAL - for metadata enrichment only).
 * If this fails, the system still works with DexScreener data.
 *
 * @returns Array of Jupiter tokens, or empty array on failure
 */
export async function fetchJupiterMetadata(): Promise<JupiterToken[]> {
    try {
        console.log('[Fetcher] Fetching token metadata from Jupiter (optional)...');

        // Note: Jupiter API endpoints frequently change or require auth
        // This is kept for future use but failures are gracefully handled
        const response = await apiClient.get(
            'https://quote-api.jup.ag/v6/tokens',
            {
                timeout: 5000, // Shorter timeout for optional service
            }
        );

        let tokens: JupiterToken[] = [];

        if (Array.isArray(response.data)) {
            tokens = response.data;
        } else if (response.data?.tokens && Array.isArray(response.data.tokens)) {
            tokens = response.data.tokens;
        } else {
            console.warn('[Fetcher] Jupiter: Skipping due to unexpected response format');
            return [];
        }

        const validTokens = tokens.filter((token) => token.address);

        console.log(`[Fetcher] Jupiter: Received ${validTokens.length} tokens`);
        return validTokens;

    } catch (error) {
        // Jupiter is optional, so just log and continue
        console.warn('[Fetcher] Jupiter API unavailable (optional service):',
            axios.isAxiosError(error) ? error.message : 'Unknown error'
        );
        return [];
    }
}

/**
 * Fetches data from all sources concurrently.
 * DexScreener is primary source. Jupiter is optional for metadata enrichment.
 *
 * @returns Object containing data from available sources
 */
export async function fetchAllSources(): Promise<{
    dexPairs: DexScreenerPair[];
    jupiterTokens: JupiterToken[];
}> {
    console.log('[Fetcher] Starting concurrent fetch from all sources...');

    const startTime = Date.now();

    // Fetch concurrently, but Jupiter failure won't break the system
    const [dexPairs, jupiterTokens] = await Promise.all([
        fetchDexScreenerTrending(),
        fetchJupiterMetadata(),
    ]);

    const duration = Date.now() - startTime;
    console.log(`[Fetcher] Fetch completed in ${duration}ms`);
    console.log(`[Fetcher] Summary: ${dexPairs.length} DEX pairs, ${jupiterTokens.length} Jupiter tokens`);

    return {
        dexPairs,
        jupiterTokens,
    };
}