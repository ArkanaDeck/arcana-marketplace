import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!supabaseUrl || !serviceRoleKey) return res.status(503).json({ error: 'Dispute reporting is not configured yet.' });
    if (!token) return res.status(401).json({ error: 'Sign in before reporting a problem.' });
    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        if (!body.orderId || !String(body.reason || '').trim()) return res.status(400).json({ error: 'Tell us what went wrong.' });
        const supabase = createClient(supabaseUrl, serviceRoleKey);
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
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