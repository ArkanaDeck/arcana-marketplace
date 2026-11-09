import React from 'react';
import type { MarketplaceListing } from './lib/listings';

export const PremiumBadge: React.FC<{ listing: Pick<MarketplaceListing, 'isPremium' | 'sellerIsPremium'> }> = ({ listing }) => {
    if (!(listing.sellerIsPremium ?? listing.isPremium)) return null;
    return <span className="premium-watermark premium-watermark--badge" title="Premium seller">Premium</span>;
};
