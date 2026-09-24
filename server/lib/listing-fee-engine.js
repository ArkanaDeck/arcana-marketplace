// Stacked pricing engine for a single listing "bundle" submission (currently always 1 deck per
// Sell-form submit — decksInBundle is exposed as a parameter so a future multi-deck submission
// flow can reuse this unchanged).
function getPositiveIntEnv(name, fallback) {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value >= 0 ? value : fallback;
}

const AUTHENTICATION_FEE_PENCE = getPositiveIntEnv('LISTING_AUTHENTICATION_FEE_PENCE', 44);

/**
 * Sale listings pay the per-deck authentication fee. Listing creation is never priced or
 * restricted according to the seller's prior listing count.
 */
function calculateListingFeeBreakdown({ decksInBundle, listingType }) {
    const authenticationFeeTotal = listingType === 'sale' ? decksInBundle * AUTHENTICATION_FEE_PENCE : 0;
    const insertionFeeTotal = 0;
    const grandTotalPence = authenticationFeeTotal + insertionFeeTotal;

    console.log(`[arkana:listing-fee-engine] decksInBundle=${decksInBundle} listingType=${listingType} authenticationFeeTotal=${authenticationFeeTotal}p grandTotalPence=${grandTotalPence}p`);

    return { authenticationFeeTotal, insertionFeeTotal, grandTotalPence, triggersInsertionFee: false };
}

async function computeListingFeeForBundle(_supabase, { listingType, decksInBundle = 1 }) {
    return calculateListingFeeBreakdown({ decksInBundle, listingType });
}

/**
 * Whole-batch variant: decks can be a mix of listing types. Only sale decks pay the
 * authentication fee, regardless of how many listings the seller has created.
 */
async function computeBatchFeeBreakdown(_supabase, _sellerId, decks) {
    const authenticationFeeTotal = decks.filter((deck) => deck.listingType === 'sale').length * AUTHENTICATION_FEE_PENCE;
    const insertionFeeTotal = 0;
    const grandTotalPence = authenticationFeeTotal + insertionFeeTotal;

    console.log(`[arkana:listing-fee-engine] BATCH deckCount=${decks.length} saleDecks=${decks.filter((deck) => deck.listingType === 'sale').length} authenticationFeeTotal=${authenticationFeeTotal}p grandTotalPence=${grandTotalPence}p`);

    return { authenticationFeeTotal, insertionFeeTotal, grandTotalPence, triggersInsertionFee: false };
}

export {
    AUTHENTICATION_FEE_PENCE,
    calculateListingFeeBreakdown,
    computeListingFeeForBundle,
    computeBatchFeeBreakdown,
};
