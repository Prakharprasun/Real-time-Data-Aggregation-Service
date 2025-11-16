import { z } from 'zod';
import 'dotenv/config';

const configSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.string().transform(Number).default('3000'),

    // --- THIS IS THE FIX ---
    // We change .url() to .min(1) to check that it's a non-empty string.
    // This allows Zod to accept the "redis://" protocol.
    REDIS_URL: z.string().min(1, { message: "REDIS_URL is required" }),
    // --- END OF FIX ---

    POLL_INTERVAL_MS: z.string().transform(Number).default('30000'),
    JANITOR_INTERVAL_MS: z.string().transform(Number).default('3600000'),

    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

    DEXSCREENER_API_URL: z.string().url().default('https://api.dexscreener.com'),
    JUPITER_API_URL: z.string().url().default('https://token.jup.ag'), // Switched to the one that worked in your test

    SOL_PRICE_USD: z.string().transform(Number).default('160'),
});

export const config = configSchema.parse(process.env);

// Log config on startup (mask sensitive parts)
console.log('[Config] Environment:', config.NODE_ENV);
console.log('[Config] Port:', config.PORT);
console.log('[Config] Redis:', config.REDIS_URL.replace(/:[^:]*@/, ':***@'));