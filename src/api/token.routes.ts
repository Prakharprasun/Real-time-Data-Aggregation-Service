import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import redis from '../lib/redis';
import { encodeCursor, decodeCursor, getRedisKey } from '../utils/cursor';
import { Token } from '../types/token.types';

interface TokenQueryParams {
    sort: string;
    time?: string;
    limit?: number;
    cursor?: string;
}

export async function tokenRoutes(fastify: FastifyInstance) {
    /**
     * Health Check Endpoint
     * GET /health
     * Now more resilient to Redis failures
     */
    fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            // Check Redis connectivity (but don't fail completely if it's down)
            let redisHealthy = false;
            let tokenCount = 0;

            try {
                await redis.ping();
                redisHealthy = true;
                tokenCount = await redis.hlen('tokens:data');
            } catch (redisError) {
                console.warn('[Health] Redis check failed:', (redisError as Error).message);
                redisHealthy = false;
            }

            // Check poller (this should work even without Redis)
            let lastPollStr = null;
            try {
                lastPollStr = await redis.get('system:last_poll');
            } catch (e) {
                // If Redis is down, we can't get last_poll, but app is still running
                console.warn('[Health] Could not get last_poll from Redis');
            }

            const lastPoll = lastPollStr ? parseInt(lastPollStr) : 0;
            // Poller is healthy if we have a recent poll OR if we can't check (Redis down)
            const pollerHealthy = lastPoll === 0 || (Date.now() - lastPoll) < 120000; // 2 minutes grace

            const checks = {
                redis: redisHealthy,
                tokens: tokenCount > 0,
                poller: pollerHealthy,
            };

            // Application is healthy if it's running, even if Redis is temporarily down
            const appIsRunning = true; // If we reached this point, Fastify is running
            const status = appIsRunning ? (redisHealthy ? 'healthy' : 'degraded') : 'unhealthy';

            return reply.code(appIsRunning ? 200 : 503).send({
                status,
                checks,
                metrics: {
                    token_count: tokenCount,
                    last_poll_ms_ago: lastPoll === 0 ? 'unknown' : Date.now() - lastPoll
                },
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                message: !redisHealthy ? 'Running in degraded mode (Redis unavailable)' : 'All systems operational'
            });

        } catch (error) {
            console.error('[Health] Health check failed:', error);
            return reply.code(503).send({
                status: 'unhealthy',
                error: (error as Error).message
            });
        }
    });

    /**
     * Get Tokens Endpoint
     * GET /api/v1/tokens?sort=volume&time=24h&limit=30&cursor=xxx
     * Now handles Redis failures gracefully
     */
    fastify.get<{ Querystring: TokenQueryParams }>(
        '/api/v1/tokens',
        {
            schema: {
                querystring: {
                    type: 'object',
                    required: ['sort'],
                    properties: {
                        sort: {
                            type: 'string',
                            enum: ['volume', 'marketcap', 'price_change']
                        },
                        time: {
                            type: 'string',
                            enum: ['1h', '24h']
                        },
                        limit: {
                            type: 'number',
                            minimum: 1,
                            maximum: 100,
                            default: 30
                        },
                        cursor: {
                            type: 'string'
                        }
                    }
                }
            }
        },
        async (request: FastifyRequest<{ Querystring: TokenQueryParams }>, reply: FastifyReply) => {
            try {
                const { sort, time, limit = 30, cursor } = request.query;

                // Check if Redis is available first
                let redisAvailable = true;
                try {
                    await redis.ping();
                } catch (error) {
                    redisAvailable = false;
                    console.warn('[Tokens API] Redis unavailable, returning empty response');
                    return reply.code(503).send({
                        error: 'Service temporarily unavailable',
                        message: 'Data storage is currently unavailable. Please try again shortly.',
                        data: [],
                        pagination: {
                            limit,
                            cursor: null,
                            has_more: false
                        }
                    });
                }

                // Decode cursor to offset
                const offset = cursor ? decodeCursor(cursor) : 0;

                // Determine Redis key
                const redisKey = getRedisKey(sort, time);

                // Get sorted token addresses with scores
                const addresses = await redis.zrevrange(
                    redisKey,
                    offset,
                    offset + limit - 1
                );

                if (addresses.length === 0) {
                    return {
                        data: [],
                        pagination: {
                            limit,
                            cursor: null,
                            has_more: false
                        }
                    };
                }

                // Fetch full token data
                const tokenDataArray = await redis.hmget('tokens:data', ...addresses);
                const tokens: Token[] = tokenDataArray
                    .filter(data => data !== null)
                    .map(data => JSON.parse(data as string));

                // Generate next cursor
                const hasMore = addresses.length === limit;
                const nextCursor = hasMore ? encodeCursor(offset + limit) : null;

                return {
                    data: tokens,
                    pagination: {
                        limit,
                        cursor: nextCursor,
                        has_more: hasMore
                    }
                };

            } catch (error) {
                fastify.log.error(error, 'Error fetching tokens');

                // Check if it's a Redis connection error
                if (error instanceof Error && error.message.includes('Redis')) {
                    return reply.code(503).send({
                        error: 'Service temporarily unavailable',
                        message: 'Data storage is currently unavailable. Please try again shortly.',
                        data: []
                    });
                }

                return reply.code(500).send({
                    error: 'Internal server error',
                    message: (error as Error).message
                });
            }
        }
    );
}