export function formatRpcResponse(response: any, sessionId: string): any {
    if (!response || typeof response !== 'object') {
        return { error: 'Invalid response format' };
    }

    const { id, jsonrpc, result } = response;

    // hexadecimal -> readable decimal format
    let formattedResult = result;
    if (typeof result === 'string' && result.startsWith('0x')) {
        try {
            formattedResult = BigInt(result).toString(10);
        } catch (e) {
            formattedResult = 'Error converting result to decimal';
        }
    }
    
    return {
        id,
        jsonrpc,
        sessionId,
        result: formattedResult,
    };
}
