import Fastify from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';

const fastify = Fastify({
    logger: {
        level: config.LOG_LEVEL,
        transport: config.NODE_ENV === 'development'
            ? {
                target: 'pino-pretty',
                options: {
                    translateTime: 'HH:MM:ss Z',
                    ignore: 'pid,hostname',
                },
            }
            : undefined,
    },
    disableRequestLogging: false,
});

// Add Request ID
fastify.addHook('onRequest', async (request, reply) => {
    request.id = request.id || uuidv4();
    reply.header('X-Request-ID', request.id);
});

export default fastify;