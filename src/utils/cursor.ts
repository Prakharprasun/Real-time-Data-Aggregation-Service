/**
 * Encodes an offset as a base64 cursor for pagination
 */
export function encodeCursor(offset: number): string {
    return Buffer.from(JSON.stringify({ offset })).toString('base64');
}

/**
 * Decodes a base64 cursor to an offset
 */
export function decodeCursor(cursor: string): number {
    try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString());
        return decoded.offset || 0;
    } catch (error) {
        return 0; // Invalid cursor, start from beginning
    }
}

/**
 * Determines the correct Redis key based on sort and time parameters
 */
export function getRedisKey(sort: string, time?: string): string {
    const validSorts = ['volume', 'marketcap', 'price_change'];

    if (!validSorts.includes(sort)) {
        throw new Error(`Invalid sort parameter: ${sort}. Must be one of: ${validSorts.join(', ')}`);
    }

    // volume and marketcap don't have time dimensions
    if (sort === 'volume' || sort === 'marketcap') {
        return `tokens:by:${sort}`;
    }

    // price_change requires a time period
    if (sort === 'price_change') {
        const period = time || '24h';
        const validPeriods = ['1h', '24h'];

        if (!validPeriods.includes(period)) {
            throw new Error(`Invalid time parameter: ${period}. Must be one of: ${validPeriods.join(', ')}`);
        }

        return `tokens:by:price_change:${period}`;
    }

    throw new Error(`Unexpected sort parameter: ${sort}`);
}