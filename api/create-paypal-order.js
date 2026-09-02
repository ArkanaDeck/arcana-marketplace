import { createClient } from '@supabase/supabase-js';
import { paypalRequest, toPayPalAmount } from '../src/lib/server-paypal.js';

const SHIPPING_OPTIONS = {
    evri_standard: { amount: 2.99, label: 'Evri Standard Drop-off' },
    royal_mail_48: { amount: 3.65, label: 'Royal Mail Tracked 48' },
    royal_mail_24: { amount: 4.65, label: 'Royal Mail Tracked 24' },
};

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!supabaseUrl || !serviceRoleKey || !process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_SECRET_KEY) {
        return res.status(503).json({ error: 'PayPal checkout is not configured yet.' });
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

        const supabase = createClient(supabaseUrl, serviceRoleKey);
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
        const { data: listings, error: listingError } = await supabase.from('listings').select('id, name, price, seller_id, listing_type').in('id', listingIds);
        if (listingError || !listings || listings.length !== listingIds.length || listings.some((listing) => !listing.seller_id || listing.listing_type !== 'sale' || Number(listing.price) <= 0)) {
            return res.status(404).json({ error: 'One or more listings are no longer available for sale.' });
        }
        const sellerId = listings[0].seller_id;
        if (sellerId === user.id || listings.some((listing) => listing.seller_id !== sellerId)) return res.status(400).json({ error: 'Choose up to 3 listings from the same seller.' });

        const { data: orders, error: orderError } = await supabase.from('orders').insert(listings.map((listing, index) => ({
            buyer_id: user.id, listing_id: listing.id, status: 'pending_payment', subtotal: Number(listing.price),
            shipping: index === 0 ? shipping.amount : 0, total: Number(listing.price) + (index === 0 ? shipping.amount : 0),
            delivery_name: address.name, delivery_email: address.email, delivery_address_line_1: address.addressLineOne,
            delivery_address_line_2: address.addressLineTwo || null, delivery_city: address.city, delivery_postcode: address.postcode,
            delivery_country: 'United Kingdom', delivery_service: shipping.label,
        }))).select('id, total');
        if (orderError || !orders?.length) throw orderError || new Error('Unable to create pending orders.');

        const total = orders.reduce((sum, order) => sum + Number(order.total), 0);
        const appUrl = process.env.VITE_APP_URL || process.env.APP_URL || 'http://localhost:5173';
        const paypalOrder = await paypalRequest('/v2/checkout/orders', {
            method: 'POST',
            body: JSON.stringify({
                intent: 'CAPTURE',
                purchase_units: [{ reference_id: orders[0].id, custom_id: orders.map((order) => order.id).join(','), amount: { currency_code: 'GBP', value: toPayPalAmount(total) } }],
                application_context: {
                    brand_name: process.env.VITE_SITE_NAME || 'Arkana', user_action: 'PAY_NOW',
                    return_url: `${appUrl}/?paypal=success`, cancel_url: `${appUrl}/?paypal=cancelled`,
                },
            }),
        });
        const approvalUrl = paypalOrder.links?.find((link) => link.rel === 'approve')?.href;
        if (!approvalUrl) throw new Error('PayPal did not return an approval URL.');
        return res.status(200).json({ orderIds: orders.map((order) => order.id), paypalOrderId: paypalOrder.id, url: approvalUrl });
    } catch (error) {
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to start PayPal checkout.' });
    }
}