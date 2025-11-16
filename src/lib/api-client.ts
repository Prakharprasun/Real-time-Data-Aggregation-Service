import axios from 'axios';
import axiosRetry from 'axios-retry';

const apiClient = axios.create({
    timeout: 10000,
    headers: {
        'User-Agent': 'RealtimeTokenAggregator/1.0.0',
        'Accept': 'application/json',
    },
});

axiosRetry(apiClient, {
    retries: 3,
    retryDelay: (retryCount, error) => {
        const delay = Math.min(Math.pow(2, retryCount) * 1000, 30000);
        console.warn(
            `[API-Client] Retry ${retryCount} for ${error.config?.url}. Delaying ${delay}ms...`
        );
        return delay;
    },
    retryCondition: (error) => {
        return (
            axiosRetry.isNetworkOrIdempotentRequestError(error) ||
            error.response?.status === 429
        );
    },
});

export default apiClient;