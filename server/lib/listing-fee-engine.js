// Stacked pricing engine for a single listing "bundle" submission (currently always 1 deck per
// Sell-form submit — decksInBundle is exposed as a parameter so a future multi-deck submission
// flow can reuse this unchanged).
function getPositiveIntEnv(name, fallback) {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value >= 0 ? value : fallback;
}

const AUTHENTICATION_FEE_PENCE = getPositiveIntEnv('LISTING_AUTHENTICATION_FEE_PENCE', 44);
const INSERTION_FEE_PENCE = getPositiveIntEnv('LISTING_BUNDLE_FEE_PENCE', 66);
const FREE_BUNDLE_ALLOWANCE = getPositiveIntEnv('LISTING_FREE_ALLOWANCE', 3);

/**
 * Component calculation logic:
 * 1. BASE fee = decksInBundle * 44p, but only for 'sale' listings (swap/free giveaways carry no
 *    authentication charge unless the insertion surcharge below applies to them too).
 * 2. INSERTION surcharge = a flat 66p added once per bundle, only once the seller has already
 *    submitted 3+ prior bundles (of any category), re-triggering every 3rd bundle after that.
 * 3. These stack — a sale bundle landing on an insertion-trigger position pays BOTH.
 */
function calculateListingFeeBreakdown({ decksInBundle, listingType, priorBundleCount }) {
    const triggersInsertionFee = FREE_BUNDLE_ALLOWANCE > 0
        && priorBundleCount >= FREE_BUNDLE_ALLOWANCE
        && (priorBundleCount - FREE_BUNDLE_ALLOWANCE) % FREE_BUNDLE_ALLOWANCE === 0;

    const authenticationFeeTotal = listingType === 'sale' ? decksInBundle * AUTHENTICATION_FEE_PENCE : 0;
    const insertionFeeTotal = triggersInsertionFee ? INSERTION_FEE_PENCE : 0;
    const grandTotalPence = authenticationFeeTotal + insertionFeeTotal;

    console.log(`[arkana:listing-fee-engine] decksInBundle=${decksInBundle} listingType=${listingType} priorBundleCount=${priorBundleCount} triggersInsertionFee=${triggersInsertionFee} authenticationFeeTotal=${authenticationFeeTotal}p insertionFeeTotal=${insertionFeeTotal}p grandTotalPence=${grandTotalPence}p`);

    return { authenticationFeeTotal, insertionFeeTotal, grandTotalPence, triggersInsertionFee };
}

// Counts every bundle (currently: every row in `listings`) the seller has ever submitted, across
// sale/swap/free alike, excluding the bundle currently being priced.
async function countPriorBundles(supabase, sellerId, currentListingId) {
    const { count, error } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', sellerId)
        .neq('id', currentListingId);
    if (error) throw error;
    return count || 0;
}

async function computeListingFeeForBundle(supabase, { sellerId, listingType, currentListingId, decksInBundle = 1 }) {
    const priorBundleCount = await countPriorBundles(supabase, sellerId, currentListingId);
    return calculateListingFeeBreakdown({ decksInBundle, listingType, priorBundleCount });
}

// Counts every upload_batches row the seller has ever submitted (the unified batch pipeline's
// bundle counter), excluding nothing — the batch being priced doesn't exist yet when this runs.
async function countPriorUploadBatches(supabase, sellerId) {
    const { count, error } = await supabase
        .from('upload_batches')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', sellerId);
    if (error) throw error;
    return count || 0;
}

/**
 * Whole-batch variant: decks can be a mix of listing types (sale/swap/free) in one submission.
 * BASE fee = sum of (44p) for every 'sale' deck in the batch. INSERTION surcharge is a single
 * flat 66p for the whole batch (not per deck) once the seller's prior batch count crosses the threshold.
 */
async function computeBatchFeeBreakdown(supabase, sellerId, decks) {
    const priorBundleCount = await countPriorUploadBatches(supabase, sellerId);
    const triggersInsertionFee = FREE_BUNDLE_ALLOWANCE > 0
        && priorBundleCount >= FREE_BUNDLE_ALLOWANCE
        && (priorBundleCount - FREE_BUNDLE_ALLOWANCE) % FREE_BUNDLE_ALLOWANCE === 0;

    const authenticationFeeTotal = decks.filter((deck) => deck.listingType === 'sale').length * AUTHENTICATION_FEE_PENCE;
    const insertionFeeTotal = triggersInsertionFee ? INSERTION_FEE_PENCE : 0;
    const grandTotalPence = authenticationFeeTotal + insertionFeeTotal;

    console.log(`[arkana:listing-fee-engine] BATCH deckCount=${decks.length} saleDecks=${decks.filter((deck) => deck.listingType === 'sale').length} priorBundleCount=${priorBundleCount} triggersInsertionFee=${triggersInsertionFee} authenticationFeeTotal=${authenticationFeeTotal}p insertionFeeTotal=${insertionFeeTotal}p grandTotalPence=${grandTotalPence}p`);

    return { authenticationFeeTotal, insertionFeeTotal, grandTotalPence, triggersInsertionFee, priorBundleCount };
}

export {
    AUTHENTICATION_FEE_PENCE,
    INSERTION_FEE_PENCE,
    FREE_BUNDLE_ALLOWANCE,
    calculateListingFeeBreakdown,
    countPriorBundles,
    computeListingFeeForBundle,
    countPriorUploadBatches,
    computeBatchFeeBreakdown,
};
