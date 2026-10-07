import test from 'node:test';
import assert from 'node:assert/strict';
import OpenAI from 'openai';
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

test('preserves safe provider metadata and distinguishes it from a missing key', async () => {
    const cause = new OpenAI.APIError(401, {
        message: 'Sensitive provider message',
        code: 'invalid_api_key',
        type: 'invalid_request_error',
    }, undefined, new Headers({ 'x-request-id': 'req-test-123' }));
    await assert.rejects(moderateListingBatch([deck], options(async () => { throw cause; })), (error) => {
        assert.equal(error.code, 'MODERATION_PROVIDER_FAILED');
        assert.equal(error.cause, cause);
        assert.deepEqual(error.diagnostics, {
            providerStatus: 401,
            providerCode: 'invalid_api_key',
            providerType: 'invalid_request_error',
            providerRequestId: 'req-test-123',
            providerFailure: 'api',
        });
        assert.doesNotMatch(error.message, /Sensitive/);
        return hasStatus(503)(error);
    });
});

test('identifies SDK connection timeouts', async () => {
    await assert.rejects(moderateListingBatch([deck], options(async () => {
        throw new OpenAI.APIConnectionTimeoutError();
    })), (error) => {
        assert.equal(error.code, 'MODERATION_PROVIDER_FAILED');
        assert.equal(error.diagnostics.providerFailure, 'timeout');
        return hasStatus(503)(error);
    });
});

test('reads the runtime key and sends the expected JSON through the real SDK', async (t) => {
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = '  test-runtime-key \n';
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async (input, init) => {
        const request = new Request(input, init);
        calls += 1;
        assert.equal(request.method, 'POST');
        assert.equal(new URL(request.url).pathname, '/v1/moderations');
        assert.equal(request.headers.get('authorization'), 'Bearer test-runtime-key');
        assert.match(request.headers.get('content-type'), /application\/json/);
        assert.deepEqual(await request.json(), {
            model: 'omni-moderation-latest',
            input: [
                { type: 'text', text: `${deck.name}\n${deck.description}` },
                ...deck.images.map((url) => ({ type: 'image_url', image_url: { url } })),
            ],
        });
        return new Response(JSON.stringify({ results: [{ flagged: false }] }), {
            headers: { 'content-type': 'application/json' },
        });
    });
    try {
        await moderateListingBatch([deck], { supabaseUrl, userId });
        assert.equal(calls, 1);
    } finally {
        if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = previousKey;
    }
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
        for (const value of [undefined, '', ' \n ']) {
            if (value === undefined) delete process.env.OPENAI_API_KEY;
            else process.env.OPENAI_API_KEY = value;
            await assert.rejects(moderateListingBatch([deck], { supabaseUrl, userId }), (error) => {
                assert.equal(error.code, 'MODERATION_NOT_CONFIGURED');
                return hasStatus(503)(error);
            });
        }
    } finally {
        if (previousKey !== undefined) process.env.OPENAI_API_KEY = previousKey;
    }
});