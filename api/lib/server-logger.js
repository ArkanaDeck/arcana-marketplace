export function logServerError(endpoint, error, context = {}) {
    const message = error instanceof Error ? error.message : String(error || 'Unknown error');
    console.error(`[arkana:${endpoint}]`, JSON.stringify({
        endpoint,
        message,
        ...context,
        at: new Date().toISOString(),
    }));
}

export function logServerEvent(endpoint, event, context = {}) {
    console.log(`[arkana:${endpoint}]`, JSON.stringify({
        endpoint,
        event,
        ...context,
        at: new Date().toISOString(),
    }));
}
