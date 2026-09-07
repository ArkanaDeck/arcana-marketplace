import React from 'react';
import { updatePassword } from './lib/auth';
import { supabase } from './lib/supabase';

type ResetPasswordPageProps = { onDone: () => void };

export const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({ onDone }) => {
    const [hasRecoverySession, setHasRecoverySession] = React.useState<boolean | null>(null);
    const [password, setPassword] = React.useState('');
    const [confirmPassword, setConfirmPassword] = React.useState('');
    const [status, setStatus] = React.useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [isComplete, setIsComplete] = React.useState(false);

    React.useEffect(() => {
        if (!supabase) {
            setHasRecoverySession(false);
            return;
        }

        // Supabase exchanges the recovery token embedded in the link URL for a session on load.
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
                setHasRecoverySession(true);
            }
        });

        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) setHasRecoverySession(true);
            else setHasRecoverySession((current) => current ?? false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (password !== confirmPassword) {
            setStatus('Passwords do not match.');
            return;
        }
        setIsSubmitting(true);
        setStatus(null);
        try {
            await updatePassword(password);
            setIsComplete(true);
            window.history.replaceState({}, '', '/');
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Unable to update your password.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (hasRecoverySession === null) {
        return <section className="seller-profile-page"><p>Verifying your reset link...</p></section>;
    }

    if (isComplete) {
        return (
            <section className="seller-profile-page">
                <div className="email-verification-panel" role="status">
                    <div className="email-verification-icon" aria-hidden="true">✓</div>
                    <h3>Password updated</h3>
                    <p>Your password has been changed. You can now sign in with your new password.</p>
                    <button type="button" className="primary-btn" onClick={onDone}>Go to sign in</button>
                </div>
            </section>
        );
    }

    if (!hasRecoverySession) {
        return (
            <section className="seller-profile-page">
                <div className="email-verification-panel" role="alert">
                    <h3>Reset link expired</h3>
                    <p>This password reset link is invalid or has expired. Request a new one from the sign in page.</p>
                    <button type="button" className="primary-btn" onClick={onDone}>Back to sign in</button>
                </div>
            </section>
        );
    }

    return (
        <section className="seller-profile-page">
            <form className="account-form" onSubmit={handleSubmit}>
                <div className="password-reset-intro">
                    <h3>Choose a new password</h3>
                    <p>Enter a new password for your account.</p>
                </div>
                <label>New password <span className="text-red-500 font-bold ml-0.5">*</span>
                    <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required aria-required="true" minLength={6} maxLength={128} placeholder="At least 6 characters" />
                </label>
                <label>Confirm new password <span className="text-red-500 font-bold ml-0.5">*</span>
                    <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required aria-required="true" minLength={6} maxLength={128} placeholder="Re-enter your new password" />
                </label>
                {status && <p className="account-status" role="status">{status}</p>}
                <button type="submit" className="primary-btn" disabled={isSubmitting}>{isSubmitting ? 'Updating...' : 'Update password'}</button>
            </form>
        </section>
    );
};
