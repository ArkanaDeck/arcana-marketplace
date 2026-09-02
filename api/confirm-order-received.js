import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!stripeSecretKey.startsWith('sk_') || !supabaseUrl || !serviceRoleKey) return res.status(503).json({ error: 'Payout confirmation is not configured yet.' });
    if (!token) return res.status(401).json({ error: 'Sign in before confirming an order.' });

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        if (!body.orderId) return res.status(400).json({ error: 'Order ID is required.' });
        const supabase = createClient(supabaseUrl, serviceRoleKey);
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
        const { data: order, error: orderError } = await supabase.from('orders').select('id, buyer_id, listing_id, total, status, payout_status, listings(seller_id)').eq('id', body.orderId).single();
        if (orderError || !order || order.buyer_id !== user.id) return res.status(404).json({ error: 'Order not found.' });
        if (!['dispatched', 'delivered'].includes(order.status)) return res.status(400).json({ error: 'This order must be dispatched before it can be confirmed.' });
        if (order.payout_status === 'released') return res.status(200).json({ released: true });
        const sellerId = order.listings?.seller_id;
        const { data: seller, error: sellerError } = await supabase.from('profiles').select('stripe_connect_account_id').eq('id', sellerId).single();
        if (sellerError || !seller?.stripe_connect_account_id) return res.status(409).json({ error: 'Seller payouts are not set up yet.' });
        const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });
        const transfer = await stripe.transfers.create({ amount: Math.round(Number(order.total) * 100), currency: 'gbp', destination: seller.stripe_connect_account_id, metadata: { order_id: order.id } }, { idempotencyKey: `order-payout-${order.id}` });
        const { error: updateError } = await supabase.from('orders').update({ status: 'completed', buyer_confirmed_at: new Date().toISOString(), payout_status: 'released', stripe_transfer_id: transfer.id }).eq('id', order.id).eq('payout_status', 'held');
        if (updateError) throw updateError;
        return res.status(200).json({ released: true });
    } catch (error) {
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to release the seller payout.' });
    }
}