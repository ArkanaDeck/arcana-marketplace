import { createClient } from '@supabase/supabase-js';
import { logServerError } from '../server/lib/server-logger.js';
import { calculateBatchAuthenticationFeePence } from '../server/lib/tarot-batch-billing.js';
import { runVisionAuthenticationCheck } from '../server/lib/tarot-vision-check.js';
import { computeBatchFeeBreakdown } from '../server/lib/listing-fee-engine.js';
import { assessListingRisk } from '../server/lib/listing-risk-check.js';
import { verifyCardListingImages } from '../server/lib/card-listing-vision.js';

// Consolidated tarot authentication hub (submit-batch / status / vision-check / submit-listing-batch), routed via ?action=.
// Merged from three separate files to stay under Vercel's serverless function count limit.
export default async function handler(req, res) {
    const action = req.query?.action;

    if (req.method === 'GET' && action === 'status') return getBatchStatus(req, res);
    if (req.method === 'POST' && action === 'submit-batch') return submitListingBatch(req, res);
    if (req.method === 'POST' && action === 'authenticate-vision') return authenticateDeckVision(req, res);
    if (req.method === 'POST' && action === 'submit-listing-batch') return submitUnifiedListingBatch(req, res);
    return res.status(400).json({ error: 'Unknown tarot action.' });
}

async function getAuthenticatedUser(req, res) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!supabaseUrl || !supabaseServiceRoleKey) {
        res.status(503).json({ error: 'Tarot authentication is not configured yet.' });
        return null;
    }
    if (!token) {
        res.status(401).json({ error: 'Sign in first.' });
        return null;
    }
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
        res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
        return null;
    }
    return { supabase, user };
}

// Read-only status check for the polling UI: never exposes other sellers' batches.
async function getBatchStatus(req, res) {
    const auth = await getAuthenticatedUser(req, res);
    if (!auth) return;
    const { supabase, user } = auth;
    const batchId = req.query?.batchId;
    if (!batchId) return res.status(400).json({ error: 'A batch ID is required.' });

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

// Pre-listing security interceptor: every deck is run through vision authentication BEFORE it can ever go live.
// Listings are inserted as 'pending_authentication' and never become searchable/viewable until the batch fee is paid
// (enforced separately by the "buyers only see active tarot listings" RLS policy, not just this endpoint).
async function submitListingBatch(req, res) {
    const auth = await getAuthenticatedUser(req, res);
    if (!auth) return;
    const { supabase, user } = auth;

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
        logServerError('tarot:submit-batch', error);
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to submit this listing batch.' });
    }
}

// 5 MB decoded-image cap per image, enforced on the base64 STRING LENGTH before any decoding happens.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
const OPENAI_VISION_MODEL = 'gpt-4o-mini';
const MIN_AUTHENTIC_CONFIDENCE_PERCENT = 70;

function stripDataUrlPrefix(value) {
    return typeof value === 'string' ? value.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '') : '';
}

// Rejects oversized payloads by inspecting the base64 string length first — never decodes/parses
// a buffer that's already known to be too large. Returns a Buffer only once the size check passes.
function decodeImageWithSizeGuard(base64Value, label) {
    const base64 = stripDataUrlPrefix(base64Value);
    if (!base64) throw new Error(`${label} image is required.`);
    if (base64.length > MAX_BASE64_LENGTH) throw new Error(`${label} image exceeds the ${MAX_IMAGE_BYTES / (1024 * 1024)}MB size limit.`);

    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > MAX_IMAGE_BYTES) throw new Error(`${label} image exceeds the ${MAX_IMAGE_BYTES / (1024 * 1024)}MB size limit.`);
    return buffer;
}

