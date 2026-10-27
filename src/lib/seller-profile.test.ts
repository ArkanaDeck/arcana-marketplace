import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('./supabase', () => ({
    supabase: { from: mocks.from },
    getSupabaseSession: vi.fn(),
}));

import { loadSellerProfile } from './seller-profile';

const sellerId = '12345678-1234-1234-abcd-123456789abc';
const profile = {
    id: sellerId, full_name: 'A seller', avatar_url: null, bio: 'Tarot collector',
    website_url: null, direct_payment_link: null,
};

function query(result: { data: unknown; error: { message: string } | null }) {
    const response = Promise.resolve(result);
    const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        returns: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue(result),
        then: response.then.bind(response),
    };
    return builder;
}

describe('public seller profile lookup', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('normalizes the route UUID and loads public fields without requiring a session', async () => {
        const profileQuery = query({ data: profile, error: null });
        const listingsQuery = query({ data: [], error: null });
        mocks.from.mockImplementation((table: string) => table === 'public_profiles' ? profileQuery : listingsQuery);

        await expect(loadSellerProfile(` ${sellerId.toUpperCase()} `)).resolves.toEqual({ profile, listings: [] });
        expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(['public_profiles', 'listings']);
        expect(profileQuery.eq).toHaveBeenCalledWith('id', sellerId);
        expect(profileQuery.select).toHaveBeenCalledWith('id, full_name, avatar_url, bio, website_url, direct_payment_link');
        expect(listingsQuery.eq).toHaveBeenCalledWith('seller_id', sellerId);
        expect(listingsQuery.eq).toHaveBeenCalledWith('is_active', true);
        expect(listingsQuery.eq).toHaveBeenCalledWith('review_status', 'approved');
        expect(listingsQuery.neq).toHaveBeenCalledWith('status', 'completed');
    });

    it('returns a profile and maps its listings', async () => {
        const listing = {
            id: 'a-deck', seller_id: sellerId, name: 'Oracle deck', price: '12.50',
            description: null, listing_type: 'sale', image: null, images: [],
            is_free_delivery: false, condition: 'good', status: 'active', review_status: 'approved',
        };
        mocks.from.mockImplementation((table: string) => query({ data: table === 'public_profiles' ? profile : [listing], error: null }));
        const result = await loadSellerProfile(sellerId);
        expect(result.profile.id).toBe(sellerId);
        expect(result.listings).toEqual([expect.objectContaining({ id: 'a-deck', sellerId, price: 12.5 })]);
    });

    it.each(['', 'undefined', 'null', 'a-seller-slug', '../profile', '12345678'])('rejects invalid route parameter %j without querying the database', async (value) => {
        await expect(loadSellerProfile(value)).rejects.toThrow('Invalid seller profile URL.');
        expect(mocks.from).not.toHaveBeenCalled();
    });

    it('only reports not found when the lookup succeeds without a profile', async () => {
        mocks.from.mockImplementation((table: string) => query({ data: table === 'public_profiles' ? null : [], error: null }));
        await expect(loadSellerProfile(sellerId)).rejects.toThrow('Seller profile not found.');
    });

    it('surfaces a database failure instead of misreporting a missing seller', async () => {
        mocks.from.mockImplementation((table: string) => query({
            data: null, error: table === 'public_profiles' ? { message: 'permission denied for view public_profiles' } : null,
        }));
        await expect(loadSellerProfile(sellerId)).rejects.toThrow('permission denied for view public_profiles');
    });

    it('surfaces listing failures rather than silently returning an empty storefront', async () => {
        mocks.from.mockImplementation((table: string) => query({
            data: table === 'public_profiles' ? profile : null,
            error: table === 'listings' ? { message: 'Unable to load seller listings.' } : null,
        }));
        await expect(loadSellerProfile(sellerId)).rejects.toThrow('Unable to load seller listings.');
    });
});
