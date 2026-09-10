import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { logServerError } from '../server/lib/server-logger.js';
import { isValidHttpUrl } from '../server/lib/url-validation.js';

const WEBSITE_LINK_FEE_PENCE = 200;
const WEBSITE_LINK_DAYS = 30;

// Seller-level (not per-listing) £2/30-day website link. Calling this again while still active
// renews it — the webhook always resets the expiry to 30 days from the moment payment clears.
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');

    if (!stripeSecretKey.startsWith('sk_') || !supabaseUrl || !supabaseServiceRoleKey) {
        return res.status(503).json({ error: 'Website links are not configured yet.' });
    }
    if (!token) return res.status(401).json({ error: 'Sign in before linking your website.' });

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const websiteUrl = String(body.websiteUrl || '').trim();
        if (!isValidHttpUrl(websiteUrl)) return res.status(400).json({ error: 'Enter a valid website URL starting with http:// or https://.' });

        const { error: updateError } = await supabase.from('profiles').update({ website_url: websiteUrl }).eq('id', user.id);
        if (updateError) throw updateError;

        const appUrl = process.env.VITE_APP_URL || process.env.APP_URL || 'http://localhost:5173';
        const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });
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
            success_url: body.successUrl || `${appUrl}/?website-link=success`,
            cancel_url: body.cancelUrl || `${appUrl}/?website-link=cancelled`,
            metadata: { seller_id: user.id, product: 'website_link_rental' },
        });
        return res.status(200).json({ url: session.url });
    } catch (error) {
        logServerError('rent-website-link', error);
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to start website link checkout.' });
    }
}
