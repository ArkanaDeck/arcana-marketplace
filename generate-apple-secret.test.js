import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import jwt from 'jsonwebtoken';

const scriptPath = fileURLToPath(new URL('./generate-apple-secret.js', import.meta.url));

test('generates Apple client secrets from inline P8 content or a P8 file path', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const baseEnv = {
        ...process.env,
        APPLE_TEAM_ID: 'TESTTEAM',
        APPLE_KEY_ID: 'TESTKEY',
        APPLE_CLIENT_ID: 'com.example.app',
    };
    const runGenerator = (credentials) => spawnSync(process.execPath, [scriptPath], {
        encoding: 'utf8',
        env: { ...baseEnv, ...credentials },
    });
    const verifySecret = (result) => {
        assert.equal(result.status, 0, result.stderr);
        const token = result.stdout.trim();
        const claims = jwt.verify(token, publicKey, {
            algorithms: ['ES256'],
            audience: 'https://appleid.apple.com',
            issuer: 'TESTTEAM',
            subject: 'com.example.app',
        });
        assert.equal(claims.iss, 'TESTTEAM');
        assert.equal(jwt.decode(token, { complete: true }).header.kid, 'TESTKEY');
    };

    verifySecret(runGenerator({
        APPLE_PRIVATE_KEY: pem.replace(/\n/g, '\\n'),
        APPLE_PRIVATE_KEY_PATH: '',
    }));

    const directory = mkdtempSync(join(tmpdir(), 'apple-p8-test-'));
    try {
        const privateKeyPath = join(directory, 'AuthKey_TESTKEY.p8');
        writeFileSync(privateKeyPath, pem);
        verifySecret(runGenerator({
            APPLE_PRIVATE_KEY: '',
            APPLE_PRIVATE_KEY_PATH: privateKeyPath,
        }));
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
