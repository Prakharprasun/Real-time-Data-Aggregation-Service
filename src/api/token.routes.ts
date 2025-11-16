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
     */
    fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            // Check 1: Redis connectivity
            await redis.ping();

            // Check 2: Data exists
            const tokenCount = await redis.hlen('tokens:data');

            // Check 3: Poller is running (updated within last 60s)
            const lastPollStr = await redis.get('system:last_poll');
            const lastPoll = lastPollStr ? parseInt(lastPollStr) : 0;
            const pollerHealthy = (Date.now() - lastPoll) < 60000;

            const checks = {
                redis: true,
                tokens: tokenCount > 0,
                poller: pollerHealthy,
            };

            const allHealthy = Object.values(checks).every(v => v);

            return reply.code(allHealthy ? 200 : 503).send({
                status: allHealthy ? 'healthy' : 'degraded',
                checks,
                metrics: {
                    token_count: tokenCount,
                    last_poll_ms_ago: Date.now() - lastPoll
                },
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            });

        } catch (error) {
            return reply.code(503).send({
                status: 'unhealthy',
                error: (error as Error).message
            });
        }
    });

    /**
     * Get Tokens Endpoint
     * GET /api/v1/tokens?sort=volume&time=24h&limit=30&cursor=xxx
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
                fastify.log.error('Error fetching tokens:', error);
                return reply.code(500).send({
                    error: 'Internal server error',
                    message: (error as Error).message
                });
            }
        }
    );
}