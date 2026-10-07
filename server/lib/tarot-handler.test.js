import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

import handler from '../../api/tarot.js';
import checkCard from '../../api/check-card.js';

describe('immediate listing publication', () => {
    let database;
    let query;
    let response;
    let request;
    let fetchMock;
    let errorLog;
    const images = [1, 2, 3].map((number) => `https://example.supabase.co/storage/v1/object/public/listing-images/seller-123/${number}.jpg`);
    const deck = { name: ' Oracle deck ', description: 'A complete deck.', listingType: 'sale', price: 20, condition: 'good', images };

    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubEnv('OPENAI_API_KEY', '');
        vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
        fetchMock = vi.fn(() => { throw new Error('External requests are forbidden during publication.'); });
        vi.stubGlobal('fetch', fetchMock);
        errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
        query = {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockImplementation(() => Promise.resolve({
                data: query.insert.mock.calls[0][0].map((listing, index) => ({ id: `listing-${index}`, ...listing })),
                error: null,
            })),
        };
        database = {
            auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'seller-123' } }, error: null }) },
            from: vi.fn().mockReturnValue(query),
        };
        mocks.createClient.mockReturnValue(database);
        response = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn(), end: vi.fn() };
        request = {
            method: 'POST', query: { action: 'submit-listing-batch' },
            headers: { authorization: 'Bearer test-token' }, body: { decks: [{ ...deck }] },
        };
    });

    afterEach(() => {
        expect(fetchMock).not.toHaveBeenCalled();
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it.each(['sale', 'swap', 'free'])('publishes a %s listing without credentials, fees, or pending states', async (listingType) => {
        request.body.decks[0] = { ...deck, listingType, price: listingType === 'sale' ? 20 : 0, freeDelivery: true };
        await handler(request, response);
        expect(response.status).toHaveBeenCalledWith(200);
        expect(database.from).toHaveBeenCalledExactlyOnceWith('listings');
        expect(query.insert).toHaveBeenCalledWith([expect.objectContaining({
            name: 'Oracle deck', seller_id: 'seller-123', images,
            review_status: 'approved', status: 'active', is_active: true,
            requires_manual_review: false, is_free_delivery: listingType !== 'free',
        })]);
        expect(response.json).toHaveBeenCalledWith({
            feePence: 0, requiresPayment: false,
            listings: [expect.objectContaining({ id: 'listing-0', review_status: 'approved', status: 'active' })],
        });
    });

    it('ignores obsolete AI flags and never grants an authenticity badge', async () => {
        request.body.decks[0] = {
            ...deck, wantsAuthentication: true, imagesBase64: ['old-client-image'],
            authenticated: true, is_ai_authenticated: true,
        };
        await handler(request, response);
        expect(response.status).toHaveBeenCalledWith(200);
        const saved = query.insert.mock.calls[0][0][0];
        expect(saved).not.toHaveProperty('authenticated');
        expect(saved).not.toHaveProperty('is_ai_authenticated');
        expect(saved).not.toHaveProperty('imagesBase64');
    });

    it('saves multiple listings in one insert', async () => {
        request.body.decks.push({ ...deck, name: 'Second deck' });
        await handler(request, response);
        expect(query.insert).toHaveBeenCalledOnce();
        expect(query.insert.mock.calls[0][0]).toHaveLength(2);
        expect(response.json.mock.calls[0][0].listings).toHaveLength(2);
    });

    it.each([
        { name: '' }, { name: 'x'.repeat(121) }, { name: 123 },
        { description: 'x'.repeat(2001) }, { description: {} },
        { listingType: 'invalid' }, { price: 0 }, { price: -1 },
        { price: Infinity }, { price: NaN }, { price: '20' },
        { listingType: 'swap', price: 1 }, { condition: 'invalid' },
        { images: images.slice(0, 2) }, { images: Array(7).fill(images[0]) },
        { images: ['invalid', ...images.slice(1)] },
        { images: [images[0].replace('seller-123', 'other-seller'), ...images.slice(1)] },
        { images: [images[0].replace('https:', 'http:'), ...images.slice(1)] },
        { images: [images[0].replace('seller-123/1.jpg', 'seller-123/../other/1.jpg'), ...images.slice(1)] },
        { images: [images[0].replace('https://', 'https://user:password@'), ...images.slice(1)] },
    ])('rejects invalid listing input before database writes: %j', async (changes) => {
        request.body.decks[0] = { ...deck, ...changes };
        await handler(request, response);
        expect(response.status).toHaveBeenCalledWith(400);
        expect(database.from).not.toHaveBeenCalled();
    });

    it('validates the entire batch before saving any listing', async () => {
        request.body.decks.push({ ...deck, name: '' });
        await handler(request, response);
        expect(response.status).toHaveBeenCalledWith(400);
        expect(database.from).not.toHaveBeenCalled();
    });

    it.each([{}, { decks: [] }, null, '{invalid-json'])('rejects an empty or malformed body: %j', async (body) => {
        request.body = body;
        await handler(request, response);
        expect(response.status).toHaveBeenCalledWith(400);
        expect(database.from).not.toHaveBeenCalled();
    });

    it('requires a signed-in seller', async () => {
        request.headers = {};
        await handler(request, response);
        expect(response.status).toHaveBeenCalledWith(401);
        expect(mocks.createClient).not.toHaveBeenCalled();
    });

    it('rejects an expired session', async () => {
        database.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('Expired') });
        await handler(request, response);
        expect(response.status).toHaveBeenCalledWith(401);
        expect(database.from).not.toHaveBeenCalled();
    });

    it('still requires database configuration', async () => {
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
        await handler(request, response);
        expect(response.status).toHaveBeenCalledWith(503);
        expect(mocks.createClient).not.toHaveBeenCalled();
    });

    it('reports and logs a failed database insert instead of confirming publication', async () => {
        query.select.mockResolvedValue({ data: null, error: new Error('Database unavailable') });
        await handler(request, response);
        expect(response.status).toHaveBeenCalledWith(500);
        expect(response.json).toHaveBeenCalledWith({ error: 'Unable to save your listings. Please try again.' });
        expect(errorLog).toHaveBeenCalledOnce();
    });

    it('answers the native preflight before any authentication or storage work', async () => {
        request.method = 'OPTIONS';
        request.headers.origin = 'capacitor://localhost';
        await handler(request, response);
        expect(response.status).toHaveBeenCalledWith(204);
        expect(response.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'capacitor://localhost');
        expect(mocks.createClient).not.toHaveBeenCalled();
    });

    it.each(['authenticate-vision', 'submit-batch'])('explicitly retires the old %s action', async (action) => {
        request.query.action = action;
        await handler(request, response);
        expect(response.status).toHaveBeenCalledWith(410);
        expect(mocks.createClient).not.toHaveBeenCalled();
    });

    it('explicitly retires the card verification endpoint', async () => {
        await checkCard(request, response);
        expect(response.status).toHaveBeenCalledWith(410);
        expect(mocks.createClient).not.toHaveBeenCalled();
    });
});
