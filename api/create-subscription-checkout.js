import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const SELLER_SUBSCRIPTION_MONTHLY_AMOUNT = 4.99;

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');

    if (!stripeSecretKey.startsWith('sk_') || !supabaseUrl || !supabaseServiceRoleKey) {
        return res.status(503).json({ error: 'Seller subscriptions are not configured yet.' });
    }
    if (!token) return res.status(401).json({ error: 'Sign in before subscribing to a seller plan.' });

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const appUrl = process.env.VITE_APP_URL || process.env.APP_URL || 'http://localhost:5173';
        const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });
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
            success_url: body.successUrl || `${appUrl}/?subscription=success`,
            cancel_url: body.cancelUrl || `${appUrl}/?subscription=cancelled`,
            metadata: { seller_id: user.id, product: 'seller_subscription' },
            subscription_data: { metadata: { seller_id: user.id } },
        });
        return res.status(200).json({ url: session.url });
    } catch (error) {
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to create seller subscription checkout.' });
    }
}
