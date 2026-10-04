import test from 'node:test';
import assert from 'node:assert/strict';
import { ListingModerationError, moderateListingBatch } from './listing-moderation.js';

const supabaseUrl = 'https://example.supabase.co';
const userId = 'seller-123';
const deck = {
    name: 'Oracle deck',
    description: 'A complete deck in good condition.',
    images: [1, 2, 3].map((number) => `${supabaseUrl}/storage/v1/object/public/listing-images/${userId}/${number}.jpg`),
    wantsAuthentication: false,
};
const options = (create) => ({ supabaseUrl, userId, client: { moderations: { create } } });
const hasStatus = (statusCode) => (error) => error instanceof ListingModerationError && error.statusCode === statusCode;

test('moderates text and every image even when authenticity is disabled', async () => {
    let request;
    await moderateListingBatch([deck], options(async (input) => {
        request = input;
        return { results: [{ flagged: false }] };
    }));
    assert.equal(request.model, 'omni-moderation-latest');
    assert.equal(request.input[0].text, `${deck.name}\n${deck.description}`);
    assert.deepEqual(request.input.slice(1).map((input) => input.image_url.url), deck.images);
});

test('rejects flagged content', async () => {
    await assert.rejects(moderateListingBatch([deck], options(async () => ({ results: [{ flagged: true }] }))), hasStatus(422));
});

test('checks later listings in the batch before permitting publication', async () => {
    let calls = 0;
    await assert.rejects(moderateListingBatch([deck, deck], options(async () => ({ results: [{ flagged: ++calls === 2 }] }))), hasStatus(422));
    assert.equal(calls, 2);
});

test('fails closed on provider errors', async () => {
    await assert.rejects(moderateListingBatch([deck], options(async () => { throw new Error('Provider unavailable'); })), hasStatus(503));
});

test('fails closed on missing or malformed moderation decisions', async () => {
    for (const result of [undefined, {}, { results: [] }, { results: [{ flagged: 'false' }] }]) {
        await assert.rejects(moderateListingBatch([deck], options(async () => result)), hasStatus(503));
    }
});

test('rejects foreign, insecure, and path-traversal image URLs before calling the provider', async () => {
    for (const image of ['https://foreign.example/image.jpg', deck.images[0].replace('https:', 'http:'), `${supabaseUrl}/storage/v1/object/public/listing-images/${userId}/../other/image.jpg`]) {
        await assert.rejects(moderateListingBatch([{ ...deck, images: [image, ...deck.images.slice(1)] }], options(async () => {
            assert.fail('Moderation provider must not receive untrusted URLs');
        })), hasStatus(400));
    }
});

test('fails closed when no moderation API key is configured', async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
        await assert.rejects(moderateListingBatch([deck], { supabaseUrl, userId }), hasStatus(503));
    } finally {
        if (previousKey !== undefined) process.env.OPENAI_API_KEY = previousKey;
    }
});