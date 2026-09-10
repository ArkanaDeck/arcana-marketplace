// Stricter than a regex prefix check: rejects malformed URLs (e.g. "https://") that a regex alone would accept.
export function isValidHttpUrl(value) {
    try {
        const parsed = new URL(String(value || '').trim());
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}