async function callOpenAiVision(apiKey, images) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
            model: OPENAI_VISION_MODEL,
            messages: [
                {
                    role: 'system',
                    content: [
                        'You are an expert Tarot Art Archivist and Print Quality Inspector.',
                        'Analyze the submitted tarot card images for signs of being AI-generated, a counterfeit clone, or an authentic artist deck.',
                        'Scan for: (1) ANOMALIES — mangled lines, asymmetric borders, erratic glyphs, text gibberish, or unnatural anatomy (extra fingers, floating eyes) that betray AI image generation; (2) PRINT PATTERNS — compression artifacts or poor-resolution upscaling suggesting a stolen web asset printed illegally; (3) ART STYLE CONTEXT — whether this matches a known, mass-copied commercial deck (e.g. Rider-Waite variations, popular indie decks).',
                        'Respond ONLY with compact JSON: {"verdict":"Authentic"|"Suspected AI-Generated"|"Potential Counterfeit Copy"|"Inconclusive","confidencePercent":0-100,"observations":["...","..."]}.',
                    ].join(' '),
                },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Authenticate this tarot deck submission using the artwork, silver stamp, and certification letter images below.' },
                        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${images.artwork.toString('base64')}` } },
                        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${images.silverStamp.toString('base64')}` } },
                        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${images.certification.toString('base64')}` } },
                    ],
                },
            ],
            response_format: { type: 'json_object' },
            max_tokens: 400,
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`OpenAI vision request failed (${response.status}): ${errorBody.slice(0, 200)}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenAI vision response did not include a verdict.');

    let parsed;
    try {
        parsed = JSON.parse(content);
    } catch {
        throw new Error('OpenAI vision response was not valid JSON.');
    }

    const confidencePercent = Number.isFinite(Number(parsed.confidencePercent)) ? Math.max(0, Math.min(100, Number(parsed.confidencePercent))) : 0;
    const observations = Array.isArray(parsed.observations) ? parsed.observations.filter((item) => typeof item === 'string') : [];
    const isAuthentic = parsed.verdict === 'Authentic' && confidencePercent >= MIN_AUTHENTIC_CONFIDENCE_PERCENT;

    return {
        verdict: isAuthentic ? 'SECURE' : 'REJECTED',
        reason: observations[0] || parsed.verdict,
        archivistVerdict: parsed.verdict,
        confidencePercent,
        observations,
    };
}

// Accepts three base64 images (card art, silver stamp, certification letter) and returns an
// OpenAI vision authentication verdict. OPENAI_API_KEY never leaves this handler.
async function authenticateDeckVision(req, res) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const openAiApiKey = process.env.OPENAI_API_KEY || '';
    if (!supabaseUrl || !supabaseServiceRoleKey || !openAiApiKey) {
        return res.status(503).json({ error: 'Tarot deck vision authentication is not configured yet.' });
    }

    const auth = await getAuthenticatedUser(req, res);
    if (!auth) return;
    const { user } = auth;

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

        let images;
        try {
            images = {
                artwork: decodeImageWithSizeGuard(body.cardArtBase64, 'Card art'),
                silverStamp: decodeImageWithSizeGuard(body.silverStampBase64, 'Silver stamp'),
                certification: decodeImageWithSizeGuard(body.certificationLetterBase64, 'Certification letter'),
            };
        } catch (sizeError) {
            return res.status(413).json({ error: sizeError instanceof Error ? sizeError.message : 'One or more images are invalid.' });
        }

        const verdict = await callOpenAiVision(openAiApiKey, images);
        return res.status(200).json(verdict);
    } catch (error) {
        logServerError('tarot:authenticate-vision', error, { userId: user.id });
        return res.status(502).json({ error: error instanceof Error ? error.message : 'Unable to complete vision authentication.' });
    }
}

