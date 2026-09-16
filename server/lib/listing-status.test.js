import assert from 'node:assert/strict';
import test from 'node:test';
import { createListingStatusUpdater } from './listing-status.js';

function createSupabaseRecorder() {
    const calls = [];
    const supabase = {
        from(table) {
            const call = { table, values: null, filters: [] };
            calls.push(call);
            const query = {
                update(values) {
                    call.values = values;
                    return query;
                },
                eq(column, value) {
                    call.filters.push([column, value]);
                    return query;
                },
                then(resolve) {
                    resolve({ error: null });
                },
            };
            return query;
        },
    };
    return { supabase, calls };
}

test('markAsSold only transitions an active listing to sold', async () => {
    const { supabase, calls } = createSupabaseRecorder();
    const { markAsSold } = createListingStatusUpdater(supabase);

    await markAsSold('listing-1');

    assert.deepEqual(calls, [{ table: 'listings', values: { status: 'sold' }, filters: [['id', 'listing-1'], ['status', 'active']] }]);
});

test('confirmOrderAccepted completes and removes a sold listing from discovery', async () => {
    const { supabase, calls } = createSupabaseRecorder();
    const { confirmOrderAccepted } = createListingStatusUpdater(supabase);

    await confirmOrderAccepted('listing-1');

    assert.deepEqual(calls, [{ table: 'listings', values: { status: 'completed', is_active: false }, filters: [['id', 'listing-1'], ['status', 'sold']] }]);
});