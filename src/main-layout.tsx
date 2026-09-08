import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { getProductionChecklist } from './production-checklist';
import { buyListingCredits } from './lib/listing-credits';
import { createListing, deleteListing, loadListings, type DeckCondition, type MarketplaceListing } from './lib/listings';
import { createOrderCheckout, createPayPalOrder } from './lib/order-checkout';
import { connectPayPalAccount } from './lib/paypal';
import { resendSignupConfirmation, sendPasswordReset, signInWithEmail, signOut, signUpWithEmail } from './lib/auth';
import { getSupabaseSession, supabase } from './lib/supabase';
import { getRuntimeConfig } from './lib/config';
import { SellerProfilePage } from './seller-profile-page';
import { ResetPasswordPage } from './reset-password-page';

type DeckListing = MarketplaceListing;

export const MainLayout: React.FC = () => {
    const runtimeConfig = getRuntimeConfig();
    const [activeView, setActiveView] = useState('Home');
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const hasSecureBackend = runtimeConfig.supabaseEnabled;
    const isSecureCheckoutEnabled = runtimeConfig.isSecureMode;
    const productionChecklist = getProductionChecklist({
        VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
        VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
        VITE_STRIPE_PUBLISHABLE_KEY: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY,
        VITE_PAYPAL_ENABLED: import.meta.env.VITE_PAYPAL_ENABLED,
        VITE_APP_URL: import.meta.env.VITE_APP_URL,
        VITE_SITE_NAME: import.meta.env.VITE_SITE_NAME,
    });

    // Marketplace core states
    const [listings, setListings] = useState<DeckListing[]>(() => {
        try {
            const savedListings = localStorage.getItem('arkana_listings');
            return savedListings ? JSON.parse(savedListings) : [];
        } catch {
            return [];
        }
    });

    const [totalRevenue, setTotalRevenue] = useState<number>(() => {
        try {
            const savedRevenue = localStorage.getItem('arkana_revenue');
            return savedRevenue ? parseFloat(savedRevenue) : 0;
        } catch {
            return 0;
        }
    });

    const [deckName, setDeckName] = useState('');
    const [deckPrice, setDeckPrice] = useState('');
    const [deckDescription, setDeckDescription] = useState('');
    const [condition, setCondition] = useState<DeckCondition>('good');
    const [freeDelivery, setFreeDelivery] = useState<boolean>(false);
    const [listingType, setListingType] = useState<DeckListing['listingType']>('sale');
    const [deckImageFiles, setDeckImageFiles] = useState<File[]>([]);
    const [basket, setBasket] = useState<DeckListing[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const listingFee = listings.length < 3 ? 0 : 0.66;
    const listingsInCurrentBundle = listings.length % 3;
    const [isBuyingListingCredits, setIsBuyingListingCredits] = useState(false);

    // Checkout Flow States
    const [selectedItem, setSelectedItem] = useState<DeckListing | null>(null);
    const [viewingListing, setViewingListing] = useState<DeckListing | null>(null);
    const [checkoutStep, setCheckoutStep] = useState<'auth' | 'delivery' | 'payment' | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [deliveryMethod, setDeliveryMethod] = useState<'standard' | 'express' | 'collection'>('standard');
    const [flashMessage, setFlashMessage] = useState<string | null>(null);
    const [termsAccepted, setTermsAccepted] = useState<boolean>(false);
    const [showTermsModal, setShowTermsModal] = useState<boolean>(false);
    const [activeLegalPage, setActiveLegalPage] = useState<'terms' | 'privacy' | 'refunds' | 'shipping' | null>(null);
    const [accountMode, setAccountMode] = useState<'signin' | 'signup'>('signin');
    const [accountEmail, setAccountEmail] = useState('');
    const [accountPassword, setAccountPassword] = useState('');
    const [accountStatus, setAccountStatus] = useState<string | null>(null);
    const [isEmailSent, setIsEmailSent] = useState(false);
    const [isResendingVerification, setIsResendingVerification] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [isResetView, setIsResetView] = useState(false);
    const [showResetMessage, setShowResetMessage] = useState(false);
    const [isResetSent, setIsResetSent] = useState(false);
    const [isResetSubmitting, setIsResetSubmitting] = useState(false);
    const [isAccountSubmitting, setIsAccountSubmitting] = useState(false);
    const [displayName, setDisplayName] = useState('');
    const [profileBio, setProfileBio] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [isStartingConnect, setIsStartingConnect] = useState(false);
    const [isStartingPayPalConnect, setIsStartingPayPalConnect] = useState(false);
    const [isStripePayoutEnabled, setIsStripePayoutEnabled] = useState(false);

    // Auth form state placeholders
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const filteredListings = listings.filter((listing) => {
        const query = searchQuery.trim().toLowerCase();
        return !query || listing.name.toLowerCase().includes(query) || listing.description?.toLowerCase().includes(query);
    });

    const handleRequiredFieldInvalid = (event: React.FormEvent<HTMLInputElement | HTMLSelectElement>) => {
        event.currentTarget.classList.add('field-border-error');
        event.currentTarget.closest('label')?.classList.add('field-error');
    };

    const handleRequiredFieldInput = (event: React.FormEvent<HTMLInputElement | HTMLSelectElement>) => {
        if (event.currentTarget.value.trim()) {
            event.currentTarget.classList.remove('field-border-error');
            event.currentTarget.closest('label')?.classList.remove('field-error');
        }
    };

    useEffect(() => {
        if (!hasSecureBackend) return;
        loadListings()
            .then(setListings)
            .catch((error) => setFlashMessage(error instanceof Error ? error.message : 'Unable to load marketplace listings.'));
    }, [hasSecureBackend]);

    useEffect(() => {
        if (!supabase) return;
        getSupabaseSession()
            .then(async (session) => {
                setIsAuthenticated(Boolean(session));
                setAccountEmail(session?.user.email || '');
                if (!session?.user || !supabase) return;
                const { data } = await supabase.from('profiles').select('display_name, bio, avatar_url').eq('id', session.user.id).maybeSingle();
                setDisplayName(data?.display_name || '');
                setProfileBio(data?.bio || '');
                setAvatarUrl(data?.avatar_url || '');
            })
            .catch(() => setIsAuthenticated(false));
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setIsAuthenticated(Boolean(session));
            setAccountEmail(session?.user.email || '');
        });
        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [activeView]);

    useEffect(() => {
        if (new URLSearchParams(window.location.search).get('auth') !== 'confirmed') return;
        setActiveView('Account');
        setAccountMode('signin');
        setAccountStatus('Email confirmed. Sign in to continue.');
        window.history.replaceState({}, '', window.location.pathname);
    }, []);

    useEffect(() => {
        if (new URLSearchParams(window.location.search).get('connect') !== 'complete') return;
        getSupabaseSession()
            .then(async (session) => {
                if (!session?.access_token) throw new Error('Sign in again to verify your payout setup.');
                const response = await fetch('/api/connect-status', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } });
                const payload = await response.json();
                if (!response.ok) throw new Error(payload?.error || 'Unable to verify payout setup.');
                setIsStripePayoutEnabled(Boolean(payload.payoutEnabled));
                setAccountStatus(payload.payoutEnabled ? 'Stripe payouts are enabled.' : 'Stripe needs additional information before payouts can be enabled.');
            })
            .catch((error) => setAccountStatus(error instanceof Error ? error.message : 'Unable to verify payout setup.'))
            .finally(() => window.history.replaceState({}, '', window.location.pathname));
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('paypal') !== 'success') return;
        const paypalOrderId = params.get('token');
        if (!paypalOrderId || !supabase) return;

        getSupabaseSession()
            .then(async (session) => {
                if (!session?.access_token) throw new Error('Sign in again to confirm your PayPal payment.');
                const response = await fetch('/api/checkout/paypal/capture-order', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                    body: JSON.stringify({ paypalOrderId }),
                });
                const payload = await response.json();
                if (!response.ok) throw new Error(payload?.error || 'Unable to confirm PayPal payment.');
                setActiveView('Checkout');
                setFlashMessage('PayPal payment confirmed. Your order is being prepared.');
            })
            .catch((error) => setFlashMessage(error instanceof Error ? error.message : 'Unable to confirm PayPal payment.'))
            .finally(() => window.history.replaceState({}, '', window.location.pathname));
    }, []);

    useEffect(() => {
        if (hasSecureBackend) return;
        try {
            localStorage.setItem('arkana_listings', JSON.stringify(listings));
        } catch {
            // Ignore storage write failures in private/incognito mode.
        }
    }, [listings]);

    useEffect(() => {
        try {
            localStorage.setItem('arkana_revenue', totalRevenue.toString());
        } catch {
            // Ignore storage write failures in private/incognito mode.
        }
    }, [totalRevenue]);

    useEffect(() => {
        if (!flashMessage) return;
        const timer = window.setTimeout(() => setFlashMessage(null), 2800);
        return () => window.clearTimeout(timer);
    }, [flashMessage]);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length > 3) {
            setFlashMessage('Select up to three images.');
            e.target.value = '';
            return;
        }
        setDeckImageFiles(files);
    };

    const handlePublish = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!deckName.trim() || (listingType === 'sale' && !deckPrice.trim())) {
            alert('Add a deck name and a price for sale listings before publishing.');
            return;
        }
        const parsedPrice = listingType === 'sale' ? Number(deckPrice) : 0;
        if (Number.isNaN(parsedPrice) || parsedPrice <= 0) {
            alert('Please enter a valid price greater than zero.');
            return;
        }
        if (listingFee > 0) {
            alert('Buy a three-listing credit bundle before publishing additional listings.');
            return;
        }
        if (!runtimeConfig.isSecureMode) {
            alert('Publishing listings is disabled until Supabase and Stripe are configured for production.');
            return;
        }
        try {
            const newListing = await createListing({ name: deckName.trim(), price: parsedPrice, description: deckDescription.trim() || undefined, listingType, imageFiles: deckImageFiles, freeDelivery, condition });
            setListings((currentListings) => [newListing, ...currentListings]);
            setDeckName('');
            setDeckPrice('');
            setDeckDescription('');
            setCondition('good');
            setFreeDelivery(false);
            setListingType('sale');
            setDeckImageFiles([]);
            setFlashMessage(`Published: ${newListing.name}`);
            setActiveView('Listings');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to publish your listing.';
            alert(message);
            if (message === 'Sign in before creating a listing.') {
                setAccountMode('signin');
                setActiveView('Account');
            }
        }
    };

    const handleBuyListingCredits = async () => {
        setIsBuyingListingCredits(true);
        try {
            const checkout = await buyListingCredits();
            window.location.assign(checkout.url);
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Unable to start listing credit checkout.');
            setIsBuyingListingCredits(false);
        }
    };

    const handleDelete = async (idToDelete: string) => {
        const target = listings.find(item => item.id === idToDelete);
        try {
            await deleteListing(idToDelete);
            setListings((currentListings) => currentListings.filter(item => item.id !== idToDelete));
            if (target) setFlashMessage(`Removed ${target.name}`);
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Unable to remove this listing.');
        }
    };

    const handleAddToBasket = (item: DeckListing) => {
        if (basket.some((basketItem) => basketItem.id === item.id)) {
            setFlashMessage(`${item.name} is already in your basket.`);
            return;
        }
        if (basket.length && basket[0].sellerId !== item.sellerId) {
            setFlashMessage('Complete the current seller order first. A basket can contain up to 3 decks from one seller.');
            return;
        }
        if (basket.length === 3) {
            setFlashMessage('Your basket already has the maximum 3 decks for this seller.');
            return;
        }
        setBasket((currentBasket) => [...currentBasket, item]);
        setFlashMessage(`Added ${item.name} to your basket.`);
    };

    const handleInitiateCheckout = (item: DeckListing) => {
        setSelectedItem(item);
        setFlashMessage(`Checkout: ${item.name}`);
        setCheckoutStep(isAuthenticated ? 'delivery' : 'auth');
    };

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim() || !password.trim()) {
            alert('Please enter your details to sign in.');
            return;
        }

        if (!hasSecureBackend) {
            alert('Authentication is disabled until VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are configured.');
            return;
        }

        try {
            await signInWithEmail(email, password);
            setIsAuthenticated(true);
            setFlashMessage('Signed in. Continue to delivery details.');
            setCheckoutStep('delivery');
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Unable to sign in. Please check your credentials.');
        }
    };

    const handleAccountSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setAccountStatus(null);
        if (!hasSecureBackend) {
            setAccountStatus('Sign in is unavailable because Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel, then redeploy.');
            return;
        }
        setIsAccountSubmitting(true);
        try {
            if (accountMode === 'signup') {
                const result = await signUpWithEmail(accountEmail.trim(), accountPassword);
                if (result.session) {
                    setIsAuthenticated(true);
                    setAccountStatus('Account created. You are ready to sell.');
                } else {
                    setIsEmailSent(true);
                    setAccountStatus(null);
                }
            } else {
                await signInWithEmail(accountEmail.trim(), accountPassword);
                setIsAuthenticated(true);
                setAccountEmail(accountEmail.trim());
                setAccountStatus('Signed in successfully.');
            }
            setAccountPassword('');
            setShowPassword(false);
        } catch (error) {
            setAccountStatus(error instanceof Error ? error.message : 'Unable to continue with your account.');
        } finally {
            setIsAccountSubmitting(false);
        }
    };

    const handlePasswordReset = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!accountEmail.trim()) {
            setAccountStatus('Enter your email address to receive a reset link.');
            return;
        }
        setIsResetSubmitting(true);
        try {
            await sendPasswordReset(accountEmail.trim());
            setIsResetSent(true);
            setAccountStatus(null);
        } catch (error) {
            setAccountStatus(error instanceof Error ? error.message : 'Unable to send the password reset email.');
        } finally {
            setIsResetSubmitting(false);
        }
    };

    const handleResendVerification = async () => {
        if (!accountEmail.trim()) {
            setAccountStatus('Enter your email address, then resend the confirmation.');
            return;
        }
        setIsResendingVerification(true);
        try {
            await resendSignupConfirmation(accountEmail.trim());
            setAccountStatus('Verification email sent again. Check your inbox and spam folder.');
        } catch (error) {
            setAccountStatus(error instanceof Error ? error.message : 'Unable to resend the verification email.');
        } finally {
            setIsResendingVerification(false);
        }
    };

    const handleSignOut = async () => {
        try {
            await signOut();
            setIsAuthenticated(false);
            setAccountStatus('You are signed out.');
        } catch (error) {
            setAccountStatus(error instanceof Error ? error.message : 'Unable to sign out.');
        }
    };

    const handleSaveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!supabase) return;
        setIsSavingProfile(true);
        setAccountStatus(null);
        try {
            const session = await getSupabaseSession();
            if (!session?.user) throw new Error('Sign in before saving your profile.');
            let nextAvatarUrl = avatarUrl.trim() || null;
            if (avatarFile) {
                if (!avatarFile.type.startsWith('image/')) throw new Error('Only image files can be uploaded.');
                const path = `${session.user.id}/${Date.now()}-${avatarFile.name}`;
                const { error: uploadError } = await supabase.storage.from('avatars').upload(path, avatarFile, { contentType: avatarFile.type, upsert: false });
                if (uploadError) throw new Error(uploadError.message || 'Unable to upload your avatar.');
                const { data: publicUrl } = supabase.storage.from('avatars').getPublicUrl(path);
                nextAvatarUrl = publicUrl.publicUrl;
            }
            const { error } = await supabase.from('profiles').update({
                display_name: displayName.trim() || null,
                bio: profileBio.trim() || null,
                avatar_url: nextAvatarUrl,
            }).eq('id', session.user.id);
            if (error) throw error;
            setAvatarUrl(nextAvatarUrl || '');
            setAvatarFile(null);
            setAccountStatus('Profile saved.');
            window.location.href = `/app/profile/${encodeURIComponent(session.user.id)}`;
        } catch (error) {
            setAccountStatus(error instanceof Error ? error.message : 'Unable to save your profile.');
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handleStartConnect = async () => {
        setIsStartingConnect(true);
        setAccountStatus(null);
        try {
            const session = await getSupabaseSession();
            if (!session?.access_token) throw new Error('Sign in before setting up payouts.');
            const response = await fetch('/api/connect/stripe-onboarding', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            });
            const payload = await response.json();
            if (!response.ok || !payload?.url) throw new Error(payload?.error || 'Unable to start Stripe Connect onboarding.');
            window.location.href = payload.url;
        } catch (error) {
            window.alert(error instanceof Error ? error.message : 'Unable to start Stripe Connect onboarding.');
            window.location.reload();
        }
    };

    const handleStartPayPalConnect = async () => {
        setIsStartingPayPalConnect(true);
        setAccountStatus(null);
        try {
            const { url } = await connectPayPalAccount();
            window.location.assign(url);
        } catch (error) {
            setAccountStatus(error instanceof Error ? error.message : 'Unable to start PayPal onboarding.');
            setIsStartingPayPalConnect(false);
        }
    };

    const handleGuestCheckout = () => {
        setCheckoutStep('delivery');
        setTermsAccepted(false);
    };

    const deliveryFee = deliveryMethod === 'express' ? 5.50 : deliveryMethod === 'collection' ? 0 : 2.99;
    const orderTotal = selectedItem ? selectedItem.price + deliveryFee : 0;

    const handleFinalisePayment = async (gateway: 'Stripe' | 'PayPal' | 'Cash') => {
        if (!selectedItem) return;
        if (!termsAccepted) {
            alert('Please agree to the Terms & Conditions before paying.');
            return;
        }

        if (gateway === 'Cash') {
            setFlashMessage(`Collection request sent for ${selectedItem.name}. The seller will confirm a safe collection time and address.`);
            setSelectedItem(null);
            setCheckoutStep(null);
            return;
        }

        if (!isSecureCheckoutEnabled || (gateway === 'PayPal' && !runtimeConfig.paypalEnabled)) {
            alert('Checkout is disabled until Supabase and at least one payment provider are configured for production.');
            return;
        }

        const dynamicDeliveryCost = deliveryMethod === 'express' ? 5.50 : deliveryMethod === 'collection' ? 0 : 2.99;
        const totalCharged = selectedItem.price + dynamicDeliveryCost;

        try {
            alert(`Checkout for £${totalCharged.toFixed(2)} must be completed from your basket.`);
            return;
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Checkout could not be created.');
            return;
        }

        setSelectedItem(null);
        setCheckoutStep(null);
    };

    const profileRouteMatch = window.location.pathname.match(/^\/app\/profile\/([^/]+)\/?$/);
    if (profileRouteMatch) {
        return <SellerProfilePage sellerId={decodeURIComponent(profileRouteMatch[1])} onBack={() => { window.history.replaceState({}, '', '/'); setActiveView('Listings'); }} />;
    }

    if (window.location.pathname === '/reset-password') {
        return <ResetPasswordPage onDone={() => { window.location.href = '/login'; }} />;
    }

    return (
        <div className="container">
            <div className="frame">
                {runtimeConfig.warnings.length > 0 && (
                    <div className="runtime-warning-banner" role="alert">
                        <span className="runtime-warning-title">Production blockers:</span>
                        {runtimeConfig.warnings.map((warning) => (
                            <span key={warning} className="runtime-warning-item">• {warning}</span>
                        ))}
                    </div>
                )}

                {flashMessage && (
                    <div className="flash-banner" role="status" aria-live="polite">
                        {flashMessage}
                    </div>
                )}

                <div className="trust-badges" aria-label="Trust markers">
                    <span>Secure checkout</span>
                    <span>UK shipping</span>
                    <span>No hidden fees</span>
                </div>

                <header className="topbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', width: '100%', boxSizing: 'border-box', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: '1 1 280px', minWidth: 0 }}>
                        <button className="brand" type="button" onClick={() => setActiveView('Home')} aria-label="Go to Arkana home">
                            <div className="brand-mark">ARK</div>
                            <div>
                                <strong>Arkana</strong>
                                <span>Zero-commission marketplace</span>
                            </div>
                        </button>
                        <input className="header-search" type="text" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onFocus={() => setActiveView('Listings')} placeholder="Search decks..." aria-label="Search decks" style={{ flex: '1 1 160px' }} />
                    </div>
                    <button
                        type="button"
                        className="mobile-menu-toggle"
                        aria-label="Toggle navigation menu"
                        aria-expanded={isMobileMenuOpen}
                        onClick={() => setIsMobileMenuOpen((current) => !current)}
                    >
                        <span className="mobile-menu-toggle__bar"></span>
                        <span className="mobile-menu-toggle__bar"></span>
                        <span className="mobile-menu-toggle__bar"></span>
                    </button>
                    <div className={`mobile-nav-panel${isMobileMenuOpen ? ' is-open' : ''}`}>
                        <nav className="nav-links" aria-label="Main navigation" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <button className={`nav-btn ${activeView === 'Listings' ? 'active' : ''}`} onClick={() => setActiveView('Listings')}>Marketplace</button>
                            <button className={`nav-btn ${activeView === 'Sell' ? 'active' : ''}`} onClick={() => setActiveView('Sell')}>Sell</button>
                            <button type="button" className="basket-btn" onClick={() => setActiveView('Checkout')}>Basket <span>{basket.length}</span></button>
                        </nav>
                        <div className="auth-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            {isAuthenticated ? (
                                <button type="button" className="auth-link-btn" onClick={() => setActiveView('Account')}>Your Profile</button>
                            ) : (
                                <>
                                    <button type="button" className="auth-link-btn" onClick={() => { setAccountMode('signin'); setAccountStatus(null); setIsEmailSent(false); setIsResetView(false); setActiveView('Account'); }}>Sign in</button>
                                    <button type="button" className="auth-link-btn" onClick={() => { setAccountMode('signup'); setAccountStatus(null); setIsEmailSent(false); setIsResetView(false); setActiveView('Account'); }}>Register</button>
                                </>
                            )}
                            <button type="button" className="primary-btn" onClick={() => setActiveView('Sell')}>Create Listing</button>
                            <button type="button" className={`nav-btn ${activeView === 'Help' ? 'active' : ''}`} onClick={() => setActiveView('Help')}>Help &amp; FAQ</button>
                        </div>
                    </div>
                </header>

                <main className="page-content">
                    {/* 1. HOME VIEW */}
                    {activeView === 'Home' && (
                        <section className="hero-grid">
                            <div className="hero-card">
                                <h1>Welcome to Arkana</h1>
                                <p>Zero-commission marketplace for tarot and oracle card enthusiasts.</p>
                                <button className="secondary-btn" onClick={() => setActiveView('Listings')}>
                                    Browse listings
                                </button>
                            </div>
                            <div className="hero-img"></div>
                        </section>
                    )}

                    {activeView === 'Account' && (
                        <section className="account-page">
                            <div className="account-panel">
                                <p className="account-kicker">Arkana account</p>
                                <h2>{isAuthenticated ? 'Your account' : accountMode === 'signin' ? 'Welcome back' : 'Create your seller account'}</h2>
                                <p className="account-intro">{isAuthenticated ? 'You can now manage listings and fulfil paid orders.' : 'Sign in to sell, manage listings, and receive order updates.'}</p>
                                {isAuthenticated ? (
                                    <div className="account-signed-in">
                                        <strong>Signed in as {accountEmail || 'your Arkana account'}</strong>
                                        {accountStatus && <p role="status">{accountStatus}</p>}
                                        <div className="account-actions">
                                            <button type="button" className="primary-btn" onClick={() => setActiveView('Sell')}>Create a listing</button>
                                            <button type="button" className="account-text-btn" onClick={handleSignOut}>Sign out</button>
                                        </div>
                                        <form onSubmit={handleSaveProfile} style={{ display: 'grid', gap: '14px', padding: '20px', border: '1px solid rgba(17, 78, 96, 0.14)', borderRadius: '12px', background: '#ffffff' }}>
                                            <div><h3 style={{ margin: 0, color: '#114e60', fontSize: '1rem' }}>Public profile</h3><p style={{ margin: '4px 0 0', color: '#54717b', fontSize: '0.8rem' }}>These details appear on your seller profile.</p></div>
                                            <label style={{ display: 'grid', gap: '6px', color: '#114e60', fontSize: '0.82rem', fontWeight: 700 }}>Display name<input style={{ width: '100%', border: '1px solid rgba(17, 78, 96, 0.16)', borderRadius: '8px', background: '#ffffff', color: '#114e60', font: 'inherit', padding: '10px 12px' }} type="text" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} placeholder="Your display name" /></label>
                                            <label style={{ display: 'grid', gap: '6px', color: '#114e60', fontSize: '0.82rem', fontWeight: 700 }}>Bio<textarea style={{ width: '100%', border: '1px solid rgba(17, 78, 96, 0.16)', borderRadius: '8px', background: '#ffffff', color: '#114e60', font: 'inherit', padding: '10px 12px', resize: 'vertical' }} value={profileBio} onChange={(event) => setProfileBio(event.target.value)} maxLength={500} rows={3} placeholder="Tell buyers a little about your collection." /></label>
                                            <label style={{ display: 'grid', gap: '6px', color: '#114e60', fontSize: '0.82rem', fontWeight: 700 }}>Avatar<input style={{ width: '100%', border: '1px solid rgba(17, 78, 96, 0.16)', borderRadius: '8px', background: '#ffffff', color: '#114e60', font: 'inherit', padding: '10px 12px' }} type="file" accept="image/*" onChange={(event) => setAvatarFile(event.target.files?.[0] || null)} /></label>
                                            <button type="submit" disabled={isSavingProfile} style={{ border: 'none', borderRadius: '10px', background: '#114e60', color: '#ffffff', cursor: isSavingProfile ? 'wait' : 'pointer', fontWeight: 800, padding: '11px 16px' }}>{isSavingProfile ? 'Saving...' : 'Save Profile'}</button>
                                        </form>
                                        <details style={{ overflow: 'hidden', border: '1px solid rgba(17, 78, 96, 0.16)', borderRadius: '12px', background: '#fffaf7' }}>
                                            <summary style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '18px', padding: '18px 20px', color: '#114e60', cursor: 'pointer' }}>
                                                <span><strong>Seller Verification &amp; Payout Setup</strong><small>Verify your identity and choose how you receive seller payouts.</small></span>
                                                <span style={{ flex: '0 0 auto', borderRadius: '999px', background: '#fff1d9', color: '#8a4c09', fontSize: '0.7rem', fontWeight: 800, padding: '6px 9px' }}>{isStripePayoutEnabled ? 'Stripe payouts enabled' : 'Pending Stripe Connect'}</span>
                                            </summary>
                                            {!isStripePayoutEnabled && <div style={{ display: 'grid', gap: '14px', padding: '20px' }}>
                                                <button type="button" onClick={handleStartConnect} disabled={isStartingConnect} style={{ width: '100%', border: 'none', borderRadius: '10px', background: '#114e60', color: '#ffffff', cursor: isStartingConnect ? 'wait' : 'pointer', fontWeight: 800, padding: '11px 16px' }}>{isStartingConnect ? 'Opening Stripe Connect...' : 'Set up secure payouts with Stripe'}</button>
                                                <button type="button" onClick={handleStartPayPalConnect} disabled={isStartingPayPalConnect} style={{ width: '100%', border: 'none', borderRadius: '10px', background: '#2563eb', color: '#ffffff', cursor: isStartingPayPalConnect ? 'wait' : 'pointer', fontWeight: 800, padding: '11px 16px' }}>{isStartingPayPalConnect ? 'Opening PayPal...' : 'Connect your PayPal Account'}</button>
                                            </div>}
                                        </details>
                                        <BuyerOrdersPanel />
                                        <SellerOrdersPanel />
                                    </div>
                                ) : (
                                    <>
                                        <div className="account-tabs" role="tablist" aria-label="Account option">
                                            <button type="button" role="tab" aria-selected={accountMode === 'signin'} className={accountMode === 'signin' ? 'active' : ''} onClick={() => { setAccountMode('signin'); setAccountStatus(null); }}>Sign in</button>
                                            <button type="button" role="tab" aria-selected={accountMode === 'signup'} className={accountMode === 'signup' ? 'active' : ''} onClick={() => { setAccountMode('signup'); setAccountStatus(null); }}>Create account</button>
                                        </div>
                                        {isEmailSent ? (
                                            <div className="email-verification-panel" role="status">
                                                <div className="email-verification-icon" aria-hidden="true">✉</div>
                                                <h3>Account created successfully!</h3>
                                                <p>Account created successfully! Please check your email inbox to verify your account before logging in.</p>
                                                {accountStatus && <p className="account-status">{accountStatus}</p>}
                                                <button type="button" className="resend-verification-btn" onClick={handleResendVerification} disabled={isResendingVerification}>
                                                    {isResendingVerification ? 'Sending...' : "Didn't receive the email? Click here to resend."}
                                                </button>
                                                <button type="button" className="account-text-btn" onClick={() => { setIsEmailSent(false); setAccountMode('signin'); setAccountStatus(null); }}>Back to sign in</button>
                                            </div>
                                        ) : isResetView ? (
                                            isResetSent ? (
                                                <div className="email-verification-panel" role="status">
                                                    <div className="email-verification-icon" aria-hidden="true">✉</div>
                                                    <h3>Reset link sent</h3>
                                                    <p>Check your inbox for a password reset link. Follow it to choose a new password, then sign in.</p>
                                                    <button type="button" className="account-text-btn" onClick={() => { setIsResetView(false); setIsResetSent(false); setAccountStatus(null); }}>Back to sign in</button>
                                                </div>
                                            ) : (
                                                <form className="account-form" onSubmit={handlePasswordReset}>
                                                    <div className="password-reset-intro">
                                                        <h3>Reset your password</h3>
                                                        <p>Enter the email address on your account and we'll send you a secure reset link.</p>
                                                    </div>
                                                    <label>Email address <span className="text-red-500 font-bold ml-0.5">*</span><input type="email" value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} onInvalid={handleRequiredFieldInvalid} onInput={handleRequiredFieldInput} autoComplete="email" required aria-required="true" maxLength={254} placeholder="you@example.com" /><span className="field-error-text">This space must be filled in.</span></label>
                                                    {accountStatus && <p className="account-status" role="status">{accountStatus}</p>}
                                                    <button type="submit" className="primary-btn" disabled={isResetSubmitting}>{isResetSubmitting ? 'Sending...' : 'Send reset link'}</button>
                                                    <button type="button" className="account-text-btn" onClick={() => { setIsResetView(false); setAccountStatus(null); }}>Back to sign in</button>
                                                </form>
                                            )
                                        ) : (
                                            <form className="account-form" onSubmit={handleAccountSubmit}>
                                                <label>Email address <span className="text-red-500 font-bold ml-0.5">*</span><input type="email" value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} onInvalid={handleRequiredFieldInvalid} onInput={handleRequiredFieldInput} autoComplete="email" required aria-required="true" maxLength={254} placeholder="you@example.com" /><span className="field-error-text">This space must be filled in.</span></label>
                                                <label>Password <span className="text-red-500 font-bold ml-0.5">*</span>
                                                    <span className="password-field-wrap">
                                                        <input type={showPassword ? 'text' : 'password'} value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} onInvalid={handleRequiredFieldInvalid} onInput={handleRequiredFieldInput} autoComplete={accountMode === 'signin' ? 'current-password' : 'new-password'} required aria-required="true" minLength={6} maxLength={128} placeholder="At least 6 characters" />
                                                        <button type="button" className="password-toggle-btn" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
                                                            {showPassword ? (
                                                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                                            ) : (
                                                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                                                            )}
                                                        </button>
                                                    </span>
                                                    <span className="field-error-text">This space must be filled in.</span>
                                                </label>
                                                {accountMode === 'signin' && (
                                                    <button type="button" className="forgot-password-link" onClick={() => { setIsResetView(true); setIsResetSent(false); setAccountStatus(null); setShowResetMessage(true); }}>Forgot Password?</button>
                                                )}
                                                {showResetMessage && (
                                                    <p style={{ color: '#ef4444', fontSize: '0.78rem', margin: '2px 0 0' }}>Check your email to renew your password</p>
                                                )}
                                                {accountStatus && <p className="account-status" role="status">{accountStatus}</p>}
                                                <button type="submit" className="primary-btn" disabled={isAccountSubmitting}>{isAccountSubmitting ? 'Please wait...' : accountMode === 'signin' ? 'Sign in' : 'Create account'}</button>
                                                {accountMode === 'signup' && <p className="signup-consent">By creating an account, you agree to Arkana's <a href="#terms" onClick={(event) => { event.preventDefault(); setActiveLegalPage('terms'); }}>Terms of Service</a>, <a href="#privacy" onClick={(event) => { event.preventDefault(); setActiveLegalPage('privacy'); }}>Privacy Policy</a>, and <a href="#guidelines" onClick={(event) => { event.preventDefault(); setActiveLegalPage('terms'); }}>Seller Guidelines</a>. We use essential cookies to keep you securely signed in.</p>}
                                            </form>
                                        )}
                                    </>
                                )}
                            </div>
                        </section>
                    )}

                    {/* 2. DASHBOARD VIEW */}
                    {activeView === 'Dashboard' && (
                        <section className="dashboard-section">
                            <div className="dashboard-header-block">
                                <h2>Seller Analytics Dashboard</h2>
                                <p>Monitor your tarot shop's earnings, inventory velocity, and order performance data.</p>
                            </div>
                            <div className="stats-placeholder-grid">
                                <div className="stat-card">
                                    <span className="stat-icon">🎴</span>
                                    <h3>{listings.length}</h3>
                                    <p>Active Listings</p>
                                </div>
                                <div className="stat-card revenue-highlight">
                                    <span className="stat-icon">💰</span>
                                    <h3>£{totalRevenue.toFixed(2)}</h3>
                                    <p>Total Gross Revenue</p>
                                </div>
                                <div className="stat-card">
                                    <span className="stat-icon">📊</span>
                                    <h3>
                                        £{listings.length > 0
                                            ? (listings.reduce((acc, item) => acc + item.price, 0) / listings.length).toFixed(2)
                                            : "0.00"
                                        }
                                    </h3>
                                    <p>Avg. Active Listing Value</p>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* 3. LISTINGS VIEW */}
                    {/* 3. LISTINGS VIEW */}
                    {activeView === 'Listings' && (
                        <section className="listings-section">
                            <div className="section-header-row">
                                <div>
                                    <h2>Marketplace Listings</h2>
                                    <p>Browse authentic tarot and oracle decks from the community.</p>
                                </div>
                                <div className="listing-search-controls">
                                    <input type="text" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search listings..." aria-label="Search listings" />
                                    <div className="listing-summary-badge">{filteredListings.length} live decks</div>
                                </div>
                            </div>
                            {listings.length === 0 ? (
                                <div className="items-placeholder-grid empty-state-card">
                                    <p className="empty-message">No decks listed yet.</p>
                                    <button className="primary-btn" onClick={() => setActiveView('Sell')}>
                                        Add your first deck
                                    </button>
                                </div>
                            ) : filteredListings.length === 0 ? (
                                <div className="items-placeholder-grid empty-state-card">
                                    <p className="empty-message">No listings match your search.</p>
                                </div>
                            ) : (
                                <div className="listings-live-grid">
                                    {filteredListings.map((item) => (
                                        <div
                                            key={item.id}
                                            className="live-product-card"
                                            role="button"
                                            tabIndex={0}
                                            style={{ cursor: 'pointer' }}
                                            onClick={() => setViewingListing(item)}
                                            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setViewingListing(item); } }}
                                        >
                                            <div className="product-image-box" style={{ cursor: 'pointer' }}>
                                                {item.images.length > 0 ? (
                                                    <div className="listing-image-row">
                                                        {item.images.slice(0, 3).map((imageUrl, index) => (
                                                            <a key={imageUrl} href={imageUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open full-resolution image ${index + 1} of ${item.name}`} onClick={(event) => event.stopPropagation()}>
                                                                <img src={imageUrl} alt={`${item.name} photo ${index + 1}`} className="live-uploaded-img" />
                                                            </a>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="default-card-emoji">🎴</span>
                                                )}
                                            </div>
                                            <div className="product-details">
                                                <h4>{item.name}</h4>
                                                <a className="seller-profile-link" href={`/app/profile/${encodeURIComponent(item.sellerId)}`} onClick={(event) => event.stopPropagation()}>View seller profile</a>
                                                <span className={`listing-type-badge listing-type-badge--${item.listingType}`}>{item.listingType === 'sale' ? `For sale - £${item.price.toFixed(2)}` : item.listingType === 'swap' ? 'Open to swap' : 'Free to a good home'}</span>
                                                {item.description && <p className="listing-description">{item.description}</p>}
                                                <div className="product-footer">
                                                    <button
                                                        className="buy-btn"
                                                        onClick={(event) => { event.stopPropagation(); item.listingType === 'sale' ? handleAddToBasket(item) : setFlashMessage(item.listingType === 'swap' ? `Contact the seller to arrange a swap for ${item.name}.` : `Contact the seller to arrange collection for ${item.name}.`); }}
                                                    >
                                                        {item.listingType === 'sale' ? (basket.some((basketItem) => basketItem.id === item.id) ? 'In basket' : 'Add to basket') : item.listingType === 'swap' ? 'Arrange swap' : 'Request deck'}
                                                    </button>
                                                    <button
                                                        className="delete-btn"
                                                        onClick={(event) => { event.stopPropagation(); handleDelete(item.id); }}
                                                    >
                                                        🗑️ Delete
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    )}
                    {viewingListing && (
                        <div className="modal-backdrop" onClick={() => setViewingListing(null)}>
                            <div className="checkout-modal-card listing-detail-modal-card" onClick={(event) => event.stopPropagation()}>
                                <div className="modal-header">
                                    <h3>{viewingListing.name}</h3>
                                    <button className="close-modal-btn" onClick={() => setViewingListing(null)}>✕</button>
                                </div>
                                {viewingListing.images.length > 0 ? (
                                    <div className="listing-image-row listing-detail-modal-images">
                                        {viewingListing.images.map((imageUrl, index) => (
                                            <a key={imageUrl} href={imageUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open full-resolution image ${index + 1} of ${viewingListing.name}`}>
                                                <img src={imageUrl} alt={`${viewingListing.name} photo ${index + 1}`} className="live-uploaded-img" />
                                            </a>
                                        ))}
                                    </div>
                                ) : (
                                    <span className="default-card-emoji">🎴</span>
                                )}
                                <span className={`listing-type-badge listing-type-badge--${viewingListing.listingType}`}>{viewingListing.listingType === 'sale' ? `For sale - £${viewingListing.price.toFixed(2)}` : viewingListing.listingType === 'swap' ? 'Open to swap' : 'Free to a good home'}</span>
                                <p>Condition: {viewingListing.condition}{viewingListing.freeDelivery ? ' · Free delivery' : ''}</p>
                                {viewingListing.description && <p className="listing-description">{viewingListing.description}</p>}
                                <a className="seller-profile-link" href={`/app/profile/${encodeURIComponent(viewingListing.sellerId)}`}>View seller profile</a>
                                <div className="product-footer">
                                    <button
                                        className="buy-btn"
                                        onClick={() => viewingListing.listingType === 'sale' ? handleAddToBasket(viewingListing) : setFlashMessage(viewingListing.listingType === 'swap' ? `Contact the seller to arrange a swap for ${viewingListing.name}.` : `Contact the seller to arrange collection for ${viewingListing.name}.`)}
                                    >
                                        {viewingListing.listingType === 'sale' ? (basket.some((basketItem) => basketItem.id === viewingListing.id) ? 'In basket' : 'Add to basket') : viewingListing.listingType === 'swap' ? 'Arrange swap' : 'Request deck'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                    {/* 4. SELL VIEW */}
                    {activeView === 'Sell' && (
                        <section className="sell-section">
                            <h2>Create New Listing</h2>
                            <div className="listing-fee-notice">
                                <div>
                                    <strong>{listingFee === 0 ? 'Your next listing is free' : 'Buy 3 listing credits for £0.66'}</strong>
                                    <span>First 3 listings are free. Each following bundle of 3 listings is £0.66.</span>
                                </div>
                                {listingFee === 0 ? (
                                    <span className="listing-fee-badge">{3 - listingsInCurrentBundle} free left</span>
                                ) : (
                                    <button type="button" className="listing-credit-btn" onClick={handleBuyListingCredits} disabled={isBuyingListingCredits}>
                                        {isBuyingListingCredits ? 'Opening payment...' : 'Buy 3 credits - £0.66'}
                                    </button>
                                )}
                            </div>
                            <form onSubmit={handlePublish} className="sell-form">
                                <div className="form-group">
                                    <label>Listing type</label>
                                    <div className="listing-type-controls">
                                        <button type="button" className={listingType === 'sale' ? 'active' : ''} onClick={() => setListingType('sale')}>For sale</button>
                                        <button type="button" className={listingType === 'swap' ? 'active' : ''} onClick={() => { setListingType('swap'); setDeckPrice('0.00'); }}>Swap</button>
                                        <button type="button" className={listingType === 'free' ? 'active' : ''} onClick={() => { setListingType('free'); setDeckPrice('0.00'); setFreeDelivery(false); }}>Free</button>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Deck Name <span className="text-red-500 font-bold ml-0.5">*</span></label>
                                    <input
                                        type="text"
                                        value={deckName}
                                        onChange={(e) => setDeckName(e.target.value)}
                                        onInvalid={handleRequiredFieldInvalid}
                                        onInput={handleRequiredFieldInput}
                                        required
                                        aria-required="true"
                                        maxLength={120}
                                        placeholder="e.g., Rider-Waite Tarot"
                                    />
                                    <span className="field-error-text">This space must be filled in.</span>
                                </div>
                                <div className="form-group">
                                    <label>Price (£){listingType === 'sale' && <span className="text-red-500 font-bold ml-0.5">*</span>}{listingType !== 'sale' && ' - not needed'}</label>
                                    <input
                                        type="number"
                                        value={deckPrice}
                                        onChange={(e) => setDeckPrice(e.target.value)}
                                        placeholder="0.00"
                                        step="0.01"
                                        required={listingType === 'sale'}
                                        aria-required={listingType === 'sale'}
                                        onInvalid={handleRequiredFieldInvalid}
                                        onInput={handleRequiredFieldInput}
                                        disabled={listingType !== 'sale'}
                                    />
                                    {listingType === 'sale' && <span className="field-error-text">This space must be filled in.</span>}
                                </div>
                                <div className="form-group">
                                    <label htmlFor="deck-condition">Deck Condition <span className="text-red-500 font-bold ml-0.5">*</span></label>
                                    <select id="deck-condition" value={condition} required aria-required="true" onInvalid={handleRequiredFieldInvalid} onInput={handleRequiredFieldInput} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                        const nextCondition = e.target.value;
                                        if (['new', 'like new', 'good', 'fair', 'poor'].includes(nextCondition)) setCondition(nextCondition as DeckCondition);
                                    }}>
                                        <option value="new">New</option>
                                        <option value="like new">Like New</option>
                                        <option value="good">Good Condition</option>
                                        <option value="fair">Fair Condition</option>
                                        <option value="poor">Poor Condition</option>
                                    </select>
                                    <span className="field-error-text">This space must be filled in.</span>
                                </div>
                                {listingType !== 'free' && <div className="form-group checkbox-group">
                                    <input
                                        id="free-delivery"
                                        type="checkbox"
                                        checked={freeDelivery}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFreeDelivery(e.target.checked)}
                                    />
                                    <label className="checkbox-label" htmlFor="free-delivery">Offer Free Delivery. Include delivery charges in the listing price.</label>
                                </div>}
                                <div className="form-group">
                                    <label>Description</label>
                                    <textarea value={deckDescription} onChange={(e) => setDeckDescription(e.target.value)} maxLength={2000} placeholder={condition === 'poor' ? 'Please detail specific wear and tear, missing cards, or scuffed box outlines here...' : condition === 'new' || condition === 'like new' ? 'Mention any unopened packaging, pristine edges, or original inserts here...' : condition === 'fair' ? 'Please describe visible wear, marks, missing cards, or box damage here...' : 'Describe the deck condition, edition, missing cards, or what you would swap for.'} rows={4} />
                                </div>
                                <div className="form-group">
                                    <label>Deck Cover Image</label>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        onChange={handleImageChange}
                                    />
                                    {deckImageFiles.length > 0 && <div className="image-status">{deckImageFiles.length} image{deckImageFiles.length === 1 ? '' : 's'} selected and ready to publish</div>}
                                    {deckImageFiles.length > 0 && <div className="image-preview-list">
                                        {deckImageFiles.map((file) => <img key={`${file.name}-${file.lastModified}`} src={URL.createObjectURL(file)} alt="Selected deck preview" className="image-preview-thumbnail" />)}
                                    </div>}
                                </div>
                                <button type="submit" className="primary-btn">{listingFee === 0 ? 'Publish Free Listing' : 'Buy credits to publish'}</button>
                            </form>
                        </section>
                    )}

                    {/* 5. CHECKOUT VIEW */}
                    {activeView === 'Checkout' && (
                        <CheckoutViewIntegrated basket={basket} onRemoveFromBasket={(listingId) => setBasket((currentBasket) => currentBasket.filter((item) => item.id !== listingId))} onSignIn={() => setActiveView('Account')} onOpenLegal={(page) => setActiveLegalPage(page)} onFlashMessage={setFlashMessage} />
                    )}

                    {activeView === 'Help' && (
                        <HelpView />
                    )}

                    {activeView === 'Production' && (
                        <ProductionChecklistView checklist={productionChecklist} />
                    )}
                </main>

                <footer className="site-footer">
                    <div className="site-footer-inner">
                        <p className="footer-brand">Arkana</p>
                        <div className="footer-links" aria-label="Legal information">
                            <button type="button" className="footer-link-btn" onClick={() => setActiveLegalPage('terms')}>Terms & Conditions</button>
                            <button type="button" className="footer-link-btn" onClick={() => setActiveLegalPage('privacy')}>Privacy Policy</button>
                            <button type="button" className="footer-link-btn" onClick={() => setActiveLegalPage('refunds')}>Refunds</button>
                            <button type="button" className="footer-link-btn" onClick={() => setActiveLegalPage('shipping')}>Shipping</button>
                        </div>
                    </div>
                </footer>

                {/* OVERLAY CHECKOUT MODAL WINDOW */}
                {checkoutStep !== null && selectedItem && (
                    <div className="modal-backdrop">
                        <div className="checkout-modal-card">
                            <header className="modal-header">
                                <h3>Checkout: {selectedItem.name}</h3>
                                <button className="close-modal-btn" onClick={() => { setCheckoutStep(null); setSelectedItem(null); }}>✕</button>
                            </header>

                            {/* STEP A: AUTH PROMPT */}
                            {checkoutStep === 'auth' && (
                                <div className="modal-step-view">
                                    <p className="step-instruction-text">Sign in to your account or continue as a guest.</p>
                                    <div className="trust-inline-copy">Fast checkout • Secure payments • Clear shipping updates</div>
                                    <form onSubmit={handleLoginSubmit} className="modal-auth-form">
                                        <div className="form-group">
                                            <label>Email Address <span className="text-red-500 font-bold ml-0.5">*</span></label>
                                            <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} onInvalid={handleRequiredFieldInvalid} onInput={handleRequiredFieldInput} required aria-required="true" maxLength={254} />
                                            <span className="field-error-text">This space must be filled in.</span>
                                        </div>
                                        <div className="form-group">
                                            <label>Password <span className="text-red-500 font-bold ml-0.5">*</span></label>
                                            <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onInvalid={handleRequiredFieldInvalid} onInput={handleRequiredFieldInput} required aria-required="true" maxLength={128} />
                                            <span className="field-error-text">This space must be filled in.</span>
                                        </div>
                                        <button type="submit" className="buy-btn">Sign In & Continue</button>
                                    </form>
                                    <div className="divider-line-text"><span>or</span></div>
                                    <button className="secondary-btn guest-btn" onClick={handleGuestCheckout}>
                                        🏃 Checkout as Guest
                                    </button>
                                </div>
                            )}

                            {/* STEP B: DELIVERY SELECTION */}
                            {checkoutStep === 'delivery' && (
                                <div className="modal-step-view">
                                    <p className="step-instruction-text">Choose your preferred shipping method:</p>
                                    <div className="delivery-options-stack">
                                        <label className={`delivery-card-option ${deliveryMethod === 'standard' ? 'selected' : ''}`}>
                                            <input
                                                type="radio"
                                                name="delivery"
                                                checked={deliveryMethod === 'standard'}
                                                onChange={() => setDeliveryMethod('standard')}
                                            />
                                            <div className="delivery-card-details">
                                                <strong>Standard Shipping</strong>
                                                <span>Delivered within 3-5 working days</span>
                                            </div>
                                            <span className="delivery-price">£2.99</span>
                                        </label>

                                        <label className={`delivery-card-option ${deliveryMethod === 'express' ? 'selected' : ''}`}>
                                            <input
                                                type="radio"
                                                name="delivery"
                                                checked={deliveryMethod === 'express'}
                                                onChange={() => setDeliveryMethod('express')}
                                            />
                                            <div className="delivery-card-details">
                                                <strong>Express Delivery</strong>
                                                <span>Tracked next-day delivery dispatch</span>
                                            </div>
                                            <span className="delivery-price">£5.50</span>
                                        </label>

                                        <label className={`delivery-card-option ${deliveryMethod === 'collection' ? 'selected' : ''}`}>
                                            <input
                                                type="radio"
                                                name="delivery"
                                                checked={deliveryMethod === 'collection'}
                                                onChange={() => setDeliveryMethod('collection')}
                                            />
                                            <div className="delivery-card-details">
                                                <strong>Collect in person</strong>
                                                <span>Arrange a collection time with the seller after requesting the deck</span>
                                            </div>
                                            <span className="delivery-price">Free</span>
                                        </label>
                                    </div>
                                    <div className="order-inline-total">
                                        {deliveryMethod === 'collection' ? 'No delivery charge. Payment is arranged safely with the seller.' : <>Order total updates live: <strong>£{(selectedItem.price + deliveryFee).toFixed(2)}</strong></>}
                                    </div>
                                    <button className="buy-btn action-forward-btn" onClick={() => setCheckoutStep('payment')}>
                                        Proceed to Payment →
                                    </button>
                                </div>
                            )}

                            {/* STEP C: MULTI-GATEWAY PAYMENT OPTIONS */}
                            {checkoutStep === 'payment' && (
                                <div className="modal-step-view">
                                    <p className="step-instruction-text">Review your order total and select a payment method:</p>
                                    <div className="order-summary-box">
                                        <div className="summary-row"><span>Deck Subtotal</span><span>£{selectedItem.price.toFixed(2)}</span></div>
                                        <div className="summary-row"><span>{deliveryMethod === 'collection' ? 'Collection' : 'Shipping'}</span><span>{deliveryMethod === 'collection' ? 'Free' : `£${deliveryFee.toFixed(2)}`}</span></div>
                                        <div className="summary-row total-row"><strong>{deliveryMethod === 'collection' ? 'Pay on collection' : 'Final Total'}</strong><strong>£{orderTotal.toFixed(2)}</strong></div>
                                    </div>

                                    <div className="terms-row">
                                        <input
                                            id="terms-checkbox"
                                            type="checkbox"
                                            checked={termsAccepted}
                                            onChange={(e) => setTermsAccepted(e.target.checked)}
                                        />
                                        <label htmlFor="terms-checkbox">
                                            I agree to the Terms of Service, Privacy Policy, and Seller Guidelines.
                                        </label>
                                    </div>

                                    {deliveryMethod === 'collection' ? (
                                        <div className="collection-payment-panel">
                                            <p>Pay the seller in cash when you collect. The seller confirms the collection time and address after accepting your request.</p>
                                            <button className="buy-btn secure-payment-final-btn" onClick={() => handleFinalisePayment('Cash')} disabled={!termsAccepted}>Request collection and pay cash</button>
                                        </div>
                                    ) : (
                                        <div className="payment-gateway-buttons">
                                            <button className="buy-btn secure-payment-final-btn" onClick={() => handleFinalisePayment('Stripe')} disabled={!termsAccepted}>
                                                Pay with Stripe
                                            </button>
                                            <button className="paypal-btn" onClick={() => handleFinalisePayment('PayPal')} disabled={!termsAccepted}>
                                                Pay with PayPal
                                            </button>
                                        </div>
                                    )}
                                    <div className="checkout-legal-links" aria-label="Legal information">
                                        <button type="button" className="footer-link-btn" onClick={() => setActiveLegalPage('terms')}>Terms & Conditions</button>
                                        <button type="button" className="footer-link-btn" onClick={() => setActiveLegalPage('privacy')}>Privacy Policy</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {showTermsModal && (
                    <div className="modal-backdrop terms-modal-backdrop" onClick={() => setShowTermsModal(false)}>
                        <div className="terms-modal-panel" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header terms-modal-header">
                                <h3>Terms & Conditions</h3>
                                <button className="close-modal-btn" onClick={() => setShowTermsModal(false)}>✕</button>
                            </div>
                            <div className="terms-modal-body">
                                <p>By using ArkanaDeck, you agree to comply with our marketplace rules, shipping policies, and payment terms.</p>
                                <p>Payments are processed securely via Stripe. Sellers are responsible for accurate listings, safe packaging, and timely dispatch.</p>
                                <p>Buyers are responsible for providing correct shipping details and confirming their order before payment.</p>
                                <p>We are not liable for delays caused by couriers, incorrect address information, or circumstances beyond our reasonable control.</p>
                                <p>Refunds are subject to our returns and dispute policy. Accounts may be suspended if marketplace rules are violated.</p>
                                <p>By continuing, you confirm that you understand the platform terms and complete the purchase at your own risk.</p>
                            </div>
                            <button className="primary-btn terms-accept-btn" onClick={() => { setTermsAccepted(true); setShowTermsModal(false); }}>
                                I agree
                            </button>
                        </div>
                    </div>
                )}

                {activeLegalPage && (
                    <div className="modal-backdrop terms-modal-backdrop" onClick={() => setActiveLegalPage(null)}>
                        <div className="terms-modal-panel legal-modal-panel" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header terms-modal-header">
                                <h3>
                                    {activeLegalPage === 'terms' && 'Terms & Conditions'}
                                    {activeLegalPage === 'privacy' && 'Privacy Policy'}
                                    {activeLegalPage === 'refunds' && 'Refund Policy'}
                                    {activeLegalPage === 'shipping' && 'Shipping Policy'}
                                </h3>
                                <button className="close-modal-btn" onClick={() => setActiveLegalPage(null)}>✕</button>
                            </div>
                            <div className="terms-modal-body legal-modal-body">
                                {activeLegalPage === 'terms' && (
                                    <>
                                        <p>By using Arkana, you agree to comply with our marketplace rules, payment terms, and seller obligations.</p>
                                        <p>All listings must be accurate, lawful, and clearly described. Sellers are responsible for dispatching items in a safe and timely manner.</p>
                                        <p>Buyers are responsible for providing accurate delivery details and confirming the order before payment is processed.</p>
                                        <p>We are not liable for delays caused by courier services, incomplete address information, or circumstances outside of our reasonable control.</p>
                                    </>
                                )}

                                {activeLegalPage === 'privacy' && (
                                    <>
                                        <p>We collect your name, email address, order details, and delivery information to process purchases and maintain a secure marketplace account.</p>
                                        <p>Information is stored securely and used only for order fulfilment, customer support, and platform administration.</p>
                                        <p>We do not sell personal data to third parties. Payment processing is handled through our trusted gateway services.</p>
                                    </>
                                )}

                                {activeLegalPage === 'refunds' && (
                                    <>
                                        <p>Refunds may be issued when an item is damaged, incorrect, or not received within the stated service window.</p>
                                        <p>Claims must be raised within 48 hours of delivery and must include proof of issue such as a photograph or parcel description.</p>
                                        <p>Refunds are reviewed case by case. If a seller has fulfilled the order correctly, the refund may be denied.</p>
                                    </>
                                )}

                                {activeLegalPage === 'shipping' && (
                                    <>
                                        <p>Standard UK delivery is typically completed within 3 to 5 working days. Express delivery is available at checkout.</p>
                                        <p>Dispatch times may vary depending on the seller and stock availability. Orders are packed and shipped with care, but courier delays remain outside our control.</p>
                                        <p>Customers are responsible for ensuring their address is complete and accurate before final payment.</p>
                                    </>
                                )}
                            </div>
                            <button className="primary-btn terms-accept-btn" onClick={() => setActiveLegalPage(null)}>
                                Close
                            </button>
                        </div>
                    </div>
                )}
                <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000 }}>
                    <button style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#0f172a', color: '#ffffff', fontSize: '24px', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>🔮</button>
                </div>
            </div>
        </div>
    );
};

// ========================================================
// 5. INTEGRATED CHECKOUT VIEW COMPONENT
// ========================================================
const CheckoutViewIntegrated: React.FC<{ basket: DeckListing[]; onRemoveFromBasket: (listingId: string) => void; onSignIn: () => void; onOpenLegal: (page: 'terms' | 'privacy') => void; onFlashMessage: (message: string) => void }> = ({ basket, onRemoveFromBasket, onSignIn, onOpenLegal, onFlashMessage }) => {
    type PaymentGateway = 'stripe' | 'paypal';
    const [shippingOption, setShippingOption] = React.useState<'evri_standard' | 'royal_mail_48' | 'royal_mail_24'>('evri_standard');
    const [selectedGateway, setSelectedGateway] = React.useState<PaymentGateway>('stripe');
    const [postcode, setPostcode] = React.useState<string>('');
    const [isPostcodeValid, setIsPostcodeValid] = React.useState<boolean>(true);
    const [fullName, setFullName] = React.useState<string>('');
    const [email, setEmail] = React.useState<string>('');
    const [addressLineOne, setAddressLineOne] = React.useState<string>('');
    const [addressLineTwo, setAddressLineTwo] = React.useState<string>('');
    const [townOrCity, setTownOrCity] = React.useState<string>('');
    const [termsAccepted, setTermsAccepted] = React.useState<boolean>(false);
    const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
    const [checkoutError, setCheckoutError] = React.useState<string | null>(null);
    const [deliveryReference] = React.useState(() => `ARK-${Date.now().toString().slice(-6)}`);
    const runtimeConfig = getRuntimeConfig();

    const handleRequiredFieldInvalid = (event: React.FormEvent<HTMLInputElement | HTMLSelectElement>) => {
        event.currentTarget.classList.add('field-border-error');
        event.currentTarget.closest('label')?.classList.add('field-error');
    };

    const handleRequiredFieldInput = (event: React.FormEvent<HTMLInputElement | HTMLSelectElement>) => {
        if (event.currentTarget.value.trim()) {
            event.currentTarget.classList.remove('field-border-error');
            event.currentTarget.closest('label')?.classList.remove('field-error');
        }
    };

    // Validate UK Postcode format
    const handlePostcodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.toUpperCase();
        setPostcode(val);
        const ukPostcodeRegex = /^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$/;
        setIsPostcodeValid(val === '' || ukPostcodeRegex.test(val));
    };

    const shippingPrices = { evri_standard: 2.99, royal_mail_48: 3.65, royal_mail_24: 4.65 };
    const shipping = shippingPrices[shippingOption];
    const deckTotal = basket.reduce((sum, item) => sum + item.price, 0);
    const subtotal = deckTotal + shipping;
    const grandTotal = Math.ceil(((subtotal + (selectedGateway === 'stripe' ? 0.20 : 0.30)) / (1 - (selectedGateway === 'stripe' ? 0.015 : 0.029))) * 100) / 100;
    const platformServiceFee = grandTotal - subtotal;
    const deliveryQrValue = JSON.stringify({
        reference: deliveryReference,
        courier: shipping === 2.99 ? 'Evri Standard' : shipping === 3.65 ? 'Royal Mail Tracked 48' : 'Royal Mail Tracked 24',
        postcode: postcode || 'Awaiting postcode',
    });

    const handleCheckoutSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setCheckoutError(null);
        if (!basket.length) {
            setCheckoutError('Your basket is empty. Add a deck before checking out.');
            return;
        }
        const distinctSellerIds = Array.from(new Set(basket.map((item) => item.sellerId)));
        const currentSellerId = distinctSellerIds[0];
        const currentSellerItems = basket.filter((item) => item.sellerId === currentSellerId);
        if (distinctSellerIds.length > 1) {
            onFlashMessage(`Checking out ${currentSellerItems.length} deck(s) from this seller first. The remaining items stay in your basket to check out next.`);
        }
        if (!isPostcodeValid || !postcode || !fullName.trim() || !email.trim() || !addressLineOne.trim() || !townOrCity.trim() || !termsAccepted) {
            setCheckoutError('Complete your delivery details and accept the Terms & Conditions to continue.');
            return;
        }
        if (!runtimeConfig.isSecureMode) {
            setCheckoutError('Secure checkout is unavailable until production payment settings are configured.');
            return;
        }

        setIsSubmitting(true);
        try {
            if (currentSellerItems.length < 1 || currentSellerItems.length > 3) throw new Error('Choose between 1 and 3 decks from the same seller.');
            const checkoutInput = {
                listingIds: currentSellerItems.map((item) => item.id),
                shippingOption,
                deliveryAddress: {
                    name: fullName.trim(),
                    email: email.trim(),
                    addressLineOne: addressLineOne.trim(),
                    addressLineTwo: addressLineTwo.trim() || undefined,
                    city: townOrCity.trim(),
                    postcode: postcode.trim(),
                },
            };
            console.log('Checkout gateway selected', { gateway: selectedGateway });
            const response = selectedGateway === 'paypal'
                ? await createPayPalOrder(checkoutInput)
                : await createOrderCheckout(checkoutInput);
            if (!response?.url) throw new Error('Payment session did not return a checkout URL.');
            window.location.assign(response.url);
        } catch (error) {
            setCheckoutError(error instanceof Error ? error.message : 'Checkout could not be created.');
            setIsSubmitting(false);
        }
    };

    return (
        <section className="checkout-page-shell">
            <div className="checkout-page-heading">
                <p className="checkout-page-kicker">Secure checkout</p>
                <h2>Delivery and payment</h2>
                <p>Sign in to protect your purchase, confirm delivery, and keep your order history.</p>
                <button type="button" className="guest-account-link" onClick={onSignIn}>Sign in or create an account</button>
            </div>

            <div className="checkout-page-grid">
                <form onSubmit={handleCheckoutSubmit} className="checkout-details-panel">
                    <div className="checkout-section-heading">
                        <span>1</span>
                        <div><h3>Delivery details</h3><p>Used only for dispatch and order updates.</p></div>
                    </div>
                    <div className="checkout-field-grid">
                        <label className="checkout-field checkout-field-wide">Full name <span className="text-red-500 font-bold ml-0.5">*</span>
                            <input type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} onInvalid={handleRequiredFieldInvalid} onInput={handleRequiredFieldInput} autoComplete="name" required aria-required="true" maxLength={120} placeholder="Your full name" />
                            <span className="field-error-text">This space must be filled in.</span>
                        </label>
                        <label className="checkout-field checkout-field-wide">Email address <span className="text-red-500 font-bold ml-0.5">*</span>
                            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} onInvalid={handleRequiredFieldInvalid} onInput={handleRequiredFieldInput} autoComplete="email" required aria-required="true" maxLength={254} placeholder="you@example.com" />
                            <span className="field-error-text">This space must be filled in.</span>
                        </label>
                        <label className="checkout-field checkout-field-wide">Address line 1 <span className="text-red-500 font-bold ml-0.5">*</span>
                            <input type="text" value={addressLineOne} onChange={(event) => setAddressLineOne(event.target.value)} onInvalid={handleRequiredFieldInvalid} onInput={handleRequiredFieldInput} autoComplete="address-line1" required aria-required="true" maxLength={120} placeholder="House number and street" />
                            <span className="field-error-text">This space must be filled in.</span>
                        </label>
                        <label className="checkout-field checkout-field-wide">Address line 2 <span className="checkout-field-optional">Optional</span>
                            <input type="text" value={addressLineTwo} onChange={(event) => setAddressLineTwo(event.target.value)} autoComplete="address-line2" maxLength={120} placeholder="Flat, building, or area" />
                        </label>
                        <label className="checkout-field">Town or city <span className="text-red-500 font-bold ml-0.5">*</span>
                            <input type="text" value={townOrCity} onChange={(event) => setTownOrCity(event.target.value)} onInvalid={handleRequiredFieldInvalid} onInput={handleRequiredFieldInput} autoComplete="address-level2" required aria-required="true" maxLength={80} placeholder="London" />
                            <span className="field-error-text">This space must be filled in.</span>
                        </label>
                        <label className="checkout-field">Country
                            <input type="text" value="United Kingdom" disabled />
                        </label>
                        <label className="checkout-field">UK postcode <span className="text-red-500 font-bold ml-0.5">*</span>
                            <input type="text" value={postcode} onChange={handlePostcodeChange} onInvalid={handleRequiredFieldInvalid} onInput={handleRequiredFieldInput} autoComplete="postal-code" required aria-required="true" maxLength={10} placeholder="SW1A 1AA" aria-invalid={!isPostcodeValid} />
                            <span className="field-error-text">This space must be filled in.</span>
                            {!isPostcodeValid && <span className="checkout-validation">Enter a valid UK postcode.</span>}
                        </label>
                    </div>
                    <div className="checkout-section-heading checkout-section-heading--courier">
                        <span>2</span>
                        <div><h3>Delivery service</h3><p>Select the tracking speed that suits you.</p></div>
                    </div>
                    <label className="checkout-field">Courier <span className="text-red-500 font-bold ml-0.5">*</span>
                        <select value={shippingOption} required aria-required="true" onInvalid={handleRequiredFieldInvalid} onInput={handleRequiredFieldInput} onChange={(event) => setShippingOption(event.target.value as typeof shippingOption)}>
                            <option value="evri_standard">Evri Standard Drop-off - £2.99</option>
                            <option value="royal_mail_48">Royal Mail Tracked 48 - £3.65</option>
                            <option value="royal_mail_24">Royal Mail Tracked 24 - £4.65</option>
                        </select>
                        <span className="field-error-text">This space must be filled in.</span>
                    </label>
                    <label className="checkout-terms">
                        <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} onInvalid={handleRequiredFieldInvalid} onInput={handleRequiredFieldInput} required aria-required="true" />
                        <span>I agree to the Terms of Service, Privacy Policy, and Seller Guidelines. <span className="text-red-500 font-bold ml-0.5">*</span></span><span className="field-error-text">This space must be filled in.</span>
                    </label>
                    {checkoutError && <p className="checkout-error" role="alert">{checkoutError}</p>}
                    <div className="payment-gateway-grid" role="radiogroup" aria-label="Choose payment method">
                        {(['stripe', 'paypal'] as const).map((gateway) => (
                            <label key={gateway} className={`payment-gateway-card${selectedGateway === gateway ? ' payment-gateway-card--selected' : ''}`}>
                                <input
                                    type="radio"
                                    name="paymentGateway"
                                    value={gateway}
                                    checked={selectedGateway === gateway}
                                    onChange={() => {
                                        setSelectedGateway(gateway);
                                        console.log('Payment gateway toggled', { gateway });
                                    }}
                                />
                                <span className="payment-gateway-card__copy">
                                    <strong>{gateway === 'stripe' ? 'Credit Card' : 'PayPal'}</strong>
                                    <small>{gateway === 'stripe' ? 'Secure card payment via Stripe' : 'Pay securely with PayPal'}</small>
                                </span>
                                <span className="payment-gateway-card__mark" aria-hidden="true">{selectedGateway === gateway ? 'Selected' : ''}</span>
                            </label>
                        ))}
                    </div>
                    <div className="checkout-total-list checkout-price-breakdown">
                        <div><span>Subtotal</span><strong>£{subtotal.toFixed(2)}</strong></div>
                        <div><span>Transaction fee ({selectedGateway === 'stripe' ? 'Stripe' : 'PayPal'})</span><strong>£{platformServiceFee.toFixed(2)}</strong></div>
                        <div className="checkout-grand-total"><span>Total charged</span><strong>£{grandTotal.toFixed(2)}</strong></div>
                    </div>
                    {selectedGateway === 'stripe' ? (
                        <button type="submit" className="checkout-pay-btn" disabled={isSubmitting || !basket.length}>
                            {isSubmitting ? 'Opening secure payment...' : 'Continue with Credit Card'}
                        </button>
                    ) : (
                        <button type="submit" className="paypal-btn" disabled={isSubmitting || !basket.length}>
                            {isSubmitting ? 'Opening PayPal...' : 'Continue with PayPal'}
                        </button>
                    )}
                    <p className="checkout-security-note">Payments are securely processed by Stripe or PayPal. Card details are never stored by Arkana.</p>
                    <div className="checkout-legal-links" aria-label="Legal information">
                        <button type="button" className="footer-link-btn" onClick={() => onOpenLegal('terms')}>Terms & Conditions</button>
                        <button type="button" className="footer-link-btn" onClick={() => onOpenLegal('privacy')}>Privacy Policy</button>
                    </div>
                </form>

                <aside className="checkout-summary-panel">
                    <div className="checkout-section-heading">
                        <span>Order</span>
                        <div><h3>Your basket</h3><p>{basket.length} item{basket.length === 1 ? '' : 's'} ready to ship.</p></div>
                    </div>
                    <div className="checkout-items">
                        {basket.map(item => (
                            <div key={item.id} className="checkout-item-row">
                                <div><strong>{item.name}</strong><span>Tarot deck</span></div>
                                <div className="checkout-item-price"><strong>£{item.price.toFixed(2)}</strong><button type="button" onClick={() => onRemoveFromBasket(item.id)}>Remove</button></div>
                            </div>
                        ))}
                    </div>
                    <div className="checkout-total-list">
                        <div><span>Subtotal</span><strong>£{subtotal.toFixed(2)}</strong></div>
                        <div><span>Platform service fee</span><strong>£{platformServiceFee.toFixed(2)}</strong></div>
                        <div className="checkout-grand-total"><span>Grand total</span><strong>£{grandTotal.toFixed(2)}</strong></div>
                    </div>
                    <div className="delivery-qr-panel">
                        <div>
                            <p className="delivery-qr-kicker">Delivery reference</p>
                            <strong>{deliveryReference}</strong>
                            <p>Keep this code for your order records. A carrier label and tracking link are issued after dispatch.</p>
                        </div>
                        <QRCodeSVG value={deliveryQrValue} size={84} level="M" includeMargin aria-label={`Delivery reference ${deliveryReference}`} />
                    </div>
                </aside>
            </div >
        </section >
    );
};

