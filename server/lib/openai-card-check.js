import OpenAI from 'openai';
import { logServerError } from './server-logger.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
const VERIFICATION_PROMPT = 'Analyze this photograph of tarot cards. Verify if this is an authentic, physical deck of cards rather than a screenshot or digital asset. Identify the deck if possible. Return response in strict JSON: { verified: boolean, confidence: number, reasoning: string }';

function decodeImage(base64Value) {
    const encoded = String(base64Value || '').replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '');
    if (!encoded) throw new Error('A tarot card image is required.');
    if (encoded.length > MAX_BASE64_LENGTH) throw new Error('The tarot card image exceeds the 5MB limit.');
    const buffer = Buffer.from(encoded, 'base64');
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new Error('The tarot card image is invalid or exceeds the 5MB limit.');
    return buffer;
}

export async function verifyCardImageWithOpenAI(imageBase64) {
    const apiKey = process.env.OPENAI_API_KEY || '';
    if (!apiKey) return { verified: false, confidence: 0, authenticated: false, reasoning: 'Card verification is not configured.' };
    try {
        const image = decodeImage(imageBase64);
        const client = new OpenAI({ apiKey });
        const response = await client.chat.completions.create({
            model: 'gpt-4o-mini',
            response_format: { type: 'json_object' },
            messages: [{
                role: 'user', content: [
                    { type: 'text', text: VERIFICATION_PROMPT },
                    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image.toString('base64')}` } },
                ]
            }],
            max_tokens: 300,
        });
        const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
        const confidence = Math.max(0, Math.min(100, Number(parsed?.confidence) || 0));
        const reasoning = typeof parsed?.reasoning === 'string' && parsed.reasoning.trim() ? parsed.reasoning.trim() : 'The vision model did not provide a reason.';
        return { verified: parsed?.verified === true, confidence, authenticated: parsed?.verified === true && confidence >= 70, reasoning };
    } catch (error) {
        logServerError('openai-card-check', error);
        return { verified: false, confidence: 0, authenticated: false, reasoning: error instanceof Error ? error.message : 'Card verification failed.' };
    }
}
