import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateListingFeeBreakdown } from './listing-fee-engine.js';

test('STACKING CHECK: 3-deck sale bundle at the insertion threshold = (3*44)+66 = 198p', () => {
    const breakdown = calculateListingFeeBreakdown({ decksInBundle: 3, listingType: 'sale', priorBundleCount: 3 });
    assert.equal(breakdown.authenticationFeeTotal, 132);
    assert.equal(breakdown.insertionFeeTotal, 66);
    assert.equal(breakdown.grandTotalPence, 198);
    assert.equal(breakdown.triggersInsertionFee, true);
});

test('STACKING CHECK: 3-deck sale bundle BEFORE the threshold = baseline (3*44) = 132p', () => {
    const breakdown = calculateListingFeeBreakdown({ decksInBundle: 3, listingType: 'sale', priorBundleCount: 0 });
    assert.equal(breakdown.authenticationFeeTotal, 132);
    assert.equal(breakdown.insertionFeeTotal, 0);
    assert.equal(breakdown.grandTotalPence, 132);
    assert.equal(breakdown.triggersInsertionFee, false);
});

test('swap/free bundles carry no authentication fee, but still pay the insertion surcharge when triggered', () => {
    const belowThreshold = calculateListingFeeBreakdown({ decksInBundle: 1, listingType: 'swap', priorBundleCount: 3 });
    assert.equal(belowThreshold.authenticationFeeTotal, 0);
    assert.equal(belowThreshold.insertionFeeTotal, 66);
    assert.equal(belowThreshold.grandTotalPence, 66);
});

test('insertion surcharge re-triggers every 3rd bundle after the free allowance (4th, 7th, 10th...)', () => {
    const triggers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((priorBundleCount) =>
        calculateListingFeeBreakdown({ decksInBundle: 1, listingType: 'sale', priorBundleCount }).triggersInsertionFee
    );
    assert.deepEqual(triggers, [false, false, false, true, false, false, true, false, false, true]);
});