type BuyerOrder = {
    id: string;
    status: string;
    total: number;
    tracking_reference: string | null;
    listings: { name: string }[];
};

const BuyerOrdersPanel: React.FC = () => {
    const [orders, setOrders] = React.useState<BuyerOrder[]>([]);
    const [statusMessage, setStatusMessage] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!supabase) return;
        supabase.from('orders').select('id, status, total, tracking_reference, listings(name)').order('created_at', { ascending: false })
            .then(({ data, error }) => {
                if (error) setStatusMessage(error.message);
                else setOrders((data || []) as BuyerOrder[]);
            });

    }, []);

    const submitOrderAction = async (endpoint: string, orderId: string, reason?: string) => {
        setStatusMessage(null);
        try {
            const session = await getSupabaseSession();
            if (!session?.access_token) throw new Error('Sign in before updating an order.');
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({ orderId, reason }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload?.error || 'Unable to update this order.');
            setOrders((currentOrders) => currentOrders.map((order) => order.id === orderId ? { ...order, status: endpoint.includes('confirm') ? 'completed' : 'disputed' } : order));
            setStatusMessage(endpoint.includes('confirm') ? 'Receipt confirmed. The seller payout is being released.' : 'Problem reported. The seller payout is now on hold.');
        } catch (error) {
            setStatusMessage(error instanceof Error ? error.message : 'Unable to update this order.');
        }
    };

    const handleReportProblem = (orderId: string) => {
        const reason = window.prompt('Tell us what was wrong with the item or delivery.');
        if (reason?.trim()) submitOrderAction('/api/report-order-problem', orderId, reason);
    };

    return (
        <section className="buyer-orders-panel">
            <div className="buyer-orders-heading"><div><h3>Your purchases</h3><p>Confirm when an item arrives as described. Problems pause the seller payout for review.</p></div></div>
            {statusMessage && <p className="account-status" role="status">{statusMessage}</p>}
            {orders.length === 0 ? <p className="buyer-orders-empty">No purchases yet.</p> : (
                <div className="buyer-orders-list">
                    {orders.map((order) => (
                        <article className="buyer-order" key={order.id}>
                            <div><strong>{order.listings[0]?.name || 'Marketplace order'}</strong><span>{order.status.replace(/_/g, ' ')}{order.tracking_reference ? ` - Tracking: ${order.tracking_reference}` : ''}</span></div>
                            <div className="buyer-order-actions">
                                <strong>£{Number(order.total).toFixed(2)}</strong>
                                {order.status === 'dispatched' && <button type="button" onClick={() => submitOrderAction('/api/mark-order-delivered', order.id)}>Item has arrived</button>}
                                {order.status === 'delivered' && <><button type="button" onClick={() => submitOrderAction('/api/confirm-order-received', order.id)}>Received as described</button><button type="button" className="buyer-report-btn" onClick={() => handleReportProblem(order.id)}>Report a problem</button></>}
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </section>
    );
};

type SellerOrder = {
    id: string;
    delivery_service: string | null;
    delivery_city: string | null;
    delivery_postcode: string | null;
    listings: { name: string }[];
};

const SellerOrdersPanel: React.FC = () => {
    const [orders, setOrders] = React.useState<SellerOrder[]>([]);
    const [trackingValues, setTrackingValues] = React.useState<Record<string, string>>({});
    const [statusMessage, setStatusMessage] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!supabase) return;
        supabase.from('orders').select('id, delivery_service, delivery_city, delivery_postcode, listings(name)').eq('status', 'paid').order('created_at', { ascending: false })
            .then(({ data, error }) => {
                if (error) setStatusMessage(error.message);
                else setOrders((data || []) as SellerOrder[]);
            });
    }, []);

    const dispatchOrder = async (orderId: string) => {
        const trackingReference = trackingValues[orderId]?.trim();
        if (!trackingReference) return;
        try {
            const session = await getSupabaseSession();
            if (!session?.access_token) throw new Error('Sign in before dispatching an order.');
            const response = await fetch('/api/dispatch-order', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ orderId, trackingReference }) });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload?.error || 'Unable to dispatch this order.');
            setOrders((currentOrders) => currentOrders.filter((order) => order.id !== orderId));
            setStatusMessage('Order dispatched. The buyer can now confirm receipt.');
        } catch (error) {
            setStatusMessage(error instanceof Error ? error.message : 'Unable to dispatch this order.');
        }
    };

    return <section className="seller-orders-panel">
        <div className="buyer-orders-heading"><div><h3>Orders to dispatch</h3><p>Buy postage through Parcel2Go or your preferred courier, then add the tracking reference.</p></div></div>
        {statusMessage && <p className="account-status" role="status">{statusMessage}</p>}
        {orders.length === 0 ? <p className="buyer-orders-empty">No paid orders waiting for dispatch.</p> : <div className="buyer-orders-list">{orders.map((order) => <article className="buyer-order" key={order.id}>
            <div><strong>{order.listings[0]?.name || 'Marketplace order'}</strong><span>{order.delivery_service} to {order.delivery_city}, {order.delivery_postcode}</span></div>
            <div className="seller-dispatch-actions"><label className="visually-hidden" htmlFor={`tracking-${order.id}`}>Tracking reference <span className="text-red-500 font-bold ml-0.5">*</span></label><input id={`tracking-${order.id}`} value={trackingValues[order.id] || ''} onChange={(event) => setTrackingValues((current) => ({ ...current, [order.id]: event.target.value }))} required aria-required="true" maxLength={100} placeholder="Tracking reference" /><button type="button" onClick={() => dispatchOrder(order.id)}>Mark dispatched</button></div>
        </article>)}</div>}
    </section>;
};

