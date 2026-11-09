import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PremiumBadge } from './premium-badge';

describe('shared premium thumbnail badge', () => {
    it.each([
        { isPremium: false, sellerIsPremium: true },
        { isPremium: true, sellerIsPremium: true },
        { isPremium: true },
    ])('renders the existing purple style without a link or nested button for %j', (listing) => {
        const html = renderToStaticMarkup(<PremiumBadge listing={listing} />);
        expect(html).toContain('class="premium-watermark premium-watermark--badge"');
        expect(html).toContain('>Premium</span>');
        expect(html).not.toMatch(/<(a|button)\b|href=|Visit store/);
    });

    it.each([{ isPremium: false }, { isPremium: false, sellerIsPremium: false }, { isPremium: true, sellerIsPremium: false }])('hides the badge for non-premium status %j', (listing) => {
        expect(renderToStaticMarkup(<PremiumBadge listing={listing} />)).toBe('');
    });
});
