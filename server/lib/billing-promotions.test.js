import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), checkout: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('stripe', () => ({
    default: class {
        checkout = { sessions: { create: mocks.checkout } };
    },
}));

import handler from '../../api/billing.js';

describe('paid store-link promotions without AI verification', () => {
    let response;
    let request;
    let fetchMock;

    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubEnv('OPENAI_API_KEY', '');
        vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_promotion');
        vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
        fetchMock = vi.fn(() => { throw new Error('Unexpected external fetch'); });
        vi.stubGlobal('fetch', fetchMock);
        mocks.createClient.mockReturnValue({
            auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'seller-123' } }, error: null }) },
        });
        mocks.checkout.mockResolvedValue({ id: 'cs_test_promotion', url: 'https://checkout.stripe.com/test' });
        response = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
        request = {
            method: 'POST', query: { product: 'premium-listing' },
            headers: { authorization: 'Bearer test-token' },
            body: {
                title: 'Oracle deck', direct_payment_link: 'https://shop.example.com',
                image_urls: ['https://example.supabase.co/storage/v1/object/public/listing-images/seller-123/1.jpg'],
                wants_authentication: true,
            },
        };
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it('retains the £2 Stripe checkout and ignores obsolete AI flags', async () => {
        await handler(request, response);
        expect(response.status).toHaveBeenCalledWith(200);
        const checkout = mocks.checkout.mock.calls[0][0];
        expect(checkout.line_items[0].price_data.unit_amount).toBe(200);
        expect(checkout.metadata.product).toBe('premium_listing');
        expect(checkout.metadata).not.toHaveProperty('ai_authenticated');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('still rejects invalid store links', async () => {
        request.body.direct_payment_link = 'not-a-url';
        await handler(request, response);
        expect(response.status).toHaveBeenCalledWith(400);
        expect(mocks.checkout).not.toHaveBeenCalled();
    });
});
