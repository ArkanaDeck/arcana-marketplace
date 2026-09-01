import test from 'node:test';
import assert from 'node:assert/strict';
import { getProductionChecklist } from './production-checklist.js';

test('production checklist includes the required launch gates', () => {
    const items = getProductionChecklist({
        VITE_SUPABASE_URL: 'https://example.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'anon-key',
        VITE_STRIPE_PUBLISHABLE_KEY: 'pk_test_123',
        VITE_APP_URL: 'https://app.example.com',
    });

    const titles = items.map(item => item.title);

    assert.ok(titles.includes('Secure auth and session handling'));
    assert.ok(titles.includes('Production database + RLS'));
    assert.ok(titles.includes('Server-side payment confirmation'));
    assert.ok(titles.includes('Environment variables and deployment'));
    assert.ok(titles.includes('HTTPS and security headers'));
    assert.ok(titles.includes('Monitoring and incident response'));
    assert.ok(titles.includes('Order lifecycle and seller payouts'));
    assert.ok(titles.includes('Final launch sign-off'));
});

test('production checklist shows pending tasks when env values are missing', () => {
    const items = getProductionChecklist({});
    const hasPending = items.some(item => item.status === 'pending');
    const hasComplete = items.some(item => item.status === 'complete');

    assert.equal(hasPending, true);
    assert.equal(hasComplete, false);
});
