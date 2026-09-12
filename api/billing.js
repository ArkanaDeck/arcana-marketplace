import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { logServerError } from '../server/lib/server-logger.js';
import { isValidHttpUrl } from '../server/lib/url-validation.js';
import { computeListingFeeForBundle } from '../server/lib/listing-fee-engine.js';

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
    if (product === 'listing-batch-fee') return createListingBatchFeeCheckout(res, stripe, supabase, user, body);
    if (product === 'premium-listing') return createPremiumListingCheckout(res, stripe, user, body);
    if (product === 'website-link') return createWebsiteLinkCheckout(res, stripe, supabase, user, body);
    if (product === 'listing-external-link') return createListingExternalLinkCheckout(res, stripe, supabase, user, body);
    return res.status(400).json({ error: 'Unknown billing product.' });
}

const APP_URL = process.env.VITE_APP_URL || process.env.APP_URL || 'http://localhost:5173';

async function createPremiumListingCheckout(res, stripe, user, body) {
    try {
        const title = String(body.title || '').trim();
        const directPaymentLink = String(body.direct_payment_link || '').trim();
        if (!title || !directPaymentLink) return res.status(400).json({ error: 'Listing title and direct payment link are required.' });

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer_email: user.email || undefined,
            line_items: [{
                price_data: {
                    currency: 'gbp',
                    product_data: { name: 'Arkana Premium Store Link Feature - 30 Days' },
                    unit_amount: 200,
                },
                quantity: 1,
            }],
            success_url: body.successUrl || `${APP_URL}/?premium-listing=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: body.cancelUrl || `${APP_URL}/?premium-listing=cancelled`,
            metadata: {
                product: 'premium_listing',
                title,
                price: String(body.price ?? 0),
                description: String(body.description || ''),
                condition: String(body.condition || 'good'),
                direct_payment_link: directPaymentLink,
                seller_id: user.id,
                image_url: String(body.image_url || ''),
                listing_type: String(body.listing_type || 'sale'),
                free_delivery: body.free_delivery ? 'true' : 'false',
            },
        });
        return res.status(200).json({ sessionId: session.id, url: session.url });
    } catch (error) {
        logServerError('billing:premium-listing', error);
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to start premium listing checkout.' });
    }
}

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

// Pure builder: converts the calculated pence amount + listing id into a Stripe PaymentIntent
// payload. Kept separate from the actual Checkout Session call below so the amount that reaches
// Stripe is always the single, cleanly-computed integer from the fee engine — never re-derived inline.
function buildListingFeePaymentIntentPayload(grandTotalPence, listingId) {
    if (!Number.isInteger(grandTotalPence) || grandTotalPence <= 0) throw new Error('Fee must be a positive integer number of pence.');
    if (!listingId) throw new Error('A listing ID is required to track this payment.');
    return {
        amount: grandTotalPence,
        currency: 'gbp',
        metadata: { listing_id: String(listingId), product: 'listing_fee' },
        automatic_payment_methods: { enabled: true },
    };
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

        // decksInBundle is 1 today (one deck per Sell-form submission); the engine already
        // supports multi-deck bundles so a future batch-submit flow can reuse it unchanged.
        const { authenticationFeeTotal, insertionFeeTotal, grandTotalPence } = await computeListingFeeForBundle(supabase, {
            sellerId: user.id,
            listingType: listing.listing_type,
            currentListingId: listingId,
            decksInBundle: 1,
        });

        if (grandTotalPence === 0) {
            console.log(`[arkana:billing:listing-fee] listing ${listingId} owes 0p — approving without a Stripe charge (requiresManualReview=${requiresManualReview})`);
            if (!requiresManualReview) {
                const { error: approveError } = await supabase
                    .from('listings')
                    .update({ review_status: 'approved', authentication_fee_pence: 0, insertion_fee_pence: 0, grand_total_fee_pence: 0 })
                    .eq('id', listingId)
                    .eq('review_status', 'pending_review');
                if (approveError) throw approveError;
            }
            return res.status(200).json({ url: null, feePence: 0, approved: !requiresManualReview });
        }

        const description = [
            authenticationFeeTotal > 0 ? `AI authentication (${authenticationFeeTotal}p)` : null,
            insertionFeeTotal > 0 ? `listing insertion fee (${insertionFeeTotal}p)` : null,
        ].filter(Boolean).join(' + ');

        // Sanity-check the payload before it ever reaches Stripe: same integer that was logged above.
        const paymentIntentPayload = buildListingFeePaymentIntentPayload(grandTotalPence, listingId);
        console.log(`[arkana:billing:listing-fee] charging listing ${listingId}: ${description} = ${paymentIntentPayload.amount}p total`);

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer_email: user.email || undefined,
            line_items: [{
                price_data: {
                    currency: 'gbp',
                    product_data: { name: 'Arkana listing fee', description: `${description} for "${deckTitle}"` },
                    unit_amount: grandTotalPence,
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
                authentication_fee_pence: String(authenticationFeeTotal),
                insertion_fee_pence: String(insertionFeeTotal),
                grand_total_fee_pence: String(grandTotalPence),
                product: 'listing_fee',
            },
        });
        return res.status(200).json({ url: session.url, feePence: grandTotalPence });
    } catch (error) {
        logServerError('billing:listing-fee', error);
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to start listing fee checkout.' });
    }
}

// Charges the pre-computed stacked fee for a unified-batch-pipeline submission (single or
// multi-deck). The amount was already calculated and stored on upload_batches by submit-listing-batch.
async function createListingBatchFeeCheckout(res, stripe, supabase, user, body) {
    try {
        const batchId = body.batchId;
        if (!batchId) return res.status(400).json({ error: 'A batch ID is required.' });

        const { data: batch, error: batchError } = await supabase
            .from('upload_batches')
            .select('id, seller_id, deck_count, grand_total_fee_pence, status')
            .eq('id', batchId)
            .eq('seller_id', user.id)
            .maybeSingle();
        if (batchError) throw batchError;
        if (!batch) return res.status(404).json({ error: 'Upload batch not found.' });
        if (batch.status !== 'pending_payment') return res.status(409).json({ error: 'This batch is not awaiting payment.' });

        console.log(`[arkana:billing:listing-batch-fee] charging batch ${batchId}: ${batch.grand_total_fee_pence}p for ${batch.deck_count} deck(s)`);

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer_email: user.email || undefined,
            line_items: [{
                price_data: {
                    currency: 'gbp',
                    product_data: { name: 'Arkana listing fee', description: `${batch.deck_count} deck(s) submitted in this batch` },
                    unit_amount: batch.grand_total_fee_pence,
                },
                quantity: 1,
            }],
            success_url: body.successUrl || `${APP_URL}/?listing-fee=success`,
            cancel_url: body.cancelUrl || `${APP_URL}/?listing-fee=cancelled`,
            metadata: { seller_id: user.id, batch_id: batchId, product: 'listing_batch_fee' },
        });
        return res.status(200).json({ url: session.url, feePence: batch.grand_total_fee_pence });
    } catch (error) {
        logServerError('billing:listing-batch-fee', error);
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to start listing batch fee checkout.' });
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
