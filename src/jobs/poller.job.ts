import { fetchAllSources } from '../services/fetcher.service';
import { aggregateAndUpdate } from '../services/aggregator.service';
import { broadcastToAllRooms } from '../services/socket.service';
import { config } from '../config';

let isRunning = false;
let isShuttingDown = false;
let pollerPromise: Promise<void> | null = null;
let pollerInterval: NodeJS.Timeout | null = null;

/**
 * Single poll cycle - fetch, aggregate, update, broadcast
 */
async function executePollCycle(): Promise<void> {
    const startTime = Date.now();
    console.log('[Poller] Starting poll cycle...');

    try {
        // 1. Fetch data from external APIs
        const { dexPairs, jupiterTokens } = await fetchAllSources();

        // 2. Aggregate and update Redis atomically
        await aggregateAndUpdate(dexPairs, jupiterTokens);

        // 3. Broadcast updates to WebSocket clients
        await broadcastToAllRooms();

        const duration = Date.now() - startTime;
        console.log(`[Poller] Poll cycle completed in ${duration}ms`);
    } catch (error) {
        console.error('[Poller] Error in poll cycle:', error);
    }
}

/**
 * Main poller function with mutex lock
 */
async function runPoller(): Promise<void> {
    // Mutex check - prevent overlapping executions
    if (isShuttingDown || isRunning) {
        if (isRunning) {
            console.warn('[Poller] Previous cycle still running, skipping...');
        }
        return;
    }

    isRunning = true;
    pollerPromise = executePollCycle();

    try {
        await pollerPromise;
    } finally {
        isRunning = false;
        pollerPromise = null;
    }
}

/**
 * Start the poller
 */
export function startPoller(): void {
    console.log(`[Poller] Starting with interval: ${config.POLL_INTERVAL_MS}ms`);

    // Run immediately on startup
    runPoller();

    // Then run on interval
    pollerInterval = setInterval(runPoller, config.POLL_INTERVAL_MS);
}

/**
 * Stop the poller (for graceful shutdown)
 */
export async function stopPoller(): Promise<void> {
    console.log('[Poller] Stopping...');
    isShuttingDown = true;

    // Clear interval
    if (pollerInterval) {
        clearInterval(pollerInterval);
        pollerInterval = null;
    }

    // Wait for current cycle to complete
    if (pollerPromise) {
        console.log('[Poller] Waiting for current cycle to complete...');
        await pollerPromise;
    }

    console.log('[Poller] Stopped');
}