import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { calculatePlatformFeeCents } from '../server/lib/server-fees.js';
import { logServerError } from '../server/lib/server-logger.js';

const SHIPPING_FEE = 2.99;
const SHIPPING_LABEL = 'Evri Standard Drop-off (2-3 Days)';

export default async function handler(req, res) {
    if (req.query?.checkout_success === '1') return handleCheckoutSuccess(req, res);
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
        const address = body.deliveryAddress || {};
        const listingIds = [...new Set(Array.isArray(body.listingIds) ? body.listingIds : [])];
        if (listingIds.length < 1 || !address.name || !address.email || !address.addressLineOne || !address.city || !address.postcode) {
            return res.status(400).json({ error: 'Choose one or more listings, then provide a delivery address.' });
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
        if (sellerId === user.id || listings.some((listing) => listing.seller_id !== sellerId)) return res.status(400).json({ error: 'Choose one or more listings from the same seller.' });
        const { data: seller, error: sellerError } = await supabase.from('profiles').select('stripe_connect_account_id').eq('id', sellerId).single();
        if (sellerError || !seller?.stripe_connect_account_id) return res.status(409).json({ error: 'Seller payouts are not set up yet.' });
        const shippingAmount = SHIPPING_FEE;
        const activeSubtotal = listings.reduce((sum, listing) => sum + Number(listing.price), 0);
        const transactionFee = Math.round((activeSubtotal * 0.029 + 0.30) * 100) / 100;

        const { data: orders, error: orderError } = await supabase
            .from('orders')
            .insert(listings.map((listing, index) => ({
                buyer_id: user.id, listing_id: listing.id, status: 'pending_payment', subtotal: Number(listing.price),
                shipping: index === 0 ? shippingAmount : 0, platform_fee: index === 0 ? transactionFee : 0,
                total: Number(listing.price) + (index === 0 ? shippingAmount + transactionFee : 0),
                grand_total: Number(listing.price) + (index === 0 ? shippingAmount + transactionFee : 0),
                delivery_name: address.name, delivery_email: address.email, delivery_address_line_1: address.addressLineOne,
                delivery_address_line_2: address.addressLineTwo || null, delivery_city: address.city, delivery_postcode: address.postcode,
                delivery_country: 'United Kingdom', delivery_service: SHIPPING_LABEL,
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
                { price_data: { currency: 'gbp', product_data: { name: SHIPPING_LABEL }, unit_amount: Math.round(shippingAmount * 100) }, quantity: 1 },
                { price_data: { currency: 'gbp', product_data: { name: 'Stripe transaction fee' }, unit_amount: Math.round(transactionFee * 100) }, quantity: 1 },
            ],
            success_url: `${appUrl}/api/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: body.cancelUrl || `${appUrl}/cancel`,
            metadata: {
                product: 'marketplace_order',
                order_ids: orders.map((order) => order.id).join(','),
                seller_id: sellerId,
                courier_redirect_url: 'https://evri.com',
                requires_shipping_redirect: 'true',
                shipping_fee_collected: SHIPPING_FEE.toFixed(2),
                buyer_name: address.name,
                buyer_address_line1: address.addressLineOne,
                buyer_city: address.city,
                buyer_postcode: address.postcode,
            },
            payment_intent_data: {
                application_fee_amount: calculatePlatformFeeCents(orderTotal, 'stripe'),
                transfer_data: { destination: seller.stripe_connect_account_id },
            },
        });

        return res.status(200).json({ orderIds: orders.map((order) => order.id), url: session.url });
    } catch (error) {
        logServerError('create-order-checkout', error);
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to start checkout.' });
    }
}

async function handleCheckoutSuccess(req, res) {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
    const sessionId = String(req.query?.session_id || '');
    if (!stripeSecretKey.startsWith('sk_') || !sessionId) return res.status(400).send('Checkout session is unavailable.');

    try {
        const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const courierRedirectUrl = session.metadata?.courier_redirect_url;
        if (session.payment_status === 'paid' && session.metadata?.requires_shipping_redirect === 'true' && courierRedirectUrl) {
            return res.redirect(303, courierRedirectUrl);
        }
        return res.redirect(303, process.env.VITE_APP_URL || process.env.APP_URL || '/');
    } catch {
        return res.status(400).send('Unable to verify checkout session.');
    }
}