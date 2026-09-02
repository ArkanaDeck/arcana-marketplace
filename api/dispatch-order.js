import { createClient } from '@supabase/supabase-js';
import { sendTransactionalEmail } from './lib/email.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!supabaseUrl || !serviceRoleKey) return res.status(503).json({ error: 'Order dispatch is not configured yet.' });
    if (!token) return res.status(401).json({ error: 'Sign in before dispatching an order.' });

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        if (!body.orderId || !String(body.trackingReference || '').trim()) return res.status(400).json({ error: 'Order ID and tracking reference are required.' });
        const supabase = createClient(supabaseUrl, serviceRoleKey);
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
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