import fs from 'node:fs';
import jwt from 'jsonwebtoken';

const TEAM_ID = process.env.APPLE_TEAM_ID || 'VJ7CUG9RR8';
const KEY_ID = process.env.APPLE_KEY_ID;
const CLIENT_ID = process.env.APPLE_CLIENT_ID || 'com.arkcards.app';
const PRIVATE_KEY_PATH = process.env.APPLE_PRIVATE_KEY_PATH;
const configuredPrivateKey = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
// Apple rejects client secrets that expire more than 6 months out.
const EXPIRES_IN_SECONDS = 180 * 24 * 60 * 60;

if (!KEY_ID || (!configuredPrivateKey && !PRIVATE_KEY_PATH)) {
    console.error('Set APPLE_KEY_ID and either APPLE_PRIVATE_KEY or APPLE_PRIVATE_KEY_PATH for your current Apple signing key.');
    process.exit(1);
}

let privateKey = configuredPrivateKey;
if (!privateKey) {
    try {
        privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
    } catch (error) {
        console.error(`Could not read ${PRIVATE_KEY_PATH}: ${error.message}`);
        process.exit(1);
    }
}

const issuedAt = Math.floor(Date.now() / 1000);
const clientSecret = jwt.sign(
    { iat: issuedAt, exp: issuedAt + EXPIRES_IN_SECONDS },
    privateKey,
    {
        algorithm: 'ES256',
        keyid: KEY_ID,
        issuer: TEAM_ID,
        subject: CLIENT_ID,
        audience: 'https://appleid.apple.com',
    },
);

console.log(clientSecret);