// ============================================================================
// UNIFIED BATCH PIPELINE — single-listing submissions (a batch of 1) and multi-deck submissions
// both go through this one code path. Creates an upload_batches row + one or more `listings` rows,
// computes the stacked fee across the whole batch, and either approves instantly (fee = 0) or
// leaves it pending_payment for the webhook to atomically activate once the Stripe fee clears.
// ============================================================================
async function submitUnifiedListingBatch(req, res) {
    const auth = await getAuthenticatedUser(req, res);
    if (!auth) return;
    const { supabase, user } = auth;

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const decks = Array.isArray(body.decks) ? body.decks : [];
        if (decks.length === 0) return res.status(400).json({ error: 'A batch must contain at least one deck.' });

        for (const deck of decks) {
            if (!['sale', 'swap', 'free'].includes(deck?.listingType)) return res.status(400).json({ error: 'Each deck needs a valid listing type.' });
            if (!deck?.name?.trim()) return res.status(400).json({ error: 'Every deck needs a name.' });
            const price = Number(deck.price) || 0;
            if (deck.listingType === 'sale' && price <= 0) return res.status(400).json({ error: 'Sale listings must have a price greater than zero.' });
            if (deck.listingType !== 'sale' && price !== 0) return res.status(400).json({ error: 'Swap and free listings must have a price of 0.00.' });
            if (!Array.isArray(deck.images) || deck.images.length === 0) return res.status(400).json({ error: 'Every deck needs at least one image already uploaded to storage.' });
        }

        const verificationResults = [];
        for (const deck of decks) {
            const verification = await verifyCardListingImages(deck);
            if (!verification.authenticated) {
                return res.status(422).json({
                    error: verification.reasoning,
                    reasoning: verification.reasoning,
                    confidence: verification.confidence,
                    verified: verification.verified,
                });
            }
            verificationResults.push(verification);
        }

        const { data: batch, error: batchError } = await supabase
            .from('upload_batches')
            .insert({ seller_id: user.id, deck_count: decks.length, fee_amount: 0, status: 'pending_authentication' })
            .select('id, deck_count')
            .single();
        if (batchError || !batch) throw new Error(batchError?.message || 'Unable to create upload batch.');

        const insertedListings = [];
        for (const [index, deck] of decks.entries()) {
            const verification = verificationResults[index];
            const requiresManualReview = false;
            const authenticationReason = verification.reasoning;

            const { data: listing, error: listingError } = await supabase
                .from('listings')
                .insert({
                    batch_id: batch.id,
                    seller_id: user.id,
                    name: deck.name.trim(),
                    price: Number(deck.price) || 0,
                    description: deck.description || null,
                    listing_type: deck.listingType,
                    image: deck.images[0] || null,
                    images: deck.images,
                    is_free_delivery: deck.listingType !== 'free' && Boolean(deck.freeDelivery),
                    condition: deck.condition || 'good',
                    review_status: 'pending_review',
                    requires_manual_review: requiresManualReview,
                    authenticated: verification.authenticated,
                })
                .select('id, seller_id, name, price, description, listing_type, image, images, is_free_delivery, condition, review_status, authenticated')
                .single();
            if (listingError || !listing) throw new Error(listingError?.message || 'Unable to save a listing in this batch.');
            insertedListings.push({ ...listing, authenticationReason });
        }

        // Active rollout: listing publication and AI authentication are free. The legacy
        // stacked-fee engine remains in server/lib/listing-fee-engine.js and the old billing
        // routes remain available, but are intentionally dormant until this flag is enabled.
        const LEGACY_LISTING_FEES_ENABLED = false;
        if (LEGACY_LISTING_FEES_ENABLED) {
            const { authenticationFeeTotal, insertionFeeTotal, grandTotalPence } = await computeBatchFeeBreakdown(supabase, user.id, decks);
            const { error: pendingError } = await supabase
                .from('upload_batches')
                .update({ status: 'pending_payment', fee_amount: grandTotalPence / 100, authentication_fee_pence: authenticationFeeTotal, insertion_fee_pence: insertionFeeTotal, grand_total_fee_pence: grandTotalPence })
                .eq('id', batch.id);
            if (pendingError) throw pendingError;
            return res.status(200).json({ batchId: batch.id, feePence: grandTotalPence, requiresPayment: true, listings: insertedListings });
        }

        const { error: activateError } = await supabase
            .from('listings')
            .update({ review_status: 'approved' })
            .eq('batch_id', batch.id)
            .eq('review_status', 'pending_review')
            .eq('requires_manual_review', false)
            .eq('authenticated', true);
        if (activateError) throw activateError;
        const { error: batchCompleteError } = await supabase.from('upload_batches').update({ status: 'paid', fee_amount: 0 }).eq('id', batch.id);
        if (batchCompleteError) throw batchCompleteError;
        console.log(`[arkana:tarot:submit-listing-batch] batch ${batch.id} approved with no listing/authentication fee`);
        return res.status(200).json({ batchId: batch.id, feePence: 0, requiresPayment: false, listings: insertedListings });
    } catch (error) {
        logServerError('tarot:submit-listing-batch', error);
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to submit this listing batch.' });
    }
}
