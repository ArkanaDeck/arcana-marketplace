import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), moderate: vi.fn(), initialize: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('openai', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: class extends actual.default {
        constructor(options) {
            super(options);
            mocks.initialize(options);
        }
        moderations = { create: mocks.moderate };
    } };
});

import OpenAI from 'openai';
import handler from '../../api/tarot.js';

describe('unified listing moderation gate', () => {
    let database;
    let response;
    let errorLog;
    const request = {
        method: 'POST',
        query: { action: 'submit-listing-batch' },
        headers: { authorization: 'Bearer test-session' },
        body: {
            decks: [{
                name: 'Oracle deck',
                description: 'A complete deck.',
                listingType: 'sale',
                price: 20,
                condition: 'good',
                wantsAuthentication: false,
                images: [1, 2, 3].map((number) => `https://example.supabase.co/storage/v1/object/public/listing-images/seller-123/${number}.jpg`),
            }]
        },
    };

    beforeEach(() => {
        vi.resetAllMocks();
        errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.stubEnv('OPENAI_API_KEY', 'test-moderation-key');
        vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
        database = {
            auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'seller-123' } }, error: null }) },
            from: vi.fn(() => {
                const query = {
                    insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(),
                    update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
                    single: vi.fn().mockResolvedValue({ data: { id: 'listing-or-batch' }, error: null }),
                };
                return query;
            }),
        };
        mocks.createClient.mockReturnValue(database);
        response = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('rejects flagged listings before any database writes', async () => {
        mocks.moderate.mockResolvedValue({ results: [{ flagged: true }] });
        await handler(request, response);
        expect(response.status).toHaveBeenCalledWith(422);
        expect(database.from).not.toHaveBeenCalled();
    });

    it('rejects moderation outages before any database writes', async () => {
        mocks.moderate.mockRejectedValue(new Error('Timeout'));
        await handler(request, response);
        expect(response.status).toHaveBeenCalledWith(503);
        expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'MODERATION_PROVIDER_FAILED' }));
        expect(database.from).not.toHaveBeenCalled();
    });

    it('reports missing runtime configuration separately without initializing OpenAI', async () => {
        vi.stubEnv('OPENAI_API_KEY', ' \n ');
        await handler(request, response);
        expect(response.status).toHaveBeenCalledWith(503);
        expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'MODERATION_NOT_CONFIGURED' }));
        expect(mocks.initialize).not.toHaveBeenCalled();
        expect(database.from).not.toHaveBeenCalled();
        expect(errorLog).toHaveBeenCalledWith('[arkana:tarot:moderation]', expect.stringContaining('MODERATION_NOT_CONFIGURED'));
    });

    it('fails closed and logs when client initialization fails', async () => {
        mocks.initialize.mockImplementation(() => { throw new Error('Initialization failed'); });
        await handler(request, response);
        expect(response.status).toHaveBeenCalledWith(503);
        expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'MODERATION_CLIENT_INIT_FAILED' }));
        expect(database.from).not.toHaveBeenCalled();
        expect(errorLog).toHaveBeenCalledOnce();
    });

    it('logs provider status and request ID without exposing provider messages or secrets', async () => {
        mocks.moderate.mockRejectedValue(new OpenAI.APIError(401, {
            code: 'invalid_api_key', type: 'invalid_request_error',
            message: 'Do not log test-moderation-key or private image data',
        }, undefined, new Headers({ 'x-request-id': 'req-test-123' })));
        await handler(request, response);
        expect(response.status).toHaveBeenCalledWith(503);
        expect(database.from).not.toHaveBeenCalled();
        const logged = JSON.parse(errorLog.mock.calls[0][1]);
        expect(logged).toMatchObject({
            code: 'MODERATION_PROVIDER_FAILED', providerStatus: 401,
            providerCode: 'invalid_api_key', providerRequestId: 'req-test-123',
        });
        expect(JSON.stringify(errorLog.mock.calls)).not.toMatch(/test-moderation-key|private image data/);
        expect(response.json).toHaveBeenCalledWith({
            error: 'Content moderation is unavailable. Please try again later.',
            code: 'MODERATION_PROVIDER_FAILED',
        });
    });

    it('permits normal publication only after a clear moderation decision', async () => {
        mocks.moderate.mockResolvedValue({ results: [{ flagged: false }] });
        await handler(request, response);
        expect(response.status).toHaveBeenCalledWith(200);
        expect(mocks.moderate).toHaveBeenCalledOnce();
        expect(mocks.initialize).toHaveBeenCalledWith({
            apiKey: 'test-moderation-key', timeout: 15000, maxRetries: 1,
        });
        expect(mocks.moderate.mock.invocationCallOrder[0]).toBeLessThan(database.from.mock.invocationCallOrder[0]);
        expect(database.from).toHaveBeenCalledWith('listings');
    });
});