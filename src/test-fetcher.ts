import 'dotenv/config';
import { fetchAllSources } from './services/fetcher.service';

async function testFetcher() {
    console.log('=== Testing Fetcher Service ===\n');

    try {
        const { dexPairs, jupiterTokens } = await fetchAllSources();

        console.log('\n=== Results ===');
        console.log(`DexScreener pairs: ${dexPairs.length}`);
        console.log(`Jupiter tokens: ${jupiterTokens.length}`);

        if (dexPairs.length > 0) {
            console.log('\nSample DexScreener pair:');
            console.log(JSON.stringify(dexPairs[0], null, 2));
        }

        if (jupiterTokens.length > 0) {
            console.log('\nSample Jupiter token:');
            console.log(JSON.stringify(jupiterTokens[0], null, 2));
        }

        console.log('\n✅ Fetcher test completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('❌ Fetcher test failed:', error);
        process.exit(1);
    }
}

testFetcher();