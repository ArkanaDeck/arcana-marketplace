import { createClient } from '@supabase/supabase-js';
import { logServerError } from '../server/lib/server-logger.js';
import { calculateBatchAuthenticationFeePence } from '../server/lib/tarot-batch-billing.js';
import { runVisionAuthenticationCheck } from '../server/lib/tarot-vision-check.js';

// Pre-listing security interceptor: every deck is run through vision authentication BEFORE it can ever go live.
// Listings are inserted as 'pending_authentication' and never become searchable/viewable until the batch fee is paid
// (enforced separately by the "buyers only see active tarot listings" RLS policy, not just this endpoint).
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');

    if (!supabaseUrl || !supabaseServiceRoleKey) return res.status(503).json({ error: 'Tarot authentication is not configured yet.' });
    if (!token) return res.status(401).json({ error: 'Sign in before submitting a listing batch.' });

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const decks = Array.isArray(body.decks) ? body.decks : [];
        if (decks.length === 0) return res.status(400).json({ error: 'A batch must contain at least one deck.' });

        for (const deck of decks) {
            if (!deck?.name?.trim() || !Number.isFinite(Number(deck.price)) || Number(deck.price) < 0) {
                return res.status(400).json({ error: 'Every deck needs a name and a valid price.' });
            }
            if (!Array.isArray(deck.images) || deck.images.length === 0) {
                return res.status(400).json({ error: 'Every deck needs at least one artwork image already uploaded to storage.' });
            }
        }

        const feePence = calculateBatchAuthenticationFeePence(decks.length);

        const { data: batch, error: batchError } = await supabase
            .from('upload_batches')
            .insert({ seller_id: user.id, deck_count: decks.length, fee_amount: feePence / 100, status: 'pending_authentication' })
            .select('id, deck_count, fee_amount, status')
            .single();
        if (batchError || !batch) throw new Error(batchError?.message || 'Unable to create upload batch.');

        const authenticationResults = [];
        for (const deck of decks) {
            const verdict = await runVisionAuthenticationCheck({
                name: deck.name,
                artworkImageUrl: deck.images[0],
                silverStampImageUrl: deck.silverStampImage,
                certificationImageUrl: deck.certificationImage,
            });
            const isAuthenticated = verdict.verdict === 'SECURE';

            const { data: listing, error: listingError } = await supabase
                .from('tarot_listings')
                .insert({
                    batch_id: batch.id,
                    seller_id: user.id,
                    name: deck.name.trim(),
                    price: Number(deck.price),
                    description: deck.description || null,
                    condition: deck.condition || 'good',
                    images: deck.images,
                    silver_stamp_image: deck.silverStampImage || null,
                    certification_image: deck.certificationImage || null,
                    is_authenticated: isAuthenticated,
                    authentication_reason: verdict.reason || null,
                    status: isAuthenticated ? 'pending_authentication' : 'rejected',
                })
                .select('id, name, is_authenticated, status, authentication_reason')
                .single();
            if (listingError || !listing) throw new Error(listingError?.message || 'Unable to save a listing in this batch.');
            authenticationResults.push(listing);
        }

        const anyAuthenticated = authenticationResults.some((listing) => listing.is_authenticated);
        const { error: batchStatusError } = await supabase
            .from('upload_batches')
            .update({ status: anyAuthenticated ? 'pending_payment' : 'failed' })
            .eq('id', batch.id);
        if (batchStatusError) throw new Error(batchStatusError.message);

        return res.status(200).json({
            batchId: batch.id,
            feeAmount: feePence / 100,
            requiresPayment: anyAuthenticated,
            listings: authenticationResults,
        });
    } catch (error) {
        logServerError('submit-tarot-listing-batch', error);
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to submit this listing batch.' });
    }
}
