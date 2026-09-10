const TAROT_AUTHENTICATION_FEE_PENCE = 44;
const MAX_DECKS_PER_BATCH = 25;

// The 44p rule: every deck in a batch (whether it's a single deck or a bulk upload) is billed at the same flat per-deck rate.
export function calculateBatchAuthenticationFeePence(deckCount) {
    const count = Number(deckCount);
    if (!Number.isInteger(count) || count <= 0) throw new Error('A batch must contain at least one deck.');
    if (count > MAX_DECKS_PER_BATCH) throw new Error(`A batch cannot contain more than ${MAX_DECKS_PER_BATCH} decks.`);
    return count * TAROT_AUTHENTICATION_FEE_PENCE;
}

// Pure builder: converts a pence amount + batch id into a Stripe PaymentIntent payload. Amount stays an integer (pence) throughout.
export function buildTarotBatchPaymentIntentPayload(feePence, batchId) {
    if (!Number.isInteger(feePence) || feePence <= 0) throw new Error('Fee must be a positive integer number of pence.');
    if (!batchId) throw new Error('A batch ID is required to track this payment.');
    return {
        amount: feePence,
        currency: 'gbp',
        metadata: { batch_id: String(batchId), product: 'tarot_batch_fee' },
        automatic_payment_methods: { enabled: true },
    };
}

export { TAROT_AUTHENTICATION_FEE_PENCE, MAX_DECKS_PER_BATCH };

