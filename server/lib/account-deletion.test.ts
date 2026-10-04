import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), getUser: vi.fn(), storage: vi.fn(), rpc: vi.fn(), signOut: vi.fn(), code: vi.fn(), fetch: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'ios' } }));
vi.mock('../../src/lib/apple-auth', () => ({ requestAppleRevocationCode: mocks.code }));
vi.mock('../../src/lib/supabase', () => ({
    assertSupabaseConfigured: vi.fn(), getSupabaseSession: mocks.session,
    supabase: { auth: { getUser: mocks.getUser, signOut: mocks.signOut }, storage: { from: mocks.storage }, rpc: mocks.rpc },
}));

import { deleteOwnAccount } from '../../src/lib/auth';

describe('account deletion requires Apple revocation', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.session.mockResolvedValue({ user: { id: 'seller-123' }, access_token: 'test-session' });
        mocks.getUser.mockResolvedValue({ data: { user: { id: 'seller-123', identities: [{ provider: 'apple' }] } }, error: null });
        mocks.code.mockResolvedValue('fresh-apple-code');
        mocks.rpc.mockResolvedValue({ error: null });
        mocks.storage.mockReturnValue({ list: vi.fn().mockResolvedValue({ data: [], error: null }) });
        mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ revoked: true }) });
        vi.stubGlobal('fetch', mocks.fetch);
        vi.stubGlobal('localStorage', { removeItem: vi.fn() });
        vi.stubGlobal('window', {});
    });

    afterEach(() => vi.unstubAllGlobals());

    it('revokes Apple before deleting photos and calling the account deletion RPC', async () => {
        await deleteOwnAccount();
        expect(mocks.fetch).toHaveBeenCalledWith('/api/order-actions?action=revoke-apple', expect.objectContaining({
            headers: expect.objectContaining({ Authorization: 'Bearer test-session' }),
            body: JSON.stringify({ authorizationCode: 'fresh-apple-code', platform: 'ios' }),
        }));
        expect(mocks.fetch.mock.invocationCallOrder[0]).toBeLessThan(mocks.storage.mock.invocationCallOrder[0]);
        expect(mocks.storage.mock.invocationCallOrder[0]).toBeLessThan(mocks.rpc.mock.invocationCallOrder[0]);
        expect(mocks.rpc).toHaveBeenCalledWith('delete_own_account');
    });

    it('does not delete any data if Apple revocation fails', async () => {
        mocks.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'Revocation unavailable' }) });
        await expect(deleteOwnAccount()).rejects.toThrow('Revocation unavailable');
        expect(mocks.storage).not.toHaveBeenCalled();
        expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('does not delete any data if Apple authorization is cancelled', async () => {
        mocks.code.mockRejectedValue(new Error('Cancelled'));
        await expect(deleteOwnAccount()).rejects.toThrow('Cancelled');
        expect(mocks.fetch).not.toHaveBeenCalled();
        expect(mocks.storage).not.toHaveBeenCalled();
        expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('retains the existing deletion flow for accounts without Apple identities', async () => {
        mocks.getUser.mockResolvedValue({ data: { user: { id: 'seller-123', identities: [{ provider: 'email' }] } }, error: null });
        await deleteOwnAccount();
        expect(mocks.code).not.toHaveBeenCalled();
        expect(mocks.fetch).not.toHaveBeenCalled();
        expect(mocks.rpc).toHaveBeenCalledWith('delete_own_account');
    });
});