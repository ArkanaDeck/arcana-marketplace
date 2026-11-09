import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    session: vi.fn(), upload: vi.fn(), publicUrl: vi.fn(), remove: vi.fn(), from: vi.fn(),
}));
vi.mock('./supabase', () => ({
    getSupabaseSession: mocks.session,
    supabase: { from: mocks.from, storage: { from: () => ({ upload: mocks.upload, getPublicUrl: mocks.publicUrl, remove: mocks.remove }) } },
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('./app-store-purchase', () => ({ isIosApp: () => true, acknowledgeDriveTrafficFulfillment: vi.fn() }));

import { loadListings, loadPublishedListings, mapListing, publishListingBundle, type CreateListingInput, type ListingRow } from './listings';

function listingQuery(data: unknown, error: { message: string } | null = null) {
    const response = Promise.resolve({ data, error });
    return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        returns: vi.fn().mockReturnThis(),
        then: response.then.bind(response),
    };
}

describe.each([loadListings, loadPublishedListings])('seller premium status in $name', (load) => {
    const listing: ListingRow = {
        id: 'listing-1', seller_id: 'seller-1', name: 'Oracle deck', price: 20,
        description: null, listing_type: 'sale', image: null, images: [],
        is_free_delivery: false, condition: 'good', status: 'active', review_status: 'approved',
    };

    beforeEach(() => { vi.resetAllMocks(); });

    it('batches unique public seller lookups and badges all listings without granting store links', async () => {
        const listings = listingQuery([
            listing, { ...listing, id: 'listing-2' },
            { ...listing, id: 'listing-3', seller_id: 'seller-2' },
        ]);
        const profiles = listingQuery([{ id: 'seller-1', is_premium: true }, { id: 'seller-2', is_premium: false }]);
        mocks.from.mockImplementation((table: string) => table === 'listings' ? listings : profiles);

        const result = await load();

        expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(['listings', 'public_profiles']);
        expect(profiles.select).toHaveBeenCalledWith('id, is_premium');
        expect(profiles.in).toHaveBeenCalledWith('id', ['seller-1', 'seller-2']);
        expect(result.map((item) => item.sellerIsPremium)).toEqual([true, true, false]);
        expect(result.every((item) => !item.isPremium && !item.externalStoreUrl)).toBe(true);
        expect(listings.neq).toHaveBeenCalledWith('status', 'completed');
        expect(listings.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('does not badge a listing whose seller has no public profile', async () => {
        mocks.from.mockImplementation((table: string) => listingQuery(table === 'listings' ? [listing] : []));
        expect((await load())[0].sellerIsPremium).toBe(false);
    });

    it('still loads the feed without badges when the seller lookup fails', async () => {
        mocks.from.mockImplementation((table: string) => table === 'listings' ? listingQuery([listing]) : listingQuery(null, { message: 'permission denied' }));
        const result = await load();
        expect(result.map((item) => [item.id, item.sellerIsPremium])).toEqual([['listing-1', false]]);
    });

    it('skips seller queries for an empty feed', async () => {
        mocks.from.mockReturnValue(listingQuery([]));
        await expect(load()).resolves.toEqual([]);
        expect(mocks.from).toHaveBeenCalledOnce();
    });

    it('preserves the existing feed ordering and public visibility filters', async () => {
        const listings = listingQuery([
            { ...listing, id: 'swap', listing_type: 'swap' },
            { ...listing, id: 'free', listing_type: 'free' },
            { ...listing, id: 'sale' },
        ]);
        mocks.from.mockImplementation((table: string) => table === 'listings' ? listings : listingQuery([]));
        const result = await load();
        expect(result.map((item) => item.id)).toEqual(load === loadPublishedListings ? ['sale', 'swap', 'free'] : ['swap', 'free', 'sale']);
        if (load === loadPublishedListings) {
            expect(listings.eq).toHaveBeenCalledWith('is_active', true);
            expect(listings.eq).toHaveBeenCalledWith('review_status', 'approved');
        }
    });

    it('preserves listing query errors and does not fetch sellers after failure', async () => {
        mocks.from.mockReturnValue(listingQuery(null, { message: 'Listings lookup failed.' }));
        await expect(load()).rejects.toThrow('Listings lookup failed.');
        expect(mocks.from).toHaveBeenCalledOnce();
    });

    it('keeps individual listing promotion expiry independent of the seller badge', () => {
        const promoted = { ...listing, external_store_url: 'https://shop.example.com', external_link_active: true };
        expect(mapListing({ ...promoted, external_link_expires_at: '2000-01-01T00:00:00Z' }).isPremium).toBe(false);
        expect(mapListing({ ...promoted, external_link_expires_at: '2999-01-01T00:00:00Z' }).isPremium).toBe(true);
    });
});

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
