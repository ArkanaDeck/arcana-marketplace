import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { calculatePlatformFeeCents } from '../src/lib/server-fees.js';

const SHIPPING_OPTIONS = {
    evri_standard: { amount: 2.99, label: 'Evri Standard Drop-off' },
    royal_mail_48: { amount: 3.65, label: 'Royal Mail Tracked 48' },
    royal_mail_24: { amount: 4.65, label: 'Royal Mail Tracked 24' },
};

export default async function handler(req, res) {
    if (req.query?.retired === '1') {
        return res.status(410).json({ error: 'This checkout route is retired. Use /api/create-order-checkout.' });
    }
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
        const listingIds = [...new Set(Array.isArray(body.listingIds) ? body.listingIds : [])];
        if (listingIds.length < 1 || listingIds.length > 3 || !shipping || !address.name || !address.email || !address.addressLineOne || !address.city || !address.postcode) {
            return res.status(400).json({ error: 'Choose 1 to 3 listings, then provide a delivery address and shipping option.' });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });

        const { data: listings, error: listingError } = await supabase
            .from('listings')
            .select('id, name, price, seller_id, listing_type, is_free_delivery')
            .in('id', listingIds);
        if (listingError || !listings || listings.length !== listingIds.length || listings.some((listing) => !listing.seller_id || listing.listing_type !== 'sale' || Number(listing.price) <= 0)) {
            return res.status(404).json({ error: 'One or more listings are no longer available for sale.' });
        }
        const sellerId = listings[0].seller_id;
        if (sellerId === user.id || listings.some((listing) => listing.seller_id !== sellerId)) return res.status(400).json({ error: 'Choose up to 3 listings from the same seller.' });
        const { data: seller, error: sellerError } = await supabase.from('profiles').select('stripe_connect_account_id').eq('id', sellerId).single();
        if (sellerError || !seller?.stripe_connect_account_id) return res.status(409).json({ error: 'Seller payouts are not set up yet.' });
        const shippingAmount = listings.some((listing) => listing.is_free_delivery) ? 0 : shipping.amount;

        const { data: orders, error: orderError } = await supabase
            .from('orders')
            .insert(listings.map((listing, index) => ({
                buyer_id: user.id, listing_id: listing.id, status: 'pending_payment', subtotal: Number(listing.price),
                shipping: index === 0 ? shippingAmount : 0, total: Number(listing.price) + (index === 0 ? shippingAmount : 0),
                delivery_name: address.name, delivery_email: address.email, delivery_address_line_1: address.addressLineOne,
                delivery_address_line_2: address.addressLineTwo || null, delivery_city: address.city, delivery_postcode: address.postcode,
                delivery_country: 'United Kingdom', delivery_service: shipping.label,
            })))
            .select('id, total');
        if (orderError || !orders?.length) throw orderError || new Error('Unable to create pending orders.');

        const appUrl = process.env.VITE_APP_URL || process.env.APP_URL || 'http://localhost:5173';
        const orderTotal = orders.reduce((sum, order) => sum + Number(order.total), 0);
        const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer_email: user.email || address.email,
            line_items: [
                ...listings.map((listing) => ({ price_data: { currency: 'gbp', product_data: { name: listing.name }, unit_amount: Math.round(Number(listing.price) * 100) }, quantity: 1 })),
                ...(shippingAmount > 0 ? [{ price_data: { currency: 'gbp', product_data: { name: shipping.label }, unit_amount: Math.round(shippingAmount * 100) }, quantity: 1 }] : []),
            ],
            success_url: `${body.successUrl || `${appUrl}/success`}?order_id=${orders[0].id}`,
            cancel_url: body.cancelUrl || `${appUrl}/cancel`,
            metadata: { product: 'marketplace_order', order_ids: orders.map((order) => order.id).join(',') },
            payment_intent_data: {
                application_fee_amount: calculatePlatformFeeCents(orderTotal, 'stripe'),
                transfer_data: { destination: seller.stripe_connect_account_id },
            },
        });

        return res.status(200).json({ orderIds: orders.map((order) => order.id), url: session.url });
    } catch (error) {
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to start checkout.' });
    }
}