import React, { useEffect, useRef, useState } from 'react';
import { getTarotBatchStatus } from './lib/tarot-batch';

const POLL_INTERVAL_MS = 2000;
const ABSOLUTE_TIMEOUT_MS = 30000;

type ActivationPhase = 'processing' | 'active' | 'failed' | 'timeout' | 'error';

type TarotBatchActivationStatusProps = {
    batchId: string;
    deckCount: number;
    onActivated?: () => void;
};

// Post-payment transition screen: polls batch status every 2s until listings go live, or gives up after 30s.
export const TarotBatchActivationStatus: React.FC<TarotBatchActivationStatusProps> = ({ batchId, deckCount, onActivated }) => {
    const [phase, setPhase] = useState<ActivationPhase>('processing');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const hasSettledRef = useRef(false);

    useEffect(() => {
        hasSettledRef.current = false;

        const pollTimer = window.setInterval(async () => {
            if (hasSettledRef.current) return;
            try {
                const batch = await getTarotBatchStatus(batchId);
                if (batch.status === 'paid') {
                    hasSettledRef.current = true;
                    setPhase('active');
                } else if (batch.status === 'failed') {
                    hasSettledRef.current = true;
                    setPhase('failed');
                }
            } catch (error) {
                hasSettledRef.current = true;
                setErrorMessage(error instanceof Error ? error.message : 'Unable to check batch status.');
                setPhase('error');
            }
        }, POLL_INTERVAL_MS);

        const timeoutTimer = window.setTimeout(() => {
            if (hasSettledRef.current) return;
            hasSettledRef.current = true;
            setPhase('timeout');
        }, ABSOLUTE_TIMEOUT_MS);

        return () => {
            window.clearInterval(pollTimer);
            window.clearTimeout(timeoutTimer);
        };
    }, [batchId]);

    useEffect(() => {
        if (phase !== 'active') return;
        const redirectTimer = window.setTimeout(() => {
            if (onActivated) {
                onActivated();
            } else {
                window.location.assign('/?activeInventory=success');
            }
        }, 900);
        return () => window.clearTimeout(redirectTimer);
    }, [phase, onActivated]);

    return (
        <div className="tarot-activation-status" role="status" aria-live="polite">
            {phase === 'processing' && (
                <>
                    <span className="tarot-activation-spinner" aria-hidden="true" />
                    <p className="tarot-activation-text">
                        Processing 44p per tarot deck authentication fee ({deckCount} deck{deckCount === 1 ? '' : 's'})... Please do not close this window.
                    </p>
                </>
            )}
            {phase === 'active' && (
                <p className="tarot-activation-text tarot-activation-text--success">
                    Payment confirmed. Your listings are now live — redirecting to your inventory...
                </p>
            )}
            {phase === 'failed' && (
                <p className="tarot-activation-text tarot-activation-text--error">
                    This batch's payment did not complete, so nothing has been listed. Please try the checkout again.
                </p>
            )}
            {phase === 'timeout' && (
                <p className="tarot-activation-text tarot-activation-text--error">
                    This is taking longer than expected. Your payment is still being confirmed — check your inventory again shortly, or contact support if this persists.
                </p>
            )}
            {phase === 'error' && (
                <p className="tarot-activation-text tarot-activation-text--error">
                    {errorMessage || 'Something went wrong while checking your batch status.'}
                </p>
            )}
        </div>
    );
};
