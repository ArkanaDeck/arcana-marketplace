import { logServerError } from './server-logger.js';

// Pluggable multi-modal vision check. Point VISION_AI_ENDPOINT/VISION_AI_API_KEY at your provider
// (OpenAI, Google Vision, AWS Rekognition, etc.) once one is chosen; response contract is { verdict: 'SECURE' | 'REJECTED' }.
// If no provider is configured, authentication FAILS CLOSED (never auto-approves) so nothing can go live unverified.
export async function runVisionAuthenticationCheck(deck) {
    const endpoint = process.env.VISION_AI_ENDPOINT || '';
    const apiKey = process.env.VISION_AI_API_KEY || '';

    if (!endpoint || !apiKey) {
        return { verdict: 'REJECTED', reason: 'Vision authentication provider is not configured.' };
    }

    const images = [deck.artworkImageUrl, deck.silverStampImageUrl, deck.certificationImageUrl].filter(Boolean);
    if (images.length === 0) {
        return { verdict: 'REJECTED', reason: 'Missing artwork, silver stamp, or certification imagery.' };
    }

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ images, deckName: deck.name }),
        });
        if (!response.ok) return { verdict: 'REJECTED', reason: `Vision provider returned status ${response.status}.` };
        const payload = await response.json();
        return payload?.verdict === 'SECURE' ? { verdict: 'SECURE' } : { verdict: 'REJECTED', reason: payload?.reason || 'Vision provider flagged this deck.' };
    } catch (error) {
        logServerError('tarot-vision-check', error, { deckName: deck.name });
        return { verdict: 'REJECTED', reason: 'Vision authentication check failed.' };
    }
}
