import React from 'react';
import { getUserBlockState, setUserBlocked, submitCommunityReport, type CommunityReportTargetType } from './community-safety';

type CommunitySafetyActionsProps = {
    targetType: CommunityReportTargetType;
    targetId: string;
    targetLabel: string;
    reportContext: string;
    blockedUserId?: string;
    onBlocked?: () => void;
};

export const CommunitySafetyActions: React.FC<CommunitySafetyActionsProps> = ({
    targetType,
    targetId,
    targetLabel,
    reportContext,
    blockedUserId,
    onBlocked,
}) => {
    const [reportOpen, setReportOpen] = React.useState(false);
    const [reason, setReason] = React.useState('');
    const [viewerId, setViewerId] = React.useState<string | null>(null);
    const [isBlocked, setIsBlocked] = React.useState(false);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [status, setStatus] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!blockedUserId) return;
        let mounted = true;
        getUserBlockState(blockedUserId)
            .then(({ viewerId: currentViewerId, isBlocked: blocked }) => {
                if (!mounted) return;
                setViewerId(currentViewerId);
                setIsBlocked(blocked);
            })
            .catch((error) => { if (mounted) setStatus(error instanceof Error ? error.message : 'Unable to check block status.'); });
        return () => { mounted = false; };
    }, [blockedUserId]);

    const submitReport = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (isSubmitting || !reason.trim()) return;
        setIsSubmitting(true);
        setStatus(null);
        try {
            await submitCommunityReport(targetType, targetId, `${reportContext}\nReason: ${reason.trim()}`);
            setReason('');
            setReportOpen(false);
            setStatus('Report sent. Our team will review it.');
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Unable to submit this report.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleBlock = async () => {
        if (!blockedUserId || isSubmitting) return;
        const nextBlocked = !isBlocked;
        if (nextBlocked && !window.confirm(`Block ${targetLabel}? They will no longer be able to contact you in Arkcards.`)) return;
        setIsSubmitting(true);
        setStatus(null);
        try {
            await setUserBlocked(blockedUserId, nextBlocked);
            setIsBlocked(nextBlocked);
            setStatus(nextBlocked ? `${targetLabel} is blocked.` : `${targetLabel} is unblocked.`);
            if (nextBlocked) onBlocked?.();
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Unable to update the block list.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return <div className="community-safety-actions">
        {!reportOpen ? (
            <button type="button" className="account-text-btn" onClick={() => { setReportOpen(true); setStatus(null); }}>Report {targetType === 'listing' ? 'listing' : targetType === 'seller' ? 'seller' : 'conversation'}</button>
        ) : (
            <form onSubmit={submitReport}>
                <label>Why are you reporting this {targetType}?
                    <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} minLength={5} required rows={3} />
                </label>
                <button type="submit" className="account-text-btn" disabled={isSubmitting || reason.trim().length < 5}>{isSubmitting ? 'Sending...' : 'Send report'}</button>
                <button type="button" className="account-text-btn" disabled={isSubmitting} onClick={() => setReportOpen(false)}>Cancel</button>
            </form>
        )}
        {blockedUserId && viewerId !== blockedUserId && <button type="button" className="account-text-btn" disabled={isSubmitting} onClick={() => void toggleBlock()}>{isBlocked ? 'Unblock user' : 'Block user'}</button>}
        {status && <p className="account-status" role="status">{status}</p>}
    </div>;
};