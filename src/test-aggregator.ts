import 'dotenv/config';
import { fetchAllSources } from './services/fetcher.service';
import { aggregateAndUpdate } from './services/aggregator.service';
import redis from './lib/redis';

async function testAggregator() {
    console.log('=== Testing Aggregator Service ===\n');

    try {
        // 1. Fetch data
        console.log('Step 1: Fetching data...');
        const { dexPairs, jupiterTokens } = await fetchAllSources();

        // 2. Aggregate and update Redis
        console.log('\nStep 2: Aggregating and updating Redis...');
        await aggregateAndUpdate(dexPairs, jupiterTokens);

        // 3. Verify data in Redis
        console.log('\nStep 3: Verifying Redis data...');
        const tokenCount = await redis.hlen('tokens:data');
        const volumeCount = await redis.zcard('tokens:by:volume');
        const marketcapCount = await redis.zcard('tokens:by:marketcap');

        console.log(`\n=== Verification Results ===`);
        console.log(`Tokens in hash: ${tokenCount}`);
        console.log(`Tokens in volume index: ${volumeCount}`);
        console.log(`Tokens in marketcap index: ${marketcapCount}`);

        // 4. Get top 5 tokens by volume
        console.log('\n=== Top 5 Tokens by Volume ===');
        const top5Addresses = await redis.zrevrange('tokens:by:volume', 0, 4, 'WITHSCORES');

        for (let i = 0; i < top5Addresses.length; i += 2) {
            const address = top5Addresses[i];
            const volume = top5Addresses[i + 1];
            const tokenData = await redis.hget('tokens:data', address);

            if (tokenData) {
                const token = JSON.parse(tokenData);
                console.log(`${i / 2 + 1}. ${token.token_name} (${token.token_ticker})`);
                console.log(`   Volume: ${parseFloat(volume).toFixed(2)} SOL`);
                console.log(`   Price: $${(token.price_sol * 160).toFixed(6)}`);
            }
        }

        console.log('\n✅ Aggregator test completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('❌ Aggregator test failed:', error);
        process.exit(1);
    } finally {
        await redis.quit();
    }
}

testAggregator();