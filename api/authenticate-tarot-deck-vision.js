import { createClient } from '@supabase/supabase-js';
import { logServerError } from '../server/lib/server-logger.js';

// 5 MB decoded-image cap per image, enforced on the base64 STRING LENGTH before any decoding happens.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
const OPENAI_VISION_MODEL = 'gpt-4o-mini';

function stripDataUrlPrefix(value) {
    return typeof value === 'string' ? value.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '') : '';
}

// Rejects oversized payloads by inspecting the base64 string length first — never decodes/parses
// a buffer that's already known to be too large. Returns a Buffer only once the size check passes.
function decodeImageWithSizeGuard(base64Value, label) {
    const base64 = stripDataUrlPrefix(base64Value);
    if (!base64) throw new Error(`${label} image is required.`);
    if (base64.length > MAX_BASE64_LENGTH) throw new Error(`${label} image exceeds the ${MAX_IMAGE_BYTES / (1024 * 1024)}MB size limit.`);

    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > MAX_IMAGE_BYTES) throw new Error(`${label} image exceeds the ${MAX_IMAGE_BYTES / (1024 * 1024)}MB size limit.`);
    return buffer;
}

const MIN_AUTHENTIC_CONFIDENCE_PERCENT = 70;

async function callOpenAiVision(apiKey, images) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
            model: OPENAI_VISION_MODEL,
            messages: [
                {
                    role: 'system',
                    content: [
                        'You are an expert Tarot Art Archivist and Print Quality Inspector.',
                        'Analyze the submitted tarot card images for signs of being AI-generated, a counterfeit clone, or an authentic artist deck.',
                        'Scan for: (1) ANOMALIES — mangled lines, asymmetric borders, erratic glyphs, text gibberish, or unnatural anatomy (extra fingers, floating eyes) that betray AI image generation; (2) PRINT PATTERNS — compression artifacts or poor-resolution upscaling suggesting a stolen web asset printed illegally; (3) ART STYLE CONTEXT — whether this matches a known, mass-copied commercial deck (e.g. Rider-Waite variations, popular indie decks).',
                        'Respond ONLY with compact JSON: {"verdict":"Authentic"|"Suspected AI-Generated"|"Potential Counterfeit Copy"|"Inconclusive","confidencePercent":0-100,"observations":["...","..."]}.',
                    ].join(' '),
                },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Authenticate this tarot deck submission using the artwork, silver stamp, and certification letter images below.' },
                        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${images.artwork.toString('base64')}` } },
                        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${images.silverStamp.toString('base64')}` } },
                        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${images.certification.toString('base64')}` } },
                    ],
                },
            ],
            response_format: { type: 'json_object' },
            max_tokens: 400,
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`OpenAI vision request failed (${response.status}): ${errorBody.slice(0, 200)}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenAI vision response did not include a verdict.');

    let parsed;
    try {
        parsed = JSON.parse(content);
    } catch {
        throw new Error('OpenAI vision response was not valid JSON.');
    }

    const confidencePercent = Number.isFinite(Number(parsed.confidencePercent)) ? Math.max(0, Math.min(100, Number(parsed.confidencePercent))) : 0;
    const observations = Array.isArray(parsed.observations) ? parsed.observations.filter((item) => typeof item === 'string') : [];
    const isAuthentic = parsed.verdict === 'Authentic' && confidencePercent >= MIN_AUTHENTIC_CONFIDENCE_PERCENT;

    return {
        verdict: isAuthentic ? 'SECURE' : 'REJECTED',
        reason: observations[0] || parsed.verdict,
        archivistVerdict: parsed.verdict,
        confidencePercent,
        observations,
    };
}

// Accepts three base64 images (card art, silver stamp, certification letter) and returns an
// OpenAI vision authentication verdict. Requires a signed-in seller; OPENAI_API_KEY never leaves this handler.
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const openAiApiKey = process.env.OPENAI_API_KEY || '';
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');

    if (!supabaseUrl || !supabaseServiceRoleKey || !openAiApiKey) {
        return res.status(503).json({ error: 'Tarot deck vision authentication is not configured yet.' });
    }
    if (!token) return res.status(401).json({ error: 'Sign in before submitting a deck for authentication.' });

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

        let images;
        try {
            images = {
                artwork: decodeImageWithSizeGuard(body.cardArtBase64, 'Card art'),
                silverStamp: decodeImageWithSizeGuard(body.silverStampBase64, 'Silver stamp'),
                certification: decodeImageWithSizeGuard(body.certificationLetterBase64, 'Certification letter'),
            };
        } catch (sizeError) {
            return res.status(413).json({ error: sizeError instanceof Error ? sizeError.message : 'One or more images are invalid.' });
        }

        const verdict = await callOpenAiVision(openAiApiKey, images);
        return res.status(200).json(verdict);
    } catch (error) {
        logServerError('authenticate-tarot-deck-vision', error, { userId: user.id });
        return res.status(502).json({ error: error instanceof Error ? error.message : 'Unable to complete vision authentication.' });
    }
}
