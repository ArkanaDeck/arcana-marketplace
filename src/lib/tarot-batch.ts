import { getSupabaseSession } from './supabase';

export type TarotBatchStatus = 'pending_authentication' | 'pending_payment' | 'paid' | 'failed';

export async function getTarotBatchStatus(batchId: string) {
    const session = await getSupabaseSession();
    if (!session?.access_token) throw new Error('Sign in to check your batch status.');

    const response = await fetch(`/api/tarot-batch-status?batchId=${encodeURIComponent(batchId)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Unable to check batch status.');
    return payload as { status: TarotBatchStatus; deckCount: number; feeAmount: number };
}
