import 'dotenv/config';
import fastify from './lib/fastify';
import redis from './lib/redis';
import { tokenRoutes } from './api/token.routes';
import { initializeSocketServer } from './services/socket.service';
import { startPoller, stopPoller } from './jobs/poller.job';
import { config } from './config';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';

let isShuttingDown = false;

async function start() {
    try {
        console.log('[Server] Starting application...');

        // Register Fastify plugins
        await fastify.register(cors, { origin: '*' });
        await fastify.register(sensible);

        // Register API routes
        await fastify.register(tokenRoutes);

        // Start Fastify server
        const address = await fastify.listen({
            port: config.PORT,
            host: '0.0.0.0'
        });
        console.log(`[Server] Fastify listening on ${address}`);

        // Initialize Socket.io server
        initializeSocketServer(fastify.server);

        // Start background poller
        startPoller();

        console.log('[Server] ✅ Application started successfully');
    } catch (error) {
        console.error('[Server] Failed to start:', error);
        process.exit(1);
    }
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal: string): Promise<void> {
    if (isShuttingDown) {
        return;
    }

    console.log(`[Shutdown] Received ${signal} signal`);
    isShuttingDown = true;

    try {
        // 1. Stop accepting new HTTP requests
        console.log('[Shutdown] Closing Fastify server...');
        await fastify.close();

        // 2. Stop the poller (waits for current cycle)
        await stopPoller();

        // 3. Close Redis connection
        console.log('[Shutdown] Closing Redis connection...');
        await redis.quit();

        console.log('[Shutdown] ✅ Clean exit completed');
        process.exit(0);
    } catch (error) {
        console.error('[Shutdown] Error during shutdown:', error);
        process.exit(1);
    }
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('[Server] Uncaught exception:', error);
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
    console.error('[Server] Unhandled rejection:', reason);
    gracefulShutdown('unhandledRejection');
});

// Start the application
start();