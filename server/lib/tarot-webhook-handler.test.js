import test from 'node:test';
import assert from 'node:assert/strict';

import { handleTarotBatchWebhookEvent } from './tarot-webhook-handler.js';

// Fake Supabase client: records every call so assertions can check exactly what the handler did,
// standing in for "mocking Stripe signature verification" by feeding in an already-parsed, trusted event.
function createSupabaseMock({ rpcResult = { data: true, error: null }, updateResult = { error: null } } = {}) {
    const calls = { rpc: [], update: [] };
    return {
        calls,
        rpc: async (name, args) => {
            calls.rpc.push({ name, args });
            return rpcResult;
        },
        from: (table) => ({
            update: (values) => {
                calls.update.push({ table, values });
                return { eq: () => ({ eq: async () => updateResult }) };
            },
        }),
    };
}

test('Scenario A: payment_intent.succeeded with a valid batch_id activates authenticated listings', async () => {
    const supabase = createSupabaseMock({ rpcResult: { data: true, error: null } });
    const event = {
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_123', metadata: { batch_id: 'batch-abc' } } },
    };

    const result = await handleTarotBatchWebhookEvent(event, { supabase });

    assert.equal(result.handled, true);
    assert.equal(result.activated, true);
    assert.equal(supabase.calls.rpc.length, 1);
    assert.equal(supabase.calls.rpc[0].name, 'activate_tarot_batch');
    assert.equal(supabase.calls.rpc[0].args.target_batch_id, 'batch-abc');
    assert.equal(supabase.calls.rpc[0].args.payment_stripe_session_id, 'pi_123');
});

test('Scenario B: payment_intent.succeeded missing batch_id throws and never touches the database', async () => {
    const supabase = createSupabaseMock();
    const event = {
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_456', metadata: {} } },
    };

    await assert.rejects(() => handleTarotBatchWebhookEvent(event, { supabase }), /batch_id/);
    assert.equal(supabase.calls.rpc.length, 0);
    assert.equal(supabase.calls.update.length, 0);
});

test('Scenario B: a failed payment marks the batch failed, leaving listings locked in pending_authentication', async () => {
    const supabase = createSupabaseMock();
    const event = {
        type: 'payment_intent.payment_failed',
        data: { object: { id: 'pi_789', metadata: { batch_id: 'batch-xyz' }, last_payment_error: { message: 'card_declined' } } },
    };

    const result = await handleTarotBatchWebhookEvent(event, { supabase });

    assert.equal(result.handled, true);
    assert.equal(supabase.calls.rpc.length, 0);
    assert.equal(supabase.calls.update.length, 1);
    assert.equal(supabase.calls.update[0].table, 'upload_batches');
    assert.equal(supabase.calls.update[0].values.status, 'failed');
});

test('propagates a database error from activate_tarot_batch instead of silently succeeding', async () => {
    const supabase = createSupabaseMock({ rpcResult: { data: null, error: new Error('rpc unavailable') } });
    const event = {
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_999', metadata: { batch_id: 'batch-err' } } },
    };

    await assert.rejects(() => handleTarotBatchWebhookEvent(event, { supabase }), /rpc unavailable/);
});
