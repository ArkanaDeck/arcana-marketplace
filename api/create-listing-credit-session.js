import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const LISTING_BUNDLE_PRICE = 0.66;
const LISTING_BUNDLE_CREDITS = 3;

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');

    if (!stripeSecretKey.startsWith('sk_') || !supabaseUrl || !supabaseServiceRoleKey) {
        return res.status(503).json({ error: 'Listing credits are not configured yet.' });
    }
    if (!token) return res.status(401).json({ error: 'Sign in before buying listing credits.' });

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const appUrl = process.env.VITE_APP_URL || process.env.APP_URL || 'http://localhost:5173';
        const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer_email: user.email || undefined,
            line_items: [{
                price_data: {
                    currency: 'gbp',
                    product_data: { name: 'Arkana listing credits', description: 'Three listing credits' },
                    unit_amount: 66,
                },
                quantity: 1,
            }],
            success_url: body.successUrl || `${appUrl}/?listing-credits=success`,
            cancel_url: body.cancelUrl || `${appUrl}/?listing-credits=cancelled`,
            metadata: { seller_id: user.id, credits: String(LISTING_BUNDLE_CREDITS), product: 'listing_credits' },
        });
        return res.status(200).json({ url: session.url, amount: LISTING_BUNDLE_PRICE, credits: LISTING_BUNDLE_CREDITS });
    } catch (error) {
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to create listing credit checkout.' });
    }
}