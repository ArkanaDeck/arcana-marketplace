import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateListingFeeBreakdown } from './listing-fee-engine.js';

test('sale bundles pay only the per-deck authentication fee', () => {
    const breakdown = calculateListingFeeBreakdown({ decksInBundle: 3, listingType: 'sale' });
    assert.equal(breakdown.authenticationFeeTotal, 132);
    assert.equal(breakdown.insertionFeeTotal, 0);
    assert.equal(breakdown.grandTotalPence, 132);
    assert.equal(breakdown.triggersInsertionFee, false);
});

test('prior listing totals never add a listing surcharge', () => {
    const breakdown = calculateListingFeeBreakdown({ decksInBundle: 1, listingType: 'sale' });
    assert.equal(breakdown.authenticationFeeTotal, 44);
    assert.equal(breakdown.insertionFeeTotal, 0);
    assert.equal(breakdown.grandTotalPence, 44);
    assert.equal(breakdown.triggersInsertionFee, false);
});

test('swap and free bundles have no listing-count-dependent fee', () => {
    const breakdown = calculateListingFeeBreakdown({ decksInBundle: 1, listingType: 'swap' });
    assert.equal(breakdown.authenticationFeeTotal, 0);
    assert.equal(breakdown.insertionFeeTotal, 0);
    assert.equal(breakdown.grandTotalPence, 0);
});