const HelpView: React.FC = () => (
    <section className="help-page">
        <div className="help-page-heading">
            <p>Help & FAQ</p>
            <h2>Buying and selling on Arkana</h2>
        </div>
        <div className="help-grid">
            <article className="help-card">
                <h3>How do I sell a deck?</h3>
                <ol><li>Create an account and complete seller information.</li><li>Choose Sale, Swap, or Free and publish your listing.</li><li>For paid orders, package the deck and buy postage through Parcel2Go or your preferred courier.</li><li>Add the courier tracking reference to the order.</li></ol>
            </article>
            <article className="help-card">
                <h3>Who pays for delivery?</h3>
                <p>The buyer chooses and pays the delivery option at checkout. The seller uses the delivery budget to buy the postage label. Collection in person has no delivery charge.</p>
            </article>
            <article className="help-card">
                <h3>How are sellers paid?</h3>
                <p>For paid orders, funds are held until the buyer confirms the deck arrived and matches its description. Sellers set up payouts securely with Stripe Connect.</p>
            </article>
            <article className="help-card">
                <h3>What if there is a problem?</h3>
                <p>Buyers can report a delivery or description problem from their account. This pauses the seller payout while the issue is reviewed.</p>
            </article>
            <article className="help-card">
                <h3>How do swaps and free decks work?</h3>
                <p>Swap and Free listings do not use checkout. Use the request button to arrange the exchange or collection directly with the seller.</p>
            </article>
            <article className="help-card help-card--steps">
                <h3>Do buyers need a PayPal Merchant ID?</h3>
                <ol>
                    <li>No. Buyers never need a Merchant ID to pay on Arkana.</li>
                    <li>Simply add a deck to your basket and choose <strong>Pay with PayPal</strong> at checkout.</li>
                    <li>Sign in to your own PayPal account when PayPal prompts you, and confirm the payment.</li>
                    <li>Arkana routes the funds to the seller automatically using their payout details.</li>
                </ol>
            </article>
            <article className="help-card help-card--steps">
                <h3>How do sellers find their PayPal Merchant ID?</h3>
                <ol>
                    <li>Log in to your PayPal Business account at paypal.com.</li>
                    <li>Go to <strong>Account Settings</strong> &gt; <strong>Business Information</strong>.</li>
                    <li>Find the line labelled <strong>Merchant account ID</strong> and copy the 13-character code.</li>
                    <li>Return to Arkana and open <strong>Your account</strong> &gt; <strong>Seller Verification &amp; Payout Setup</strong>.</li>
                    <li>Paste the ID into the <strong>PayPal merchant ID</strong> field and save your seller information.</li>
                </ol>
            </article>
            <article className="help-card">
                <h3>Where do I find Terms & Conditions?</h3>
                <p>Use the footer links for Terms & Conditions, Privacy Policy, Refunds, and Shipping information.</p>
            </article>
        </div>
    </section>
);

