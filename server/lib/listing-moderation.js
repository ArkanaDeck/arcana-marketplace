import OpenAI from 'openai';

export class ListingModerationError extends Error {
    constructor(message, statusCode, { code = 'LISTING_MODERATION_ERROR', cause, diagnostics = {} } = {}) {
        super(message, { cause });
        this.name = 'ListingModerationError';
        this.statusCode = statusCode;
        this.code = code;
        this.diagnostics = diagnostics;
    }
}

export async function moderateListingBatch(decks, { supabaseUrl, userId, client } = {}) {
    const apiKey = (process.env.OPENAI_API_KEY || '').trim();
    if (!client && !apiKey) {
        throw new ListingModerationError('Content moderation is unavailable. Please try again later.', 503, {
            code: 'MODERATION_NOT_CONFIGURED',
        });
    }
    let moderationClient;
    try {
        moderationClient = client || new OpenAI({ apiKey, timeout: 15000, maxRetries: 1 });
    } catch (cause) {
        throw new ListingModerationError('Content moderation is unavailable. Please try again later.', 503, {
            code: 'MODERATION_CLIENT_INIT_FAILED', cause,
        });
    }
    const imagePrefix = `${String(supabaseUrl || '').replace(/\/$/, '')}/storage/v1/object/public/listing-images/${userId}/`;

    for (const deck of decks) {
        if (typeof deck.name !== 'string' || deck.name.trim().length > 120
            || (deck.description != null && (typeof deck.description !== 'string' || deck.description.length > 2000))) {
            throw new ListingModerationError('Listing names must be at most 120 characters and descriptions at most 2,000 characters.', 400);
        }
        const images = deck.images;
        if (!Array.isArray(images) || images.length < 3 || images.length > 6) {
            throw new ListingModerationError('Each listing needs between 3 and 6 uploaded images.', 400);
        }
        for (const image of images) {
            let url;
            try { url = new URL(image); } catch {
                throw new ListingModerationError('Use images uploaded to your own listing storage.', 400);
            }
            if (typeof image !== 'string' || !supabaseUrl || !userId || url.protocol !== 'https:'
                || url.username || url.password || !url.href.startsWith(imagePrefix)) {
                throw new ListingModerationError('Use images uploaded to your own listing storage.', 400);
            }
        }

        let response;
        try {
            response = await moderationClient.moderations.create({
                model: 'omni-moderation-latest',
                input: [
                    { type: 'text', text: `${deck.name.trim()}\n${deck.description || ''}` },
                    ...images.map((image) => ({ type: 'image_url', image_url: { url: image } })),
                ],
            });
        } catch (cause) {
            // Provider messages can contain credentials or submitted content; log only metadata.
            const diagnostics = cause instanceof OpenAI.APIError ? {
                providerStatus: cause.status,
                providerCode: cause.code,
                providerType: cause.type,
                providerRequestId: cause.requestID,
                providerFailure: cause instanceof OpenAI.APIConnectionTimeoutError ? 'timeout'
                    : cause instanceof OpenAI.APIConnectionError ? 'connection' : 'api',
            } : { providerFailure: 'unexpected' };
            throw new ListingModerationError('Content moderation is unavailable. Please try again later.', 503, {
                code: 'MODERATION_PROVIDER_FAILED', cause, diagnostics,
            });
        }

        if (!Array.isArray(response?.results) || response.results.length !== 1
            || typeof response.results[0]?.flagged !== 'boolean') {
            throw new ListingModerationError('Content moderation could not be completed. Please try again later.', 503, {
                code: 'MODERATION_INVALID_RESPONSE',
            });
        }
        if (response.results[0].flagged) {
            throw new ListingModerationError('A listing does not meet our community content guidelines. Update its text or images before publishing.', 422);
        }
    }
}