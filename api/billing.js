import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { logServerError } from '../server/lib/server-logger.js';
import { isValidHttpUrl } from '../server/lib/url-validation.js';

// Consolidated Stripe Checkout hub (seller subscription / listing fee / website link / listing external link),
// routed via ?product=. Merged from four separate files to stay under Vercel's serverless function count limit.
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');

    if (!stripeSecretKey.startsWith('sk_') || !supabaseUrl || !supabaseServiceRoleKey) {
        return res.status(503).json({ error: 'Billing is not configured yet.' });
    }
    if (!token) return res.status(401).json({ error: 'Sign in before continuing.' });

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });

    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const product = req.query?.product;

    if (product === 'seller-subscription') return createSellerSubscriptionCheckout(res, stripe, user);
    if (product === 'listing-fee') return createListingFeeCheckout(res, stripe, supabase, user, body);
    if (product === 'website-link') return createWebsiteLinkCheckout(res, stripe, supabase, user, body);
    if (product === 'listing-external-link') return createListingExternalLinkCheckout(res, stripe, supabase, user, body);
    return res.status(400).json({ error: 'Unknown billing product.' });
}

const APP_URL = process.env.VITE_APP_URL || process.env.APP_URL || 'http://localhost:5173';

async function createSellerSubscriptionCheckout(res, stripe, user) {
    const SELLER_SUBSCRIPTION_MONTHLY_AMOUNT = 4.99;
    try {
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            customer_email: user.email || undefined,
            line_items: [{
                price_data: {
                    currency: 'gbp',
                    product_data: { name: 'Arkana seller subscription', description: 'Monthly seller plan required to publish listings' },
                    unit_amount: Math.round(SELLER_SUBSCRIPTION_MONTHLY_AMOUNT * 100),
                    recurring: { interval: 'month' },
                },
                quantity: 1,
            }],
            success_url: `${APP_URL}/?subscription=success`,
            cancel_url: `${APP_URL}/?subscription=cancelled`,
            metadata: { seller_id: user.id, product: 'seller_subscription' },
            subscription_data: { metadata: { seller_id: user.id } },
        });
        return res.status(200).json({ url: session.url });
    } catch (error) {
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to create seller subscription checkout.' });
    }
}

function getPositiveIntEnv(name, fallback) {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value >= 0 ? value : fallback;
}

const AUTHENTICATION_FEE_PENCE = getPositiveIntEnv('LISTING_AUTHENTICATION_FEE_PENCE', 44);
const BUNDLE_FEE_PENCE = getPositiveIntEnv('LISTING_BUNDLE_FEE_PENCE', 66);
const FREE_LISTING_ALLOWANCE = getPositiveIntEnv('LISTING_FREE_ALLOWANCE', 3);

// Server-side fee computation — never trust a client-supplied fee amount.
async function computeListingFeePence(supabase, sellerId, listingType, currentListingId) {
    const { count, error } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', sellerId)
        .neq('id', currentListingId);
    if (error) throw error;

    const existingCount = count || 0;
    const triggersBundleFee = FREE_LISTING_ALLOWANCE > 0
        && existingCount >= FREE_LISTING_ALLOWANCE
        && (existingCount - FREE_LISTING_ALLOWANCE) % FREE_LISTING_ALLOWANCE === 0;
    const authenticationFee = listingType === 'sale' ? AUTHENTICATION_FEE_PENCE : 0;
    const bundleFee = triggersBundleFee ? BUNDLE_FEE_PENCE : 0;
    return { totalPence: authenticationFee + bundleFee, authenticationFee, bundleFee };
}

