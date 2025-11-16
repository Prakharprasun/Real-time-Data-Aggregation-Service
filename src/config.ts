import { z } from 'zod';
import 'dotenv/config';

const configSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.string().transform(Number).default('3000'),

    REDIS_URL: z.string().url(),

    POLL_INTERVAL_MS: z.string().transform(Number).default('30000'),
    JANITOR_INTERVAL_MS: z.string().transform(Number).default('3600000'),

    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

    DEXSCREENER_API_URL: z.string().url().default('https://api.dexscreener.com'),
    JUPITER_API_URL: z.string().url().default('https://token.jup.ag'),

    SOL_PRICE_USD: z.string().transform(Number).default('160'),
});

export const config = configSchema.parse(process.env);

console.log('[Config] Environment:', config.NODE_ENV);
console.log('[Config] Port:', config.PORT);
console.log('[Config] Redis:', config.REDIS_URL.replace(/:[^:]*@/, ':***@'));