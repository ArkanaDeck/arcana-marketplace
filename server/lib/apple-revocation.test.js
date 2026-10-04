import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { AppleRevocationError, revokeAppleAuthorization } from './apple-revocation.js';

const signing = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const apple = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const user = { identities: [{ provider: 'apple', identity_data: { sub: 'apple-user-123' } }] };
const clientId = 'com.arkcards.app';
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

function idToken(overrides = {}) {
    const now = Math.floor(Date.now() / 1000);
    const input = `${encode({ alg: 'RS256', kid: 'test-apple-key' })}.${encode({ iss: 'https://appleid.apple.com', aud: clientId, sub: 'apple-user-123', exp: now + 600, iat: now, ...overrides })}`;
    return `${input}.${crypto.sign('RSA-SHA256', Buffer.from(input), apple.privateKey).toString('base64url')}`;
}

function fakeApple({ claims = {}, revokeOk = true, exchangeOk = true, includeRefresh = true } = {}) {
    const calls = [];
    return {
        calls,
        fetchImpl: async (url, init) => {
            calls.push({ url, init });
            if (url.endsWith('/auth/token')) return { ok: exchangeOk, json: async () => ({ id_token: idToken(claims), ...(includeRefresh ? { refresh_token: 'test-refresh' } : { access_token: 'test-access' }) }) };
            if (url.endsWith('/auth/keys')) return { ok: true, json: async () => ({ keys: [{ ...apple.publicKey.export({ format: 'jwk' }), kid: 'test-apple-key' }] }) };
            if (url.endsWith('/auth/revoke')) return { ok: revokeOk };
            assert.fail('Unexpected Apple endpoint');
        },
    };
}

test('Apple account revocation', async (parent) => {
    const names = ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY', 'APPLE_WEB_CLIENT_ID'];
    const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    process.env.APPLE_TEAM_ID = 'TESTTEAM';
    process.env.APPLE_KEY_ID = 'TESTKEY';
    process.env.APPLE_PRIVATE_KEY = signing.privateKey.export({ format: 'pem', type: 'pkcs8' });
    process.env.APPLE_WEB_CLIENT_ID = clientId;
    try {
        await parent.test('exchanges a fresh authorization code, verifies ownership, then revokes', async () => {
            const api = fakeApple();
            assert.deepEqual(await revokeAppleAuthorization(user, { platform: 'ios', authorizationCode: 'test-code' }, api), { revoked: true, required: true });
            assert.deepEqual(api.calls.map((call) => new URL(call.url).pathname), ['/auth/token', '/auth/keys', '/auth/revoke']);
            const exchange = new URLSearchParams(api.calls[0].init.body);
            assert.equal(exchange.get('grant_type'), 'authorization_code');
            assert.equal(exchange.get('code'), 'test-code');
            const secret = exchange.get('client_secret');
            const [header, payload, signature] = secret.split('.');
            assert.equal(JSON.parse(Buffer.from(header, 'base64url')).alg, 'ES256');
            assert.equal(JSON.parse(Buffer.from(payload, 'base64url')).sub, clientId);
            assert.equal(crypto.verify('sha256', Buffer.from(`${header}.${payload}`), { key: signing.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')), true);
            const revoke = new URLSearchParams(api.calls[2].init.body);
            assert.equal(revoke.get('token'), 'test-refresh');
            assert.equal(revoke.get('token_type_hint'), 'refresh_token');
        });
        await parent.test('validates a browser refresh token before revoking it', async () => {
            const api = fakeApple({ includeRefresh: false });
            await revokeAppleAuthorization(user, { platform: 'web', refreshToken: 'original-refresh' }, api);
            assert.equal(new URLSearchParams(api.calls[0].init.body).get('grant_type'), 'refresh_token');
            assert.equal(new URLSearchParams(api.calls[2].init.body).get('token'), 'original-refresh');
        });
        await parent.test('does not revoke another user or an expired/wrong-audience credential', async () => {
            for (const claims of [{ sub: 'other-user' }, { exp: 1 }, { aud: 'other-client' }]) {
                const api = fakeApple({ claims });
                await assert.rejects(revokeAppleAuthorization(user, { platform: 'ios', authorizationCode: 'test-code' }, api), (error) => error instanceof AppleRevocationError && error.statusCode === 403);
                assert.equal(api.calls.some((call) => call.url.endsWith('/auth/revoke')), false);
            }
        });
        await parent.test('fails closed when token exchange or revocation fails', async () => {
            for (const options of [{ exchangeOk: false }, { revokeOk: false }]) {
                await assert.rejects(revokeAppleAuthorization(user, { platform: 'ios', authorizationCode: 'test-code' }, fakeApple(options)), AppleRevocationError);
            }
        });
        await parent.test('skips Apple endpoints for accounts without an Apple identity', async () => {
            const api = fakeApple();
            assert.deepEqual(await revokeAppleAuthorization({ identities: [{ provider: 'email' }] }, {}, api), { revoked: false, required: false });
            assert.equal(api.calls.length, 0);
        });
        await parent.test('blocks missing authorization without issuing requests', async () => {
            const api = fakeApple();
            await assert.rejects(revokeAppleAuthorization(user, { platform: 'ios' }, api), (error) => error.statusCode === 400);
            assert.equal(api.calls.length, 0);
        });
        await parent.test('blocks missing server signing configuration', async () => {
            delete process.env.APPLE_PRIVATE_KEY;
            const api = fakeApple();
            await assert.rejects(revokeAppleAuthorization(user, { platform: 'ios', authorizationCode: 'test-code' }, api), (error) => error.statusCode === 503);
            assert.equal(api.calls.length, 0);
        });
    } finally {
        for (const name of names) {
            if (saved[name] === undefined) delete process.env[name];
            else process.env[name] = saved[name];
        }
    }
});