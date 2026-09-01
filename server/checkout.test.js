import test from 'node:test';
import assert from 'node:assert/strict';

import { isStripeConfigured, getCheckoutSessionPayload } from './checkout.js';

test('returns false when Stripe is not configured', () => {
    const configured = isStripeConfigured('');
    assert.equal(configured, false);
});

test('builds a valid checkout payload when values are present', () => {
    const payload = getCheckoutSessionPayload({
        amount: 25.5,
        currency: 'gbp',
        itemName: 'Rider-Waite Tarot Deck',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
    });

    assert.equal(payload.mode, 'payment');
    assert.equal(payload.line_items[0].price_data.currency, 'gbp');
    assert.equal(payload.line_items[0].quantity, 1);
    assert.equal(payload.success_url, 'https://example.com/success');
    assert.equal(payload.cancel_url, 'https://example.com/cancel');
});
