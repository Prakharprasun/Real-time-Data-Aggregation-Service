// Our internal, normalized Token structure
export interface Token {
    token_address: string;
    token_name: string;
    token_ticker: string;
    price_sol: number;
    market_cap_sol: number;
    volume_sol: number;
    liquidity_sol: number;
    price_1hr_change: number;
    price_24hr_change: number;
    transaction_count: number;
    protocol: string;
    last_updated: number;
}

// --- API Response Types ---

export interface DexScreenerPair {
    chainId: string;
    pairAddress: string;
    baseToken: {
        address: string;
        name: string;
        symbol: string;
    };
    dexId: string;
    priceUsd: string;
    volume: {
        h24: number;
    };
    priceChange?: {
        h1?: number;
        h24?: number;
    };
    liquidity: {
        usd: number;
    };
    fdv: number;
    txns?: {
        h24?: {
            buys: number;
            sells: number;
        };
    };
}

export interface DexScreenerSearchResponse {
    pairs: DexScreenerPair[];
}

export interface JupiterToken {
    address: string;
    name: string;
    symbol: string;
    decimals?: number;
    logoURI?: string;
}

export interface JupiterSearchResponse {
    data?: JupiterToken[];
    tokens?: JupiterToken[];
}