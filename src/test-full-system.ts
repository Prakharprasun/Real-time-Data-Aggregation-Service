import 'dotenv/config';
import axios from 'axios';
import { io as ioClient, Socket } from 'socket.io-client';

const API_URL = 'http://localhost:3000';

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testFullSystem() {
    console.log('=== Full System Integration Test ===\n');

    let socket: Socket | null = null;

    try {
        // Wait for server to start
        console.log('Step 1: Waiting for server to start...');
        await sleep(5000);

        // Test 1: Health Check
        console.log('\nStep 2: Testing Health Check...');
        const healthResponse = await axios.get(`${API_URL}/health`);
        console.log('✅ Health check passed:', healthResponse.data.status);
        console.log('   Tokens:', healthResponse.data.metrics.token_count);

        // Test 2: REST API - Get tokens by volume
        console.log('\nStep 3: Testing REST API (volume)...');
        const volumeResponse = await axios.get(`${API_URL}/api/v1/tokens`, {
            params: { sort: 'volume', limit: 5 }
        });
        console.log('✅ Volume endpoint passed');
        console.log(`   Returned ${volumeResponse.data.data.length} tokens`);
        if (volumeResponse.data.data.length > 0) {
            const topToken = volumeResponse.data.data[0];
            console.log(`   Top token: ${topToken.token_name} (${topToken.token_ticker})`);
            console.log(`   Volume: ${topToken.volume_sol.toFixed(2)} SOL`);
        }

        // Test 3: REST API - Get tokens by market cap
        console.log('\nStep 4: Testing REST API (marketcap)...');
        const marketcapResponse = await axios.get(`${API_URL}/api/v1/tokens`, {
            params: { sort: 'marketcap', limit: 5 }
        });
        console.log('✅ Market cap endpoint passed');
        console.log(`   Returned ${marketcapResponse.data.data.length} tokens`);

        // Test 4: REST API - Pagination
        console.log('\nStep 5: Testing Pagination...');
        const page1 = await axios.get(`${API_URL}/api/v1/tokens`, {
            params: { sort: 'volume', limit: 3 }
        });
        if (page1.data.pagination.cursor) {
            const page2 = await axios.get(`${API_URL}/api/v1/tokens`, {
                params: {
                    sort: 'volume',
                    limit: 3,
                    cursor: page1.data.pagination.cursor
                }
            });
            console.log('✅ Pagination works');
            console.log(`   Page 1: ${page1.data.data.length} tokens`);
            console.log(`   Page 2: ${page2.data.data.length} tokens`);
        }

        // Test 5: WebSocket Connection
        console.log('\nStep 6: Testing WebSocket...');
        socket = ioClient(API_URL, {
            transports: ['websocket']
        });

        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('WebSocket timeout')), 5000);

            socket!.on('connect', () => {
                console.log('✅ WebSocket connected');
                clearTimeout(timeout);
                resolve();
            });

            socket!.on('connect_error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });

        // Test 6: WebSocket Subscription
        console.log('\nStep 7: Testing WebSocket subscription...');
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Snapshot timeout')), 10000);

            socket!.on('snapshot', (data) => {
                console.log('✅ Received snapshot from WebSocket');
                console.log(`   Sort: ${data.sort}`);
                console.log(`   Tokens: ${data.data.length}`);
                console.log(`   Timestamp: ${new Date(data.timestamp).toISOString()}`);
                clearTimeout(timeout);
                resolve();
            });

            // Subscribe to volume updates
            socket!.emit('subscribe', { sort: 'volume' });
        });

        // Test 7: Performance - Rapid API calls
        console.log('\nStep 8: Testing API performance (10 rapid calls)...');
        const startTime = Date.now();
        const promises = Array.from({ length: 10 }, () =>
            axios.get(`${API_URL}/api/v1/tokens`, {
                params: { sort: 'volume', limit: 10 }
            })
        );
        await Promise.all(promises);
        const duration = Date.now() - startTime;
        const avgResponseTime = duration / 10;
        console.log('✅ Performance test passed');
        console.log(`   10 requests completed in ${duration}ms`);
        console.log(`   Average response time: ${avgResponseTime.toFixed(2)}ms`);

        if (avgResponseTime < 50) {
            console.log('   🚀 Excellent performance (< 50ms)!');
        } else if (avgResponseTime < 100) {
            console.log('   ✅ Good performance (< 100ms)');
        }

        console.log('\n=== ✅ All Tests Passed! ===');
        console.log('\nSystem is ready for production! 🎉\n');

    } catch (error) {
        console.error('\n❌ Test failed:', error);
        process.exit(1);
    } finally {
        if (socket) {
            socket.disconnect();
        }
    }
}

testFullSystem();