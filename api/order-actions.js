import { createClient } from '@supabase/supabase-js';
import { sendTransactionalEmail } from '../server/lib/server-email.js';

// Consolidated hub for buyer/seller order-lifecycle actions (dispatch/mark-delivered/confirm-received/report-problem).
// Merged from four separate files to stay under Vercel's serverless function count limit — routed via ?action=.
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!supabaseUrl || !serviceRoleKey) return res.status(503).json({ error: 'Order actions are not configured yet.' });
    if (!token) return res.status(401).json({ error: 'Sign in before managing this order.' });

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const action = req.query?.action;

    if (action === 'dispatch') return dispatchOrder(res, supabase, user, body);
    if (action === 'mark-delivered') return markOrderDelivered(res, supabase, user, body);
    if (action === 'confirm-received') return confirmOrderReceived(res, supabase, user, body);
    if (action === 'report-problem') return reportOrderProblem(res, supabase, user, body);
    return res.status(400).json({ error: 'Unknown order action.' });
}

async function dispatchOrder(res, supabase, user, body) {
    try {
        if (!body.orderId || !String(body.trackingReference || '').trim()) return res.status(400).json({ error: 'Order ID and tracking reference are required.' });
        const { data: order, error: orderError } = await supabase.from('orders').select('id, status, delivery_email, listings(seller_id, name)').eq('id', body.orderId).single();
        const sellerId = order?.listings?.seller_id;
        if (orderError || !order || sellerId !== user.id) return res.status(404).json({ error: 'Order not found.' });
        if (order.status !== 'paid') return res.status(409).json({ error: 'Only paid orders can be dispatched.' });
        const { error } = await supabase.from('orders').update({ status: 'dispatched', tracking_reference: String(body.trackingReference).trim(), dispatched_at: new Date().toISOString() }).eq('id', order.id);
        if (error) throw error;
        await sendTransactionalEmail({ to: order.delivery_email, subject: 'Arkana: your order is on its way', text: `Your ${order.listings?.name || 'order'} has been dispatched. Tracking reference: ${String(body.trackingReference).trim()}` });
        return res.status(200).json({ dispatched: true });
    } catch (error) {
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to dispatch this order.' });
    }
}

async function markOrderDelivered(res, supabase, user, body) {
    try {
        if (!body.orderId) return res.status(400).json({ error: 'Order ID is required.' });
        const { data: order, error: orderError } = await supabase.from('orders').select('id, buyer_id, status, payout_status, delivery_email').eq('id', body.orderId).single();
        if (orderError || !order || order.buyer_id !== user.id) return res.status(404).json({ error: 'Order not found.' });
        if (order.status !== 'dispatched') return res.status(409).json({ error: 'This order must be dispatched before delivery can be confirmed.' });
        const deliveredAt = new Date().toISOString();
        const { error } = await supabase.from('orders').update({ status: 'delivered', delivered_at: deliveredAt }).eq('id', order.id).eq('payout_status', 'held');
        if (error) throw error;
        await sendTransactionalEmail({ to: order.delivery_email || user.email, subject: 'Arkana: your review window has started', text: 'Your order is marked delivered. Confirm it is as described to release the seller payout, or report a problem. If no action is taken, payout is released 48 hours after delivery.' });
        return res.status(200).json({ delivered: true, payoutReleaseAfter: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() });
    } catch (error) {
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to mark this order as delivered.' });
    }
}

async function confirmOrderReceived(res, supabase, user, body) {
    try {
        if (!body.orderId) return res.status(400).json({ error: 'Order ID is required.' });
        const { data: order, error: orderError } = await supabase.from('orders').select('id, buyer_id, listing_id, total, status, payout_status, listings(seller_id)').eq('id', body.orderId).single();
        if (orderError || !order || order.buyer_id !== user.id) return res.status(404).json({ error: 'Order not found.' });
        if (!['dispatched', 'delivered'].includes(order.status)) return res.status(400).json({ error: 'This order must be dispatched before it can be confirmed.' });
        if (order.payout_status === 'released') return res.status(200).json({ released: true });
        const { error: updateError } = await supabase.from('orders').update({ status: 'completed', buyer_confirmed_at: new Date().toISOString(), payout_status: 'released' }).eq('id', order.id).eq('payout_status', 'held');
        if (updateError) throw updateError;
        return res.status(200).json({ released: true });
    } catch (error) {
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to release the seller payout.' });
    }
}

async function reportOrderProblem(res, supabase, user, body) {
    try {
        if (!body.orderId || !String(body.reason || '').trim()) return res.status(400).json({ error: 'Tell us what went wrong.' });
        const { data: order, error: orderError } = await supabase.from('orders').select('id, buyer_id, payout_status').eq('id', body.orderId).single();
        if (orderError || !order || order.buyer_id !== user.id) return res.status(404).json({ error: 'Order not found.' });
        if (order.payout_status === 'released') return res.status(409).json({ error: 'This payout has already been released.' });
        const { error } = await supabase.from('orders').update({ status: 'disputed', payout_status: 'blocked', dispute_reason: String(body.reason).trim() }).eq('id', order.id);
        if (error) throw error;
        return res.status(200).json({ reported: true });
    } catch (error) {
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to report this problem.' });
    }
}
