import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { logServerError } from '../../server/lib/server-logger.js';
import { isValidHttpUrl } from '../../server/lib/url-validation.js';

const EXTERNAL_LINK_RENTAL_FEE_PENCE = 200;
const EXTERNAL_LINK_RENTAL_DAYS = 30;

// Flat £2.00 / 30-day fee for a seller to link their own external web store from a listing.
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');

    if (!stripeSecretKey.startsWith('sk_') || !supabaseUrl || !supabaseServiceRoleKey) {
        return res.status(503).json({ error: 'External store links are not configured yet.' });
    }
    if (!token) return res.status(401).json({ error: 'Sign in before renting a store link.' });

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
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

        const appUrl = process.env.VITE_APP_URL || process.env.APP_URL || 'http://localhost:5173';
        const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });
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
            success_url: body.successUrl || `${appUrl}/?external-link=success`,
            cancel_url: body.cancelUrl || `${appUrl}/?external-link=cancelled`,
            metadata: { seller_id: user.id, listing_id: listingId, product: 'external_link_rental' },
        });
        return res.status(200).json({ url: session.url });
    } catch (error) {
        logServerError('listings/rent-link', error);
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to start external link checkout.' });
    }
}