// ========================================================
// 6. INTEGRATED SELLER DASHBOARD COMPONENT
// ========================================================
const ProductionChecklistView: React.FC<{ checklist: ReturnType<typeof getProductionChecklist> }> = ({ checklist }) => {
    const pendingItems = checklist.filter((item) => item.status === 'pending');
    const warningItems = checklist.filter((item) => item.status === 'warning');

    return (
        <div className="production-checklist-panel">
            <div className="production-header">
                <div>
                    <p className="eyebrow">Launch readiness</p>
                    <h2>Production checklist for ArkanaDeck</h2>
                </div>
                <span className="production-badge">Secure launch gates</span>
            </div>

            <div className="checklist-status-grid">
                <div className="status-card status-card--ok">
                    <strong>{pendingItems.length === 0 ? 'Configuration complete' : 'Configuration required'}</strong>
                    <span>{pendingItems.length === 0 ? 'Required runtime configuration is present.' : `${pendingItems.length} configuration gate${pendingItems.length === 1 ? '' : 's'} still need attention.`}</span>
                </div>
                <div className="status-card status-card--warn">
                    <strong>{warningItems.length === 0 ? 'Launch checks complete' : 'Deployment verification'}</strong>
                    <span>{warningItems.length === 0 ? 'No deployment verification warnings remain.' : `${warningItems.length} deployment check${warningItems.length === 1 ? '' : 's'} still need verification.`}</span>
                </div>
            </div>

            <div className="checklist-list">
                {checklist.map((item) => (
                    <div key={item.title} className={`checklist-item checklist-item--${item.status}`}>
                        <div className="checklist-marker" aria-label={item.status}>{item.status === 'complete' ? '✓' : item.status === 'warning' ? '!' : '•'}</div>
                        <div>
                            <h3>{item.title}</h3>
                            <p>{item.detail}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="production-actions">
                <div className="production-action-block">
                    <h4>Required before public launch</h4>
                    <ul>
                        <li>Supabase Auth + protected sessions</li>
                        <li>Stripe or PayPal server confirmations</li>
                        <li>Listings, orders, and payments tables with RLS</li>
                        <li>HTTPS + secure headers + env secrets</li>
                    </ul>
                </div>
                <div className="production-action-block">
                    <h4>Release gate</h4>
                    <ul>
                        <li>QA payment test flow</li>
                        <li>Seller payout review</li>
                        <li>Incident logging and monitoring</li>
                        <li>Launch approval sign-off</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

const SellerDashboardIntegrated: React.FC = () => {
    const [trackingReference, setTrackingReference] = React.useState('');
    const [savedTrackingReference, setSavedTrackingReference] = React.useState('');
    const [isDispatched, setIsDispatched] = React.useState(false);

    const handleSaveTracking = () => {
        if (!trackingReference.trim()) return;
        setSavedTrackingReference(trackingReference.trim());
        setIsDispatched(true);
    };

    return (
        <div className="fulfillment-shell">
            <div className="fulfillment-header">
                <div>
                    <p className="fulfillment-kicker">Fulfillment</p>
                    <h2>Seller dispatch workflow</h2>
                </div>
                <span className="fulfillment-badge">UK locked</span>
            </div>

            <div className="fulfillment-brief">
                Fulfillment is the post-sale step where the seller packs, ships, and tracks the order until it reaches the buyer.
            </div>

            <div className="fulfillment-grid">
                <div className="fulfillment-card">
                    <h3>1. Pack</h3>
                    <p>Wrap the deck securely and protect the card box corners before sealing the parcel.</p>
                </div>
                <div className="fulfillment-card">
                    <h3>2. Customer address</h3>
                    <div className="address-box">
                        <span>Arkana Customer</span>
                        <span>18 Oak Row</span>
                        <span>Leeds, LS1 4AA</span>
                        <span>United Kingdom</span>
                    </div>
                </div>
                <div className="fulfillment-card">
                    <h3>3. Courier</h3>
                    <ul className="fulfillment-links">
                        <li><a href="https://www.evri.com/send" target="_blank" rel="noreferrer">Evri Send</a></li>
                        <li><a href="https://send.royalmail.com" target="_blank" rel="noreferrer">Royal Mail Click & Drop</a></li>
                        <li><a href="https://inpost.co.uk/send-a-parcel" target="_blank" rel="noreferrer">InPost lockers</a></li>
                        <li><a href="https://www.parcel2go.com" target="_blank" rel="noreferrer">Parcel2Go</a></li>
                        <li><a href="https://www.yodel.co.uk/send" target="_blank" rel="noreferrer">Yodel Direct</a></li>
                    </ul>
                </div>
                <div className="fulfillment-card">
                    <h3>4. Tracking</h3>
                    <p className="tracking-helper">Buy the label with your chosen courier, then add its tracking reference here.</p>
                    <label className="tracking-label">Tracking reference <span className="text-red-500 font-bold ml-0.5">*</span></label>
                    <div className="tracking-row">
                        <input type="text" value={trackingReference} onChange={(event) => setTrackingReference(event.target.value)} required aria-required="true" maxLength={100} placeholder="e.g. 123456789012345" />
                        <button type="button" onClick={handleSaveTracking} disabled={!trackingReference.trim()}>Mark dispatched</button>
                    </div>
                    {isDispatched && <p className="dispatch-confirmation" role="status">Dispatched. Buyer tracking: {savedTrackingReference}</p>}
                </div>
            </div>
        </div>
    );
};
