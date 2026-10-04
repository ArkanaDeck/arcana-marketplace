import crypto from 'node:crypto';

const APPLE_ISSUER = 'https://appleid.apple.com';

export class AppleRevocationError extends Error {
    constructor(message, statusCode = 502) {
        super(message);
        this.name = 'AppleRevocationError';
        this.statusCode = statusCode;
    }
}

function createClientSecret(clientId) {
    const teamId = process.env.APPLE_TEAM_ID;
    const keyId = process.env.APPLE_KEY_ID;
    const privateKey = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!teamId || !keyId || !privateKey) {
        throw new AppleRevocationError('Apple account deletion is not configured. Please contact support.', 503);
    }
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const issuedAt = Math.floor(Date.now() / 1000);
    const header = encode({ alg: 'ES256', kid: keyId, typ: 'JWT' });
    const payload = encode({ iss: teamId, sub: clientId, aud: APPLE_ISSUER, iat: issuedAt, exp: issuedAt + 300 });
    const input = `${header}.${payload}`;
    const signature = crypto.sign('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' });
    return `${input}.${signature.toString('base64url')}`;
}

async function appleRequest(path, body, fetchImpl) {
    let response;
    try {
        response = await fetchImpl(`${APPLE_ISSUER}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(body).toString(),
            signal: AbortSignal.timeout(15000),
        });
    } catch {
        throw new AppleRevocationError('Apple could not be reached. Your account has not been deleted. Please retry.');
    }
    if (!response.ok) throw new AppleRevocationError('Apple authorization could not be revoked. Your account has not been deleted. Please reauthorize and retry.');
    return response;
}

async function verifyAppleSubject(idToken, clientId, user, fetchImpl) {
    try {
        const [header, payload, signature, extra] = String(idToken || '').split('.');
        if (!header || !payload || !signature || extra) throw new Error('Invalid token');
        const metadata = JSON.parse(Buffer.from(header, 'base64url').toString());
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
        if (metadata.alg !== 'RS256' || !metadata.kid) throw new Error('Invalid algorithm');
        const response = await fetchImpl(`${APPLE_ISSUER}/auth/keys`, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('No signing keys');
        const { keys } = await response.json();
        const jwk = keys?.find((key) => key.kid === metadata.kid && key.kty === 'RSA');
        if (!jwk || !crypto.verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(signature, 'base64url'))) {
            throw new Error('Invalid signature');
        }
        const now = Math.floor(Date.now() / 1000);
        if (claims.iss !== APPLE_ISSUER || claims.aud !== clientId || typeof claims.exp !== 'number' || claims.exp <= now
            || typeof claims.iat !== 'number' || claims.iat > now + 60) throw new Error('Invalid claims');
        const identities = (user.identities || []).filter((identity) => identity.provider === 'apple');
        if (!identities.some((identity) => (identity.identity_data?.sub || identity.identity_data?.provider_id || identity.id) === claims.sub)) {
            throw new Error('Wrong Apple account');
        }
    } catch {
        throw new AppleRevocationError('Please authorize deletion using the Apple account linked to this Arkcards account.', 403);
    }
}

export async function revokeAppleAuthorization(user, { authorizationCode, refreshToken, platform }, { fetchImpl = fetch } = {}) {
    if (!(user.identities || []).some((identity) => identity.provider === 'apple')) {
        return { revoked: false, required: false };
    }
    const clientId = platform === 'ios' ? process.env.APPLE_IOS_CLIENT_ID || 'com.arkcards.app' : process.env.APPLE_WEB_CLIENT_ID;
    if (!clientId) throw new AppleRevocationError('Apple web account deletion is not configured. Please contact support.', 503);
    if (!authorizationCode && !refreshToken) throw new AppleRevocationError('Reauthorize with Apple before deleting your account.', 400);
    const clientSecret = createClientSecret(clientId);
    const exchange = await appleRequest('/auth/token', {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: authorizationCode ? 'authorization_code' : 'refresh_token',
        ...(authorizationCode ? { code: authorizationCode } : { refresh_token: refreshToken }),
    }, fetchImpl);
    const tokens = await exchange.json();
    await verifyAppleSubject(tokens.id_token, clientId, user, fetchImpl);
    const token = tokens.refresh_token || refreshToken || tokens.access_token;
    if (typeof token !== 'string' || !token) throw new AppleRevocationError('Apple did not return a revocable credential. Please retry.');
    await appleRequest('/auth/revoke', {
        client_id: clientId,
        client_secret: clientSecret,
        token,
        token_type_hint: tokens.refresh_token || refreshToken ? 'refresh_token' : 'access_token',
    }, fetchImpl);
    return { revoked: true, required: true };
}