import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    session: vi.fn(), upload: vi.fn(), publicUrl: vi.fn(), remove: vi.fn(),
}));
vi.mock('./supabase', () => ({
    getSupabaseSession: mocks.session,
    supabase: { storage: { from: () => ({ upload: mocks.upload, getPublicUrl: mocks.publicUrl, remove: mocks.remove }) } },
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('./app-store-purchase', () => ({ isIosApp: () => true, acknowledgeDriveTrafficFulfillment: vi.fn() }));

import { publishListingBundle, type CreateListingInput } from './listings';

describe('standard listing publish request', () => {
    const fetchMock = vi.fn();
    const listing = {
        id: 'listing-123', seller_id: 'seller-123', name: 'Oracle deck', price: 20,
        description: null, listing_type: 'sale', image: null, images: [],
        is_free_delivery: false, condition: 'good', review_status: 'approved', status: 'active',
    };
    let input: CreateListingInput;

    beforeEach(() => {
        vi.resetAllMocks();
        mocks.session.mockResolvedValue({ user: { id: 'seller-123' }, access_token: 'test-token' });
        mocks.upload.mockResolvedValue({ error: null });
        mocks.publicUrl.mockImplementation((path: string) => ({
            data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/listing-images/${path}` },
        }));
        mocks.remove.mockResolvedValue({ error: null });
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ requiresPayment: false, feePence: 0, listings: [listing] })));
        vi.stubGlobal('fetch', fetchMock);
        vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 100, height: 100 }));
        vi.stubGlobal('document', {
            createElement: () => ({
                getContext: () => ({ drawImage: vi.fn() }),
                toBlob: (callback: (blob: Blob) => void) => callback(new Blob(['image'], { type: 'image/jpeg' })),
            }),
        });
        input = {
            name: 'Oracle deck', price: 20, listingType: 'sale', condition: 'good', freeDelivery: false,
            imageFiles: [1, 2, 3].map((number) => new File(['image'], `${number}.jpg`, { type: 'image/jpeg' })),
        };
    });

    afterEach(() => { vi.unstubAllGlobals(); });

    it('uploads images and publishes without a verification or fee-checkout request on iOS', async () => {
        const result = await publishListingBundle(input);
        expect(result.requiresPayment).toBe(false);
        expect(mocks.upload).toHaveBeenCalledTimes(3);
        expect(fetchMock).toHaveBeenCalledOnce();
        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe('/api/tarot?action=submit-listing-batch');
        expect(options.method).toBe('POST');
        expect(options.headers.Authorization).toBe('Bearer test-token');
        const deck = JSON.parse(options.body).decks[0];
        expect(deck.images).toHaveLength(3);
        expect(deck).not.toHaveProperty('wantsAuthentication');
        expect(deck).not.toHaveProperty('imagesBase64');
        expect(mocks.remove).not.toHaveBeenCalled();
    });

    it('surfaces database errors and removes the uncommitted uploads', async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Unable to save your listings.' }), { status: 500 }));
        await expect(publishListingBundle(input)).rejects.toThrow('Unable to save your listings.');
        expect(mocks.remove).toHaveBeenCalledWith(expect.arrayContaining([expect.stringContaining('seller-123/')]));
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('does not start a fee checkout when an outdated backend requests payment', async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ requiresPayment: true, batchId: 'old-batch' })));
        await expect(publishListingBundle(input)).rejects.toThrow('The server did not confirm publication.');
        expect(fetchMock).toHaveBeenCalledOnce();
    });
});
