import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    createClient: vi.fn(), verify: vi.fn(), fulfill: vi.fn(), platform: vi.fn(), postMessage: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: mocks.platform } }));
vi.mock('./app-store-transaction.js', () => ({
    DRIVE_TRAFFIC_PRODUCT_ID: 'com.arkcards.app.drivetraffic', verifyAppStoreTransaction: mocks.verify,
}));
vi.mock('./premium-listing.js', () => ({ createPremiumListingFromSession: mocks.fulfill }));

import handler from '../../api/billing.js';
import { acknowledgeDriveTrafficFulfillment } from '../../src/lib/app-store-purchase';

describe('StoreKit durable fulfillment acknowledgement', () => {
    const request = {
        method: 'POST', query: { product: 'premium-listing-iap' },
        headers: { authorization: 'Bearer test-session', 'x-arkana-platform': 'ios', origin: 'capacitor://localhost' },
        body: {
            signed_transaction: 'test-receipt', title: 'Oracle deck', direct_payment_link: 'https://shop.example.com',
            image_urls: ['https://example.supabase.co/storage/v1/object/public/listing-images/seller-123/image.jpg'],
        },
    };
    let response: { setHeader: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
        mocks.createClient.mockReturnValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'seller-123' } }, error: null }) } });
        mocks.verify.mockReturnValue({ transactionId: '123456' });
        mocks.platform.mockReturnValue('ios');
        vi.stubGlobal('window', { webkit: { messageHandlers: { arkCardsPurchase: { postMessage: mocks.postMessage } } } });
        response = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
    });

    afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

    it('does not confirm fulfillment until the database operation resolves successfully', async () => {
        let resolveFulfillment!: (listing: { id: string; seller_id: string }) => void;
        mocks.fulfill.mockReturnValue(new Promise((resolve) => { resolveFulfillment = resolve; }));
        const pending = handler(request, response);
        await vi.waitFor(() => expect(mocks.fulfill).toHaveBeenCalledOnce());
        expect(response.json).not.toHaveBeenCalled();
        const listing = { id: 'listing-123', seller_id: 'seller-123' };
        resolveFulfillment(listing);
        await pending;
        expect(response.status).toHaveBeenCalledWith(200);
        expect(response.json).toHaveBeenCalledWith({ listing, fulfilledTransactionId: '123456' });
    });

    it('does not confirm failed database fulfillment', async () => {
        mocks.fulfill.mockRejectedValue(new Error('Database unavailable'));
        await handler(request, response);
        expect(response.status).toHaveBeenCalledWith(500);
        expect(response.json.mock.calls[0][0]).not.toHaveProperty('fulfilledTransactionId');
    });

    it('fulfills a verified promotion without AI credentials even when an old client requests a check', async () => {
        vi.stubEnv('OPENAI_API_KEY', '');
        const listing = { id: 'listing-123', seller_id: 'seller-123' };
        mocks.fulfill.mockResolvedValue(listing);
        await handler({ ...request, body: { ...request.body, wants_authentication: true } }, response);
        expect(response.status).toHaveBeenCalledWith(200);
        expect(mocks.verify).toHaveBeenCalledOnce();
        expect(mocks.fulfill.mock.calls[0][1].metadata).not.toHaveProperty('ai_authenticated');
        expect(response.json).toHaveBeenCalledWith({ listing, fulfilledTransactionId: '123456' });
    });

    it('does not confirm a receipt rejected by verification', async () => {
        mocks.verify.mockImplementation(() => { throw new Error('Invalid receipt'); });
        await handler(request, response);
        expect(response.status).toHaveBeenCalledWith(402);
        expect(mocks.fulfill).not.toHaveBeenCalled();
        expect(response.json.mock.calls[0][0]).not.toHaveProperty('fulfilledTransactionId');
    });

    it('sends the confirmed transaction identifier to the native finish handler', () => {
        acknowledgeDriveTrafficFulfillment('123456');
        expect(mocks.postMessage).toHaveBeenCalledExactlyOnceWith({ action: 'fulfilled', transactionId: '123456' });
    });

    it('does not acknowledge purchases from a web platform', () => {
        mocks.platform.mockReturnValue('web');
        acknowledgeDriveTrafficFulfillment('123456');
        expect(mocks.postMessage).not.toHaveBeenCalled();
    });
});