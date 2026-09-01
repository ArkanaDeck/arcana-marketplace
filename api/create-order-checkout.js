import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const SHIPPING_OPTIONS = {
    evri_standard: { amount: 2.99, label: 'Evri Standard Drop-off' },
    royal_mail_48: { amount: 3.65, label: 'Royal Mail Tracked 48' },
    royal_mail_24: { amount: 4.65, label: 'Royal Mail Tracked 24' },
};

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!stripeSecretKey.startsWith('sk_') || !supabaseUrl || !supabaseServiceRoleKey) {
        return res.status(503).json({ error: 'Checkout is not configured yet.' });
    }
    if (!token) return res.status(401).json({ error: 'Sign in before checking out.' });

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const shipping = SHIPPING_OPTIONS[body.shippingOption];
        const address = body.deliveryAddress || {};
        if (!body.listingId || !shipping || !address.name || !address.email || !address.addressLineOne || !address.city || !address.postcode) {
            return res.status(400).json({ error: 'Listing, delivery address, and shipping option are required.' });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });

        const { data: listing, error: listingError } = await supabase
            .from('listings')
            .select('id, name, price, seller_id')
            .eq('id', body.listingId)
            .maybeSingle();
        if (listingError || !listing || !listing.seller_id) return res.status(404).json({ error: 'This listing is no longer available.' });
        if (listing.seller_id === user.id) return res.status(400).json({ error: 'You cannot buy your own listing.' });

        const subtotal = Number(listing.price);
        const total = subtotal + shipping.amount;
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert({
                buyer_id: user.id,
                listing_id: listing.id,
                status: 'pending_payment',
                subtotal,
                shipping: shipping.amount,
                total,
                delivery_name: address.name,
                delivery_email: address.email,
                delivery_address_line_1: address.addressLineOne,
                delivery_address_line_2: address.addressLineTwo || null,
                delivery_city: address.city,
                delivery_postcode: address.postcode,
                delivery_country: 'United Kingdom',
                delivery_service: shipping.label,
            })
            .select('id')
            .single();
        if (orderError || !order) throw orderError || new Error('Unable to create the pending order.');

        const appUrl = process.env.VITE_APP_URL || process.env.APP_URL || 'http://localhost:5173';
        const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer_email: user.email || address.email,
            line_items: [
                { price_data: { currency: 'gbp', product_data: { name: listing.name }, unit_amount: Math.round(subtotal * 100) }, quantity: 1 },
                { price_data: { currency: 'gbp', product_data: { name: shipping.label }, unit_amount: Math.round(shipping.amount * 100) }, quantity: 1 },
            ],
            success_url: `${body.successUrl || `${appUrl}/success`}?order_id=${order.id}`,
            cancel_url: body.cancelUrl || `${appUrl}/cancel`,
            metadata: { product: 'marketplace_order', order_id: order.id },
        });

        return res.status(200).json({ orderId: order.id, url: session.url });
    } catch (error) {
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to start checkout.' });
    }
}