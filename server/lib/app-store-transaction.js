import crypto from 'node:crypto';

export const DRIVE_TRAFFIC_PRODUCT_ID = 'com.arkcards.app.drivetraffic';
const BUNDLE_ID = 'com.arkcards.app';
// SHA-256 of https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
const APPLE_ROOT_CA_G3_SHA256 = '63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79';
// DER-encoded marker OIDs Apple places on App Store signing certs; without them any Apple-issued developer cert would pass the chain check.
const APP_STORE_LEAF_OID = Buffer.from('060a2a864886f76364060b01', 'hex');
const WWDR_INTERMEDIATE_OID = Buffer.from('060a2a864886f76364060201', 'hex');

function decodeSegment(segment) {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

function isCurrentlyValid(certificate, now) {
    return new Date(certificate.validFrom) <= now && now <= new Date(certificate.validTo);
}

// Verifies a StoreKit 2 signed transaction (JWS) and returns its decoded payload.
export function verifyAppStoreTransaction(signedTransaction, { expectedProductId, expectedAppAccountToken, trustedRootFingerprint = APPLE_ROOT_CA_G3_SHA256 }) {
    const parts = String(signedTransaction || '').split('.');
    if (parts.length !== 3) throw new Error('Invalid App Store transaction.');
    const [headerSegment, payloadSegment, signatureSegment] = parts;

    const header = decodeSegment(headerSegment);
    if (header.alg !== 'ES256' || !Array.isArray(header.x5c) || header.x5c.length !== 3) {
        throw new Error('Unexpected App Store transaction header.');
    }

    const [leaf, intermediate, root] = header.x5c.map((der) => new crypto.X509Certificate(Buffer.from(der, 'base64')));
    const now = new Date();
    if (root.fingerprint256 !== trustedRootFingerprint) throw new Error('App Store transaction is not signed by Apple.');
    if (!intermediate.checkIssued(root) || !intermediate.verify(root.publicKey)) throw new Error('Invalid App Store certificate chain.');
    if (!leaf.checkIssued(intermediate) || !leaf.verify(intermediate.publicKey)) throw new Error('Invalid App Store certificate chain.');
    if (![leaf, intermediate, root].every((certificate) => isCurrentlyValid(certificate, now))) throw new Error('Expired App Store certificate.');
    if (!leaf.raw.includes(APP_STORE_LEAF_OID) || !intermediate.raw.includes(WWDR_INTERMEDIATE_OID)) {
        throw new Error('Certificate is not an App Store signing certificate.');
    }

    const signatureValid = crypto.verify(
        'sha256',
        Buffer.from(`${headerSegment}.${payloadSegment}`),
        { key: leaf.publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signatureSegment, 'base64url'),
    );
    if (!signatureValid) throw new Error('App Store transaction signature is invalid.');

    const transaction = decodeSegment(payloadSegment);
    if (transaction.bundleId !== BUNDLE_ID) throw new Error('App Store transaction is for a different app.');
    if (transaction.productId !== expectedProductId) throw new Error('App Store transaction is for a different product.');
    if (transaction.revocationDate) throw new Error('This App Store purchase was refunded or revoked.');
    if (!['Production', 'Sandbox'].includes(transaction.environment)) throw new Error('Unknown App Store environment.');
    if (String(transaction.appAccountToken || '').toLowerCase() !== String(expectedAppAccountToken || '').toLowerCase()) {
        throw new Error('This App Store purchase belongs to a different account.');
    }
    if (!transaction.transactionId) throw new Error('App Store transaction is missing its ID.');
    return transaction;
}
