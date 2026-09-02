import { createClient } from '@supabase/supabase-js';
import { sendTransactionalEmail } from '../src/lib/server-email.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!supabaseUrl || !serviceRoleKey) return res.status(503).json({ error: 'Delivery confirmation is not configured yet.' });
    if (!token) return res.status(401).json({ error: 'Sign in before confirming delivery.' });
    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        if (!body.orderId) return res.status(400).json({ error: 'Order ID is required.' });
        const supabase = createClient(supabaseUrl, serviceRoleKey);
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
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