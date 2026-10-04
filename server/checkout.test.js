import test from 'node:test';
import assert from 'node:assert/strict';

import { isStripeConfigured, getCheckoutSessionPayload } from './checkout.js';
import { isValidHttpUrl } from './lib/url-validation.js';

test('seller links require HTTPS without embedded credentials', () => {
    assert.equal(isValidHttpUrl('https://shop.example.com/decks'), true);
    assert.equal(isValidHttpUrl('http://shop.example.com/decks'), false);
    assert.equal(isValidHttpUrl('https://user:password@shop.example.com'), false);
    assert.equal(isValidHttpUrl('javascript:alert(1)'), false);
    assert.equal(isValidHttpUrl('https://'), false);
});

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