async function createListingFeeCheckout(res, stripe, supabase, user, body) {
    try {
        const listingId = body.listingId;
        const deckTitle = String(body.deckTitle || '').trim();
        const requiresManualReview = Boolean(body.requiresManualReview);
        if (!listingId || !deckTitle) return res.status(400).json({ error: 'A listing ID and deck title are required.' });

        const { data: listing, error: listingError } = await supabase
            .from('listings')
            .select('id, seller_id, listing_type')
            .eq('id', listingId)
            .eq('seller_id', user.id)
            .maybeSingle();
        if (listingError) throw listingError;
        if (!listing) return res.status(404).json({ error: 'Listing not found.' });

        const { totalPence, authenticationFee, bundleFee } = await computeListingFeePence(supabase, user.id, listing.listing_type, listingId);

        if (totalPence === 0) {
            if (!requiresManualReview) {
                const { error: approveError } = await supabase
                    .from('listings')
                    .update({ review_status: 'approved' })
                    .eq('id', listingId)
                    .eq('review_status', 'pending_review');
                if (approveError) throw approveError;
            }
            return res.status(200).json({ url: null, feePence: 0, approved: !requiresManualReview });
        }

        const description = [
            authenticationFee > 0 ? `AI authentication (${authenticationFee}p)` : null,
            bundleFee > 0 ? `listing insertion fee (${bundleFee}p)` : null,
        ].filter(Boolean).join(' + ');

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer_email: user.email || undefined,
            line_items: [{
                price_data: {
                    currency: 'gbp',
                    product_data: { name: 'Arkana listing fee', description: `${description} for "${deckTitle}"` },
                    unit_amount: totalPence,
                },
                quantity: 1,
            }],
            success_url: body.successUrl || `${APP_URL}/?listing-fee=success`,
            cancel_url: body.cancelUrl || `${APP_URL}/?listing-fee=cancelled`,
            metadata: {
                sellerId: user.id,
                deckTitle,
                listing_id: listingId,
                requires_manual_review: requiresManualReview ? 'true' : 'false',
                product: 'listing_fee',
            },
        });
        return res.status(200).json({ url: session.url, feePence: totalPence });
    } catch (error) {
        logServerError('billing:listing-fee', error);
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to start listing fee checkout.' });
    }
}

async function createWebsiteLinkCheckout(res, stripe, supabase, user, body) {
    const WEBSITE_LINK_FEE_PENCE = 200;
    const WEBSITE_LINK_DAYS = 30;
    try {
        const websiteUrl = String(body.websiteUrl || '').trim();
        if (!isValidHttpUrl(websiteUrl)) return res.status(400).json({ error: 'Enter a valid website URL starting with http:// or https://.' });

        const { error: updateError } = await supabase.from('profiles').update({ website_url: websiteUrl }).eq('id', user.id);
        if (updateError) throw updateError;

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer_email: user.email || undefined,
            line_items: [{
                price_data: {
                    currency: 'gbp',
                    product_data: { name: 'Arkana website link', description: `${WEBSITE_LINK_DAYS} days linking your website from your seller profile` },
                    unit_amount: WEBSITE_LINK_FEE_PENCE,
                },
                quantity: 1,
            }],
            success_url: body.successUrl || `${APP_URL}/?website-link=success`,
            cancel_url: body.cancelUrl || `${APP_URL}/?website-link=cancelled`,
            metadata: { seller_id: user.id, product: 'website_link_rental' },
        });
        return res.status(200).json({ url: session.url });
    } catch (error) {
        logServerError('billing:website-link', error);
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to start website link checkout.' });
    }
}

async function createListingExternalLinkCheckout(res, stripe, supabase, user, body) {
    const EXTERNAL_LINK_RENTAL_FEE_PENCE = 200;
    const EXTERNAL_LINK_RENTAL_DAYS = 30;
    try {
        const listingId = body.listingId;
        const externalStoreUrl = String(body.externalStoreUrl || '').trim();
        if (!listingId) return res.status(400).json({ error: 'A listing ID is required.' });
        if (!isValidHttpUrl(externalStoreUrl)) return res.status(400).json({ error: 'Enter a valid external store URL starting with http:// or https://.' });

        const { data: listing, error: listingError } = await supabase
            .from('listings')
            .select('id, seller_id')
            .eq('id', listingId)
            .eq('seller_id', user.id)
            .maybeSingle();
        if (listingError) throw listingError;
        if (!listing) return res.status(404).json({ error: 'Listing not found.' });

        const { error: updateError } = await supabase
            .from('listings')
            .update({ external_store_url: externalStoreUrl })
            .eq('id', listingId);
        if (updateError) throw updateError;

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer_email: user.email || undefined,
            line_items: [{
                price_data: {
                    currency: 'gbp',
                    product_data: { name: 'Arkana external store link', description: `${EXTERNAL_LINK_RENTAL_DAYS} days of driving traffic to your own web store` },
                    unit_amount: EXTERNAL_LINK_RENTAL_FEE_PENCE,
                },
                quantity: 1,
            }],
            success_url: body.successUrl || `${APP_URL}/?external-link=success`,
            cancel_url: body.cancelUrl || `${APP_URL}/?external-link=cancelled`,
            metadata: { seller_id: user.id, listing_id: listingId, product: 'external_link_rental' },
        });
        return res.status(200).json({ url: session.url });
    } catch (error) {
        logServerError('billing:listing-external-link', error);
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to start external link checkout.' });
    }
}
