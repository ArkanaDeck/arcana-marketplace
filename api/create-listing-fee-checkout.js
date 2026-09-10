import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { logServerError } from '../server/lib/server-logger.js';

function getPositiveIntEnv(name, fallback) {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value >= 0 ? value : fallback;
}

const AUTHENTICATION_FEE_PENCE = getPositiveIntEnv('LISTING_AUTHENTICATION_FEE_PENCE', 44);
const BUNDLE_FEE_PENCE = getPositiveIntEnv('LISTING_BUNDLE_FEE_PENCE', 66);
const FREE_LISTING_ALLOWANCE = getPositiveIntEnv('LISTING_FREE_ALLOWANCE', 3);

// Server-side fee computation — never trust a client-supplied fee amount.
// 1. Sale listings always incur the authentication fee.
// 2. After a seller's first N listings (any type), every Nth listing after that
//    incurs an additional bundle fee, based on the seller's total existing listing count.
// These two fees stack when both conditions are true (a sale listing landing on a bundle position).
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

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');

    if (!stripeSecretKey.startsWith('sk_') || !supabaseUrl || !supabaseServiceRoleKey) {
        return res.status(503).json({ error: 'Listing fee checkout is not configured yet.' });
    }
    if (!token) return res.status(401).json({ error: 'Sign in before publishing a listing.' });

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
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

        const appUrl = process.env.VITE_APP_URL || process.env.APP_URL || 'http://localhost:5173';
        const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });
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
            success_url: body.successUrl || `${appUrl}/?listing-fee=success`,
            cancel_url: body.cancelUrl || `${appUrl}/?listing-fee=cancelled`,
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
        logServerError('create-listing-fee-checkout', error);
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to start listing fee checkout.' });
    }
}
