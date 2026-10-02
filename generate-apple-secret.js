import fs from 'node:fs';
import jwt from 'jsonwebtoken';

const TEAM_ID = 'VJ7CUG9RR8';
const KEY_ID = 'M93C4ZWC62';
const CLIENT_ID = 'com.arkcards.app';
const PRIVATE_KEY_PATH = './AuthKey_M93C4ZWC62.p8';
// Apple rejects client secrets that expire more than 6 months out.
const EXPIRES_IN_SECONDS = 180 * 24 * 60 * 60;

let privateKey;
try {
    privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
} catch {
    console.error(`Could not read ${PRIVATE_KEY_PATH}. Download it from Apple Developer > Keys and place it next to this script.`);
    process.exit(1);
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
