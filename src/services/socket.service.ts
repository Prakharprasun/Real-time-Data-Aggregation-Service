import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import redis from '../lib/redis';
import { Token } from '../types/token.types';

let io: SocketIOServer | null = null;

/**
 * Initialize Socket.io server
 */
export function initializeSocketServer(httpServer: HTTPServer): SocketIOServer {
    io = new SocketIOServer(httpServer, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        },
        transports: ['websocket', 'polling']
    });

    io.on('connection', (socket) => {
        console.log(`[WebSocket] Client connected: ${socket.id}`);

        // Handle subscription to specific views
        socket.on('subscribe', async ({ sort, time }: { sort: string; time?: string }) => {
            const roomName = time ? `${sort}:${time}` : sort;
            socket.join(roomName);

            console.log(`[WebSocket] ${socket.id} joined room: ${roomName}`);

            // Send initial snapshot
            try {
                const tokens = await getTopTokens(sort, time, 30);
                socket.emit('snapshot', {
                    timestamp: Date.now(),
                    sort,
                    time,
                    data: tokens
                });
            } catch (error) {
                console.error(`[WebSocket] Error sending initial snapshot:`, error);
            }
        });

        // Handle unsubscribe
        socket.on('unsubscribe', ({ sort, time }: { sort: string; time?: string }) => {
            const roomName = time ? `${sort}:${time}` : sort;
            socket.leave(roomName);
            console.log(`[WebSocket] ${socket.id} left room: ${roomName}`);
        });

        socket.on('disconnect', () => {
            console.log(`[WebSocket] Client disconnected: ${socket.id}`);
        });
    });

    console.log('[WebSocket] Socket.io server initialized');
    return io;
}

/**
 * Get Socket.io server instance
 */
export function getSocketServer(): SocketIOServer {
    if (!io) {
        throw new Error('Socket.io server not initialized');
    }
    return io;
}

/**
 * Broadcast updates to all rooms
 */
export async function broadcastToAllRooms(): Promise<void> {
    if (!io) {
        console.warn('[WebSocket] Cannot broadcast - server not initialized');
        return;
    }

    const rooms = [
        { sort: 'volume', time: undefined },
        { sort: 'marketcap', time: undefined },
        { sort: 'price_change', time: '1h' },
        { sort: 'price_change', time: '24h' }
    ];

    for (const { sort, time } of rooms) {
        const roomName = time ? `${sort}:${time}` : sort;

        // Check if anyone is in this room
        const sockets = await io.in(roomName).allSockets();
        if (sockets.size === 0) {
            continue; // Skip if no listeners
        }

        try {
            const tokens = await getTopTokens(sort, time, 30);

            io.to(roomName).emit('snapshot', {
                timestamp: Date.now(),
                sort,
                time,
                data: tokens
            });

            console.log(`[WebSocket] Broadcasted to room "${roomName}" (${sockets.size} clients)`);
        } catch (error) {
            console.error(`[WebSocket] Error broadcasting to room "${roomName}":`, error);
        }
    }
}

/**
 * Get top tokens for a specific sort/time combination
 */
async function getTopTokens(sort: string, time: string | undefined, limit: number): Promise<Token[]> {
    let redisKey: string;

    if (sort === 'volume' || sort === 'marketcap') {
        redisKey = `tokens:by:${sort}`;
    } else if (sort === 'price_change') {
        const period = time || '24h';
        redisKey = `tokens:by:price_change:${period}`;
    } else {
        throw new Error(`Invalid sort parameter: ${sort}`);
    }

    // Get top addresses
    const addresses = await redis.zrevrange(redisKey, 0, limit - 1);

    if (addresses.length === 0) {
        return [];
    }

    // Fetch full token data
    const tokenDataArray = await redis.hmget('tokens:data', ...addresses);
    const tokens: Token[] = tokenDataArray
        .filter(data => data !== null)
        .map(data => JSON.parse(data as string));

    return tokens;
}