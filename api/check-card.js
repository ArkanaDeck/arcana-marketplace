import { createClient } from '@supabase/supabase-js';
import { verifyCardImageWithOpenAI } from '../server/lib/openai-card-check.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    const openAiApiKey = process.env.OPENAI_API_KEY || '';
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!openAiApiKey) return res.status(503).json({ error: 'Card verification is not configured.' });
    if (!token || !supabaseUrl || !supabaseServiceRoleKey) return res.status(401).json({ error: 'Sign in before verifying a listing.' });

    try {
        const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });

        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const result = await verifyCardImageWithOpenAI(body.imageBase64);
        return res.status(200).json({ ...result, authenticated: result.verified && result.confidence >= 70 });
    } catch (error) {
        return res.status(502).json({ error: error instanceof Error ? error.message : 'Card verification failed.' });
    }
}
