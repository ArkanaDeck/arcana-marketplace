import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!supabaseUrl || !serviceRoleKey) return res.status(503).json({ error: 'Payout confirmation is not configured yet.' });
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
        const { error: updateError } = await supabase.from('orders').update({ status: 'completed', buyer_confirmed_at: new Date().toISOString(), payout_status: 'released' }).eq('id', order.id).eq('payout_status', 'held');
        if (updateError) throw updateError;
        return res.status(200).json({ released: true });
    } catch (error) {
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to release the seller payout.' });
    }
}