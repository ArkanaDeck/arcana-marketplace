import { logServerError } from './server-logger.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MIN_CONFIDENCE = 70;
const VERIFICATION_PROMPT = `Analyze this image containing tarot cards. Perform two checks:
- Authenticity: Ensure this is a real photograph of physical tarot cards, not a generic screenshot, promotional stock image, or digital render.
- Identification: Match the visible card faces to cross-reference known decks if possible.
Respond with a clean JSON format: { verified: boolean, confidence: number, reasoning: string }`;

function stripDataUrlPrefix(value) {
    return typeof value === 'string' ? value.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '') : '';
}

function decodeBase64Image(value, label) {
    const encoded = stripDataUrlPrefix(value);
    if (!encoded) throw new Error(`${label} image is missing.`);
    if (encoded.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) throw new Error(`${label} image exceeds the 5MB limit.`);
    const buffer = Buffer.from(encoded, 'base64');
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) throw new Error(`${label} image exceeds the 5MB limit or is invalid.`);
    return buffer;
}

async function imageToDataUrl(image, label) {
    if (typeof image === 'string' && /^data:image\//i.test(image)) {
        const buffer = decodeBase64Image(image, label);
        return `data:image/jpeg;base64,${buffer.toString('base64')}`;
    }
    if (typeof image === 'string' && /^https?:\/\//i.test(image)) {
        const response = await fetch(image);
        if (!response.ok) throw new Error(`Unable to download ${label} image.`);
        const contentLength = Number(response.headers.get('content-length') || 0);
        if (contentLength > MAX_IMAGE_BYTES) throw new Error(`${label} image exceeds the 5MB limit.`);
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) throw new Error(`${label} image exceeds the 5MB limit or is invalid.`);
        const contentType = response.headers.get('content-type')?.startsWith('image/') ? response.headers.get('content-type') : 'image/jpeg';
        return `data:${contentType};base64,${buffer.toString('base64')}`;
    }
    throw new Error(`${label} image must be a base64 image or HTTPS URL.`);
}

function parseVerificationResponse(payload) {
    const raw = payload?.verified !== undefined ? payload : payload?.result || payload?.data || payload?.output;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const verified = parsed?.verified === true;
    const confidence = Math.max(0, Math.min(100, Number(parsed?.confidence) || 0));
    const reasoning = typeof parsed?.reasoning === 'string' && parsed.reasoning.trim()
        ? parsed.reasoning.trim()
        : 'The vision provider did not provide a verification reason.';
    return { verified, confidence, reasoning, authenticated: verified && confidence >= MIN_CONFIDENCE };
}

/**
 * Sends one listing's uploaded images to the configured vision provider.
 * Provider secrets are read only from process.env and never returned to the client.
 */
export async function verifyCardListingImages(deck) {
    const endpoint = process.env.VISION_AI_ENDPOINT || '';
    const apiKey = process.env.VISION_AI_API_KEY || '';
    if (!endpoint || !apiKey) return { verified: false, confidence: 0, authenticated: false, reasoning: 'Vision authentication is not configured.' };

    try {
        const imageInputs = [
            ...(Array.isArray(deck.imagesBase64) ? deck.imagesBase64 : []),
            ...(Array.isArray(deck.images) ? deck.images : []),
            deck.cardArtBase64,
            deck.silverStampBase64,
            deck.certificationLetterBase64,
        ].filter(Boolean).slice(0, 5);
        if (imageInputs.length === 0) return { verified: false, confidence: 0, authenticated: false, reasoning: 'At least one card image is required for authentication.' };

        const images = await Promise.all(imageInputs.map((image, index) => imageToDataUrl(image, `Card image ${index + 1}`)));
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: process.env.VISION_AI_MODEL || undefined,
                prompt: VERIFICATION_PROMPT,
                images,
                deckName: deck.name,
            }),
        });
        if (!response.ok) return { verified: false, confidence: 0, authenticated: false, reasoning: `Vision provider returned HTTP ${response.status}.` };
        return parseVerificationResponse(await response.json());
    } catch (error) {
        logServerError('card-listing-vision', error, { deckName: deck.name });
        return { verified: false, confidence: 0, authenticated: false, reasoning: error instanceof Error ? error.message : 'Vision verification failed.' };
    }
}

export { MIN_CONFIDENCE, VERIFICATION_PROMPT };
