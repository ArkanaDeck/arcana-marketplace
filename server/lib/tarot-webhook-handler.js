// Pure webhook event handler for the tarot batch authentication fee, decoupled from Stripe signature
// verification and HTTP so it can be unit tested with fake events and a mocked Supabase client.
export async function handleTarotBatchWebhookEvent(event, { supabase, logServerEvent = () => { } }) {
    if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        const batchId = paymentIntent.metadata?.batch_id;
        if (!batchId) throw new Error('PaymentIntent is missing batch_id metadata.');

        const { data: activated, error } = await supabase.rpc('activate_tarot_batch', {
            target_batch_id: batchId,
            payment_stripe_session_id: paymentIntent.id,
        });
        if (error) throw error;
        logServerEvent('webhooks/stripe', 'tarot_batch_activated', { batchId, activated });
        return { handled: true, batchId, activated: Boolean(activated) };
    }

    if (event.type === 'payment_intent.payment_failed') {
        const paymentIntent = event.data.object;
        const batchId = paymentIntent.metadata?.batch_id;
        if (batchId) {
            const { error } = await supabase
                .from('upload_batches')
                .update({ status: 'failed' })
                .eq('id', batchId)
                .eq('status', 'pending_payment');
            if (error) throw error;
            logServerEvent('webhooks/stripe', 'tarot_batch_payment_failed', { batchId, reason: paymentIntent.last_payment_error?.message });
        }
        return { handled: true, batchId: batchId || null };
    }

    return { handled: false, batchId: null };
}
