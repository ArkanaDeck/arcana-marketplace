import { createClient } from '@supabase/supabase-js';

// Read-only status check for the polling UI: never exposes other sellers' batches.
export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const batchId = req.query?.batchId;

    if (!supabaseUrl || !supabaseServiceRoleKey) return res.status(503).json({ error: 'Tarot batch status is not configured yet.' });
    if (!token) return res.status(401).json({ error: 'Sign in to check batch status.' });
    if (!batchId) return res.status(400).json({ error: 'A batch ID is required.' });

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });

    try {
        const { data: batch, error } = await supabase
            .from('upload_batches')
            .select('id, deck_count, fee_amount, status')
            .eq('id', batchId)
            .eq('seller_id', user.id)
            .maybeSingle();
        if (error) throw error;
        if (!batch) return res.status(404).json({ error: 'Upload batch not found.' });

        return res.status(200).json({ status: batch.status, deckCount: batch.deck_count, feeAmount: batch.fee_amount });
    } catch (error) {
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to check batch status.' });
    }
}
