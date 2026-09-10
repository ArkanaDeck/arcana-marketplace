export type RiskAssessment = { requiresReview: boolean; reasons: string[] };

export type RiskCheckInput = {
    price: number;
    listingType: 'sale' | 'swap' | 'free';
    accountCreatedAt: string | undefined;
    recentListingCount: number;
};

// Deterministic fraud/risk heuristics. Flags listings for manual review instead of blocking publish outright.
export function assessListingRisk(input: RiskCheckInput): RiskAssessment {
    const reasons: string[] = [];
    const accountAgeHours = input.accountCreatedAt ? (Date.now() - new Date(input.accountCreatedAt).getTime()) / 36e5 : Infinity;

    if (accountAgeHours < 24 && input.listingType === 'sale' && input.price > 100) {
        reasons.push('New account publishing a high-value sale listing within 24 hours of signup.');
    }
    if (input.recentListingCount >= 5) {
        reasons.push('Seller already has an unusually high number of active listings.');
    }
    if (input.listingType === 'sale' && input.price > 500) {
        reasons.push('Listing price is unusually high for this marketplace.');
    }

    return { requiresReview: reasons.length > 0, reasons };
}
