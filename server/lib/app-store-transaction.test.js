import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { DRIVE_TRAFFIC_PRODUCT_ID, verifyAppStoreTransaction } from './app-store-transaction.js';
import { createPremiumListingFromSession } from './premium-listing.js';

const USER_ID = '6b1f0c2e-6a0d-4c3b-9f53-0a3d2c1b7e44';

// Builds a throwaway root -> intermediate -> leaf chain carrying Apple's App Store marker OIDs.
function createTestChain() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appstore-test-'));
    const file = (name) => path.join(dir, name);
    const openssl = (...args) => execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' });
    fs.writeFileSync(file('c.cnf'), [
        '[req]', 'distinguished_name=dn', '[dn]',
        '[v3_ca]', 'basicConstraints=critical,CA:TRUE', 'keyUsage=critical,keyCertSign',
        '[v3_int]', 'basicConstraints=critical,CA:TRUE', 'keyUsage=critical,keyCertSign', '1.2.840.113635.100.6.2.1=ASN1:NULL',
        '[v3_leaf]', 'basicConstraints=critical,CA:FALSE', '1.2.840.113635.100.6.11.1=ASN1:NULL',
    ].join('\n'));
    for (const name of ['root', 'int', 'leaf']) openssl('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', `${name}.key`);
    openssl('req', '-x509', '-new', '-key', 'root.key', '-subj', '/CN=Test Root', '-days', '2', '-config', 'c.cnf', '-extensions', 'v3_ca', '-out', 'root.pem');
    for (const [name, issuer, extensions] of [['int', 'root', 'v3_int'], ['leaf', 'int', 'v3_leaf']]) {
        openssl('req', '-new', '-key', `${name}.key`, '-subj', `/CN=Test ${name}`, '-config', 'c.cnf', '-out', `${name}.csr`);
        openssl('x509', '-req', '-in', `${name}.csr`, '-CA', `${issuer}.pem`, '-CAkey', `${issuer}.key`, '-CAcreateserial', '-days', '2', '-extfile', 'c.cnf', '-extensions', extensions, '-out', `${name}.pem`);
    }
    const certs = ['leaf', 'int', 'root'].map((name) => new crypto.X509Certificate(fs.readFileSync(file(`${name}.pem`))));
    const leafKey = fs.readFileSync(file('leaf.key'), 'utf8');
    fs.rmSync(dir, { recursive: true, force: true });
    return { certs, leafKey, rootFingerprint: certs[2].fingerprint256 };
}

function signTransaction(chain, overrides = {}) {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const header = encode({ alg: 'ES256', x5c: chain.certs.map((certificate) => certificate.raw.toString('base64')) });
    const payload = encode({
        bundleId: 'com.arkcards.app',
        productId: DRIVE_TRAFFIC_PRODUCT_ID,
        transactionId: '2000000123456789',
        appAccountToken: USER_ID,
        environment: 'Sandbox',
        ...overrides,
    });
    const signature = crypto.sign('sha256', Buffer.from(`${header}.${payload}`), { key: chain.leafKey, dsaEncoding: 'ieee-p1363' });
    return `${header}.${payload}.${signature.toString('base64url')}`;
}

// In-memory stand-in for the Supabase listings table used by createPremiumListingFromSession.
function createListingsMock() {
    const rows = [];
    const query = (result) => ({ select: () => query(result), eq: () => query(result), maybeSingle: async () => result(), single: async () => result() });
    return {
        rows,
        from: () => ({
            select: () => query(() => ({ data: null, error: null })),
            insert: ([row]) => query(() => {
                const saved = { id: `listing-${rows.length + 1}`, ...row };
                rows.push(saved);
                return { data: saved, error: null };
            }),
        }),
    };
}

const hasOpenssl = (() => {
    try { execFileSync('openssl', ['version'], { stdio: 'pipe' }); return true; } catch { return false; }
})();

test('App Store verification', { skip: !hasOpenssl && 'openssl not available' }, async (t) => {
    const chain = createTestChain();
    const verify = (jws, options = {}) => verifyAppStoreTransaction(jws, {
        expectedProductId: DRIVE_TRAFFIC_PRODUCT_ID,
        expectedAppAccountToken: USER_ID,
        trustedRootFingerprint: chain.rootFingerprint,
        ...options,
    });

    for (const environment of ['Sandbox', 'Production']) {
        await t.test(`${environment} receipts verify and activate a premium listing`, async () => {
            const transaction = verify(signTransaction(chain, { environment, transactionId: `tx-${environment}` }));
            assert.equal(transaction.environment, environment);

            const supabase = createListingsMock();
            const listing = await createPremiumListingFromSession(supabase, {
                id: `appstore_${transaction.transactionId}`,
                metadata: { title: 'Rider-Waite', price: '20', seller_id: USER_ID, direct_payment_link: 'https://shop.example.com', image_url: 'https://example.com/a.jpg' },
            });

            assert.equal(listing.is_premium, true);
            assert.equal(listing.external_link_active, true);
            assert.equal(listing.external_store_url, 'https://shop.example.com');
            assert.equal(listing.premium_stripe_session_id, `appstore_${transaction.transactionId}`);
            const daysActive = (new Date(listing.external_link_expires_at).getTime() - Date.now()) / 86_400_000;
            assert.ok(daysActive > 29.9 && daysActive <= 30, `expected ~30 days, got ${daysActive}`);
        });
    }

    await t.test('rejects unknown environments', () => {
        assert.throws(() => verify(signTransaction(chain, { environment: 'Xcode' })), /Unknown App Store environment/);
    });

    await t.test('rejects receipts bound to another account', () => {
        assert.throws(() => verify(signTransaction(chain, { appAccountToken: crypto.randomUUID() })), /different account/);
    });

    await t.test('rejects refunded receipts', () => {
        assert.throws(() => verify(signTransaction(chain, { revocationDate: Date.now() })), /refunded or revoked/);
    });

    await t.test('rejects chains not rooted in Apple Root CA G3 by default', () => {
        assert.throws(() => verifyAppStoreTransaction(signTransaction(chain), { expectedProductId: DRIVE_TRAFFIC_PRODUCT_ID, expectedAppAccountToken: USER_ID }), /not signed by Apple/);
    });

    await t.test('rejects tampered payloads', () => {
        const [header, , signature] = signTransaction(chain).split('.');
        const forgedPayload = Buffer.from(JSON.stringify({ bundleId: 'com.arkcards.app', productId: DRIVE_TRAFFIC_PRODUCT_ID, appAccountToken: USER_ID, environment: 'Production', transactionId: 'forged' })).toString('base64url');
        assert.throws(() => verify(`${header}.${forgedPayload}.${signature}`), /signature is invalid/);
    });
});
