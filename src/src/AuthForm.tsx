import React, { useState } from 'react';

interface AuthProps {
    onLoginSuccess: (userEmail: string) => void;
    onGuestBypass: () => void;
}

export const AuthForm: React.FC<AuthProps> = ({ onLoginSuccess, onGuestBypass }) => {
    const [isSignUp, setIsSignUp] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [acceptTerms, setAcceptTerms] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) return alert("Please fill in all fields.");
        if (isSignUp && !acceptTerms) return alert("You must accept the Terms & Conditions to register.");

        alert(isSignUp ? "Account registered successfully!" : "Logged in successfully!");
        onLoginSuccess(email);
    };

    return (
        <div style={{ maxWidth: '400px', margin: '60px auto', padding: '30px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #F4EEE8', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)', textAlign: 'left', fontFamily: 'sans-serif' }}>
            <h2 style={{ color: '#114E60', marginTop: 0, marginBottom: '6px', fontWeight: 800 }}>
                {isSignUp ? 'Create Account' : 'Sign In to Arkana'}
            </h2>
            <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '20px' }}>
                {isSignUp ? 'Join the collectible card marketplace.' : 'Access your inventory and active listings.'}
            </p>

            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontWeight: 600, color: '#114E60', marginBottom: '4px', fontSize: '0.85rem' }}>Email Address *</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }} placeholder="you@example.com" />
                </div>

                <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontWeight: 600, color: '#114E60', marginBottom: '4px', fontSize: '0.85rem' }}>Password *</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }} placeholder="••••••••" />
                </div>

                {isSignUp && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '16px' }}>
                        <input id="terms-check" type="checkbox" checked={acceptTerms} onChange={e => setAcceptTerms(e.target.checked)} style={{ marginTop: '3px' }} />
                        <label htmlFor="terms-check" style={{ fontSize: '0.8rem', color: '#475569', cursor: 'pointer', lineHeight: '1.4' }}>
                            I agree to the <strong>Terms & Conditions</strong> regarding marketplace trading policies, buyer protections, and anti-fraud regulations.
                        </label>
                    </div>
                )}

                <button type="submit" style={{ width: '100%', padding: '12px', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 700, backgroundColor: '#325288', cursor: 'pointer', marginBottom: '12px' }}>
                    {isSignUp ? 'Register Account' : 'Sign In'}
                </button>

                <button type="button" onClick={onGuestBypass} style={{ width: '100%', padding: '12px', border: '1px solid #325288', borderRadius: '6px', color: '#325288', fontWeight: 600, backgroundColor: 'transparent', cursor: 'pointer' }}>
                    🌐 Continue as Guest
                </button>
            </form>

            <p style={{ textAlign: 'center', fontSize: '0.85rem', color: '#64748b', marginTop: '20px', marginBottom: 0 }}>
                {isSignUp ? 'Already have an account?' : "Don't have an account yet?"}{' '}
                <span onClick={() => setIsSignUp(!isSignUp)} style={{ color: '#114E60', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
                    {isSignUp ? 'Log In' : 'Sign Up'}
                </span>
            </p>
        </div>
    );
};