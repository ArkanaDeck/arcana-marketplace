// Server-side port of src/lib/risk-check.ts's deterministic fraud heuristics, used as the fallback
// review gate for listings submitted WITHOUT silver-stamp/certification images (i.e. the normal,
// non-tarot-authenticated sale/swap/free flow through the unified batch pipeline).
export function assessListingRisk({ price, listingType, accountCreatedAt, recentListingCount }) {
    const reasons = [];
    const accountAgeHours = accountCreatedAt ? (Date.now() - new Date(accountCreatedAt).getTime()) / 36e5 : Infinity;

    if (accountAgeHours < 24 && listingType === 'sale' && price > 100) {
        reasons.push('New account publishing a high-value sale listing within 24 hours of signup.');
    }
    if (recentListingCount >= 5) {
        reasons.push('Seller already has an unusually high number of active listings.');
    }
    if (listingType === 'sale' && price > 500) {
        reasons.push('Listing price is unusually high for this marketplace.');
    }

    return { requiresReview: reasons.length > 0, reasons };
}
