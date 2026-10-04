import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), moderate: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('openai', () => ({
    default: class {
        moderations = { create: mocks.moderate };
    }
}));

import handler from '../../api/tarot.js';

describe('unified listing moderation gate', () => {
    let database;
    let response;
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

    afterEach(() => vi.unstubAllEnvs());

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
        expect(database.from).not.toHaveBeenCalled();
    });

    it('permits normal publication only after a clear moderation decision', async () => {
        mocks.moderate.mockResolvedValue({ results: [{ flagged: false }] });
        await handler(request, response);
        expect(response.status).toHaveBeenCalledWith(200);
        expect(mocks.moderate).toHaveBeenCalledOnce();
        expect(mocks.moderate.mock.invocationCallOrder[0]).toBeLessThan(database.from.mock.invocationCallOrder[0]);
        expect(database.from).toHaveBeenCalledWith('listings');
    });
});