import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
// @ts-ignore
import './main-layout.css';
import { getProductionChecklist } from './production-checklist';
import { createCheckoutSession } from './lib/stripe';
import { buyListingCredits } from './lib/listing-credits';
import { createListing, deleteListing, loadListings, type MarketplaceListing } from './lib/listings';
import { signInWithEmail, signOut, signUpWithEmail } from './lib/auth';
import { getSupabaseSession, supabase } from './lib/supabase';
import { getRuntimeConfig } from './lib/config';

const navItems = [
    { label: 'Marketplace', view: 'Listings' },
    { label: 'Sell', view: 'Sell' },
    { label: 'Fulfillment', view: 'Fulfillment' },
];

type DeckListing = MarketplaceListing;

export const MainLayout: React.FC = () => {
    const runtimeConfig = getRuntimeConfig();
    const [activeView, setActiveView] = useState('Home');
    const hasSecureBackend = runtimeConfig.supabaseEnabled;
    const isSecureCheckoutEnabled = runtimeConfig.isSecureMode;
    const productionChecklist = getProductionChecklist({
        VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
        VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
        VITE_STRIPE_PUBLISHABLE_KEY: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY,
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
    const [listingType, setListingType] = useState<DeckListing['listingType']>('sale');
    const [deckImage, setDeckImage] = useState<string>('');
    const [basket, setBasket] = useState<DeckListing[]>([]);
    const listingFee = listings.length < 3 ? 0 : 0.66;
    const listingsInCurrentBundle = listings.length % 3;
    const [isBuyingListingCredits, setIsBuyingListingCredits] = useState(false);

    // Checkout Flow States
    const [selectedItem, setSelectedItem] = useState<DeckListing | null>(null);
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
    const [accountTermsAccepted, setAccountTermsAccepted] = useState(false);
    const [accountStatus, setAccountStatus] = useState<string | null>(null);
    const [isAccountSubmitting, setIsAccountSubmitting] = useState(false);
    const [legalName, setLegalName] = useState('');
    const [sellerAddressLineOne, setSellerAddressLineOne] = useState('');
    const [sellerAddressLineTwo, setSellerAddressLineTwo] = useState('');
    const [sellerCity, setSellerCity] = useState('');
    const [sellerPostcode, setSellerPostcode] = useState('');
    const [dateOfBirth, setDateOfBirth] = useState('');
    const [sellerTermsAccepted, setSellerTermsAccepted] = useState(false);
    const [isSavingSellerProfile, setIsSavingSellerProfile] = useState(false);
    const [isStartingConnect, setIsStartingConnect] = useState(false);

    // Auth form state placeholders
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    useEffect(() => {
        if (!hasSecureBackend) return;
        loadListings()
            .then(setListings)
            .catch((error) => setFlashMessage(error instanceof Error ? error.message : 'Unable to load marketplace listings.'));
    }, [hasSecureBackend]);

    useEffect(() => {
        if (!supabase) return;
        getSupabaseSession()
            .then((session) => {
                setIsAuthenticated(Boolean(session));
                setAccountEmail(session?.user.email || '');
            })
            .catch(() => setIsAuthenticated(false));
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setIsAuthenticated(Boolean(session));
        });
        return () => subscription.unsubscribe();
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
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setDeckImage(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
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
            const newListing = await createListing({ name: deckName.trim(), price: parsedPrice, description: deckDescription.trim() || undefined, listingType, image: deckImage || undefined });
            setListings((currentListings) => [newListing, ...currentListings]);
            setDeckName('');
            setDeckPrice('');
            setDeckDescription('');
            setListingType('sale');
            setDeckImage('');
            setFlashMessage(`Published: ${newListing.name}`);
            setActiveView('Listings');
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Unable to publish your listing.');
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
            setAccountStatus('Account access is unavailable until Supabase is configured.');
            return;
        }
        setIsAccountSubmitting(true);
        try {
            if (accountMode === 'signup') {
                const result = await signUpWithEmail(accountEmail.trim(), accountPassword, accountTermsAccepted);
                if (result.session) {
                    setIsAuthenticated(true);
                    setAccountStatus('Account created. You are ready to sell.');
                } else {
                    setAccountStatus('Account created. Check your email to confirm your address, then sign in.');
                }
            } else {
                await signInWithEmail(accountEmail.trim(), accountPassword);
                setIsAuthenticated(true);
                setAccountStatus('Signed in successfully.');
            }
            setAccountPassword('');
        } catch (error) {
            setAccountStatus(error instanceof Error ? error.message : 'Unable to continue with your account.');
        } finally {
            setIsAccountSubmitting(false);
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

    const handleSaveSellerProfile = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!supabase) return;
        setIsSavingSellerProfile(true);
        setAccountStatus(null);
        try {
            const session = await getSupabaseSession();
            if (!session?.user) throw new Error('Sign in before saving seller information.');
            const { error } = await supabase.from('profiles').update({
                legal_name: legalName.trim(),
                seller_address_line_1: sellerAddressLineOne.trim(),
                seller_address_line_2: sellerAddressLineTwo.trim() || null,
                seller_city: sellerCity.trim(),
                seller_postcode: sellerPostcode.trim().toUpperCase(),
                date_of_birth: dateOfBirth,
                seller_terms_accepted_at: new Date().toISOString(),
                seller_payout_status: 'pending_connect',
            }).eq('id', session.user.id);
            if (error) throw error;
            setAccountStatus('Seller information saved. Complete Stripe Connect onboarding before receiving payouts.');
        } catch (error) {
            setAccountStatus(error instanceof Error ? error.message : 'Unable to save seller information.');
        } finally {
            setIsSavingSellerProfile(false);
        }
    };

    const handleStartConnect = async () => {
        setIsStartingConnect(true);
        setAccountStatus(null);
        try {
            const session = await getSupabaseSession();
            if (!session?.access_token) throw new Error('Sign in before setting up payouts.');
            const response = await fetch('/api/create-connect-onboarding', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            });
            const payload = await response.json();
            if (!response.ok || !payload?.url) throw new Error(payload?.error || 'Unable to start Stripe Connect onboarding.');
            window.location.assign(payload.url);
        } catch (error) {
            setAccountStatus(error instanceof Error ? error.message : 'Unable to start Stripe Connect onboarding.');
            setIsStartingConnect(false);
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

        if (!isSecureCheckoutEnabled) {
            alert('Checkout is disabled until Stripe and Supabase are configured for production.');
            return;
        }

        const dynamicDeliveryCost = deliveryMethod === 'express' ? 5.50 : deliveryMethod === 'collection' ? 0 : 2.99;
        const totalCharged = selectedItem.price + dynamicDeliveryCost;

        try {
            const response = await createCheckoutSession({
                amount: totalCharged,
                currency: 'gbp',
                itemName: selectedItem.name,
                successUrl: `${window.location.origin}/success?item=${encodeURIComponent(selectedItem.name)}`,
                cancelUrl: `${window.location.origin}/cancel`,
            });

            if (response?.url) {
                window.location.href = response.url;
                return;
            }

            alert(`Success! Securely processed £${totalCharged.toFixed(2)} via ${gateway} Gateway.`);
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Checkout could not be created.');
            return;
        }

        setSelectedItem(null);
        setCheckoutStep(null);
    };

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

                <header className="topbar">
                    <button className="brand" type="button" onClick={() => setActiveView('Home')} aria-label="Go to Arkana home">
                        <div className="brand-mark">A</div>
                        <div>
                            <strong>Arkana</strong>
                            <span>Zero-commission marketplace</span>
                        </div>
                    </button>
                    <nav className="nav-links">
                        {navItems.map((item) => (
                            <button
                                key={item.view}
                                className={`nav-btn ${activeView === item.view ? 'active' : ''}`}
                                onClick={() => setActiveView(item.view)}
                            >
                                {item.label}
                            </button>
                        ))}
                    </nav>
                    <button type="button" className="basket-btn" onClick={() => setActiveView('Checkout')}>
                        Basket <span>{basket.length}</span>
                    </button>
                    <button className="primary-btn" onClick={() => setActiveView(isAuthenticated ? 'Sell' : 'Account')}>
                        {isAuthenticated ? 'Create Listing' : 'Sign in'}
                    </button>
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
                                        <form className="seller-verification-form" onSubmit={handleSaveSellerProfile}>
                                            <div className="seller-verification-heading">
                                                <div><h3>Seller verification</h3><p>Required before seller payouts. Bank and identity checks are completed securely in Stripe Connect.</p></div>
                                                <span>Pending Stripe Connect</span>
                                            </div>
                                            <label>Legal name<input type="text" value={legalName} onChange={(event) => setLegalName(event.target.value)} autoComplete="name" required placeholder="Full legal name" /></label>
                                            <label>Address line 1<input type="text" value={sellerAddressLineOne} onChange={(event) => setSellerAddressLineOne(event.target.value)} autoComplete="address-line1" required placeholder="House number and street" /></label>
                                            <label>Address line 2 <em>Optional</em><input type="text" value={sellerAddressLineTwo} onChange={(event) => setSellerAddressLineTwo(event.target.value)} autoComplete="address-line2" placeholder="Flat, building, or area" /></label>
                                            <div className="seller-verification-grid">
                                                <label>Town or city<input type="text" value={sellerCity} onChange={(event) => setSellerCity(event.target.value)} autoComplete="address-level2" required /></label>
                                                <label>UK postcode<input type="text" value={sellerPostcode} onChange={(event) => setSellerPostcode(event.target.value)} autoComplete="postal-code" required /></label>
                                            </div>
                                            <label>Date of birth<input type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} autoComplete="bday" required /></label>
                                            <label className="seller-terms-check"><input type="checkbox" checked={sellerTermsAccepted} onChange={(event) => setSellerTermsAccepted(event.target.checked)} required /><span>I agree to the Seller Terms, payout-hold policy, and Refund Policy.</span></label>
                                            <button type="submit" className="primary-btn" disabled={isSavingSellerProfile}>{isSavingSellerProfile ? 'Saving...' : 'Save seller information'}</button>
                                            <button type="button" className="connect-payout-btn" onClick={handleStartConnect} disabled={isStartingConnect}>{isStartingConnect ? 'Opening Stripe Connect...' : 'Set up secure payouts with Stripe'}</button>
                                        </form>
                                        <BuyerOrdersPanel />
                                    </div>
                                ) : (
                                    <>
                                        <div className="account-tabs" role="tablist" aria-label="Account option">
                                            <button type="button" role="tab" aria-selected={accountMode === 'signin'} className={accountMode === 'signin' ? 'active' : ''} onClick={() => { setAccountMode('signin'); setAccountStatus(null); }}>Sign in</button>
                                            <button type="button" role="tab" aria-selected={accountMode === 'signup'} className={accountMode === 'signup' ? 'active' : ''} onClick={() => { setAccountMode('signup'); setAccountStatus(null); }}>Create account</button>
                                        </div>
                                        <form className="account-form" onSubmit={handleAccountSubmit}>
                                            <label>Email address<input type="email" value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} autoComplete="email" required placeholder="you@example.com" /></label>
                                            <label>Password<input type="password" value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} autoComplete={accountMode === 'signin' ? 'current-password' : 'new-password'} required minLength={6} placeholder="At least 6 characters" /></label>
                                            {accountMode === 'signup' && (
                                                <label className="account-terms-check">
                                                    <input type="checkbox" checked={accountTermsAccepted} onChange={(event) => setAccountTermsAccepted(event.target.checked)} required />
                                                    <span>I agree to the <button type="button" className="terms-link-btn" onClick={() => setShowTermsModal(true)}>Terms & Conditions</button>, Privacy Policy, and Refund Policy.</span>
                                                </label>
                                            )}
                                            {accountStatus && <p className="account-status" role="status">{accountStatus}</p>}
                                            <button type="submit" className="primary-btn" disabled={isAccountSubmitting}>{isAccountSubmitting ? 'Please wait...' : accountMode === 'signin' ? 'Sign in' : 'Create account'}</button>
                                        </form>
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
                                <div className="listing-summary-badge">{listings.length} live decks</div>
                            </div>
                            {listings.length === 0 ? (
                                <div className="items-placeholder-grid empty-state-card">
                                    <p className="empty-message">No decks listed yet.</p>
                                    <button className="primary-btn" onClick={() => setActiveView('Sell')}>
                                        Add your first deck
                                    </button>
                                </div>
                            ) : (
                                <div className="listings-live-grid">
                                    {listings.map((item) => (
                                        <div key={item.id} className="live-product-card">
                                            <div className="product-image-box">
                                                {item.image ? (
                                                    <img src={item.image} alt={item.name} className="live-uploaded-img" />
                                                ) : (
                                                    <span className="default-card-emoji">🎴</span>
                                                )}
                                            </div>
                                            <div className="product-details">
                                                <h4>{item.name}</h4>
                                                <span className={`listing-type-badge listing-type-badge--${item.listingType}`}>{item.listingType === 'sale' ? `For sale - £${item.price.toFixed(2)}` : item.listingType === 'swap' ? 'Open to swap' : 'Free to a good home'}</span>
                                                {item.description && <p className="listing-description">{item.description}</p>}
                                                <div className="product-footer">
                                                    <button
                                                        className="buy-btn"
                                                        onClick={() => item.listingType === 'sale' ? handleAddToBasket(item) : setFlashMessage(item.listingType === 'swap' ? `Contact the seller to arrange a swap for ${item.name}.` : `Contact the seller to arrange collection for ${item.name}.`)}
                                                    >
                                                        {item.listingType === 'sale' ? (basket.some((basketItem) => basketItem.id === item.id) ? 'In basket' : 'Add to basket') : item.listingType === 'swap' ? 'Arrange swap' : 'Request deck'}
                                                    </button>
                                                    <button
                                                        className="delete-btn"
                                                        onClick={() => handleDelete(item.id)}
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
                                        <button type="button" className={listingType === 'swap' ? 'active' : ''} onClick={() => setListingType('swap')}>Swap</button>
                                        <button type="button" className={listingType === 'free' ? 'active' : ''} onClick={() => setListingType('free')}>Free</button>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Deck Name</label>
                                    <input
                                        type="text"
                                        value={deckName}
                                        onChange={(e) => setDeckName(e.target.value)}
                                        placeholder="e.g., Rider-Waite Tarot"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Price (£){listingType !== 'sale' && ' - not needed'}</label>
                                    <input
                                        type="number"
                                        value={deckPrice}
                                        onChange={(e) => setDeckPrice(e.target.value)}
                                        placeholder="0.00"
                                        step="0.01"
                                        disabled={listingType !== 'sale'}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Description</label>
                                    <textarea value={deckDescription} onChange={(e) => setDeckDescription(e.target.value)} placeholder="Condition, edition, missing cards, or what you would swap for." rows={4} />
                                </div>
                                <div className="form-group">
                                    <label>Deck Cover Image</label>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleImageChange}
                                    />
                                    {deckImage && <div className="image-status">Image selected and ready to publish</div>}
                                </div>
                                <button type="submit" className="primary-btn">{listingFee === 0 ? 'Publish Free Listing' : 'Buy credits to publish'}</button>
                            </form>
                        </section>
                    )}

                    {/* 5. CHECKOUT VIEW */}
                    {activeView === 'Checkout' && (
                        <CheckoutViewIntegrated basket={basket} onRemoveFromBasket={(listingId) => setBasket((currentBasket) => currentBasket.filter((item) => item.id !== listingId))} />
                    )}

                    {/* 6. FULFILLMENT/SELLER DASHBOARD VIEW */}
                    {activeView === 'Fulfillment' && (
                        <SellerDashboardIntegrated />
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
                                            <label>Email Address</label>
                                            <input type="text" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
                                        </div>
                                        <div className="form-group">
                                            <label>Password</label>
                                            <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
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
                                            I agree to the <button type="button" className="terms-link-btn" onClick={() => setShowTermsModal(true)}>Terms & Conditions</button>
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
            </div>
        </div>
    );
};

// ========================================================
// 5. INTEGRATED CHECKOUT VIEW COMPONENT
// ========================================================
const CheckoutViewIntegrated: React.FC<{ basket: DeckListing[]; onRemoveFromBasket: (listingId: string) => void }> = ({ basket, onRemoveFromBasket }) => {
    const [shipping, setShipping] = React.useState<number>(2.99);
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

    // Validate UK Postcode format
    const handlePostcodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.toUpperCase();
        setPostcode(val);
        const ukPostcodeRegex = /^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$/;
        setIsPostcodeValid(val === '' || ukPostcodeRegex.test(val));
    };

    const deckTotal = basket.reduce((sum, item) => sum + item.price, 0);
    const totalCost = deckTotal + shipping;
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
            const response = await createCheckoutSession({
                amount: totalCost,
                currency: 'gbp',
                itemName: `Arkana order for ${fullName.trim()}`,
                successUrl: `${window.location.origin}/success`,
                cancelUrl: `${window.location.origin}/cancel`,
            });
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
                <p className="checkout-page-kicker">Guest checkout</p>
                <h2>Delivery and payment</h2>
                <p>Enter your details, choose a courier, then pay securely through Stripe.</p>
            </div>

            <div className="checkout-page-grid">
                <form onSubmit={handleCheckoutSubmit} className="checkout-details-panel">
                    <div className="checkout-section-heading">
                        <span>1</span>
                        <div><h3>Delivery details</h3><p>Used only for dispatch and order updates.</p></div>
                    </div>
                    <div className="checkout-field-grid">
                        <label className="checkout-field checkout-field-wide">Full name
                            <input type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" required placeholder="Your full name" />
                        </label>
                        <label className="checkout-field checkout-field-wide">Email address
                            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required placeholder="you@example.com" />
                        </label>
                        <label className="checkout-field checkout-field-wide">Address line 1
                            <input type="text" value={addressLineOne} onChange={(event) => setAddressLineOne(event.target.value)} autoComplete="address-line1" required placeholder="House number and street" />
                        </label>
                        <label className="checkout-field checkout-field-wide">Address line 2 <span className="checkout-field-optional">Optional</span>
                            <input type="text" value={addressLineTwo} onChange={(event) => setAddressLineTwo(event.target.value)} autoComplete="address-line2" placeholder="Flat, building, or area" />
                        </label>
                        <label className="checkout-field">Town or city
                            <input type="text" value={townOrCity} onChange={(event) => setTownOrCity(event.target.value)} autoComplete="address-level2" required placeholder="London" />
                        </label>
                        <label className="checkout-field">Country
                            <input type="text" value="United Kingdom" disabled />
                        </label>
                        <label className="checkout-field">UK postcode
                            <input type="text" value={postcode} onChange={handlePostcodeChange} autoComplete="postal-code" required placeholder="SW1A 1AA" aria-invalid={!isPostcodeValid} />
                            {!isPostcodeValid && <span className="checkout-validation">Enter a valid UK postcode.</span>}
                        </label>
                    </div>
                    <div className="checkout-section-heading checkout-section-heading--courier">
                        <span>2</span>
                        <div><h3>Delivery service</h3><p>Select the tracking speed that suits you.</p></div>
                    </div>
                    <label className="checkout-field">Courier
                        <select value={shipping} onChange={(event) => setShipping(parseFloat(event.target.value))}>
                            <option value={2.99}>Evri Standard Drop-off - £2.99</option>
                            <option value={3.65}>Royal Mail Tracked 48 - £3.65</option>
                            <option value={4.65}>Royal Mail Tracked 24 - £4.65</option>
                        </select>
                    </label>
                    <label className="checkout-terms">
                        <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
                        <span>I agree to the marketplace Terms & Conditions and Refund Policy.</span>
                    </label>
                    {checkoutError && <p className="checkout-error" role="alert">{checkoutError}</p>}
                    <button type="submit" className="checkout-pay-btn" disabled={isSubmitting || !basket.length}>
                        {isSubmitting ? 'Opening secure payment...' : `Pay securely - £${totalCost.toFixed(2)}`}
                    </button>
                    <p className="checkout-security-note">Payments are securely processed by Stripe. Card details are never stored by Arkana.</p>
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
                        <div><span>Items</span><strong>£{deckTotal.toFixed(2)}</strong></div>
                        <div><span>Shipping</span><strong>£{shipping.toFixed(2)}</strong></div>
                        <div className="checkout-grand-total"><span>Total</span><strong>£{totalCost.toFixed(2)}</strong></div>
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
            </div>
        </section>
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
                                {['dispatched', 'delivered'].includes(order.status) && <><button type="button" onClick={() => submitOrderAction('/api/confirm-order-received', order.id)}>Received as described</button><button type="button" className="buyer-report-btn" onClick={() => handleReportProblem(order.id)}>Report a problem</button></>}
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </section>
    );
};

// ========================================================
// 6. INTEGRATED SELLER DASHBOARD COMPONENT
// ========================================================
const ProductionChecklistView: React.FC<{ checklist: ReturnType<typeof getProductionChecklist> }> = ({ checklist }) => {
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
                    <strong>Secure app state</strong>
                    <span>UI builds successfully and is ready for hardening.</span>
                </div>
                <div className="status-card status-card--warn">
                    <strong>Live transactions</strong>
                    <span>Server-side payment and database auth still required before launch.</span>
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
                    <label className="tracking-label">Tracking reference</label>
                    <div className="tracking-row">
                        <input type="text" value={trackingReference} onChange={(event) => setTrackingReference(event.target.value)} placeholder="e.g. 123456789012345" />
                        <button type="button" onClick={handleSaveTracking} disabled={!trackingReference.trim()}>Mark dispatched</button>
                    </div>
                    {isDispatched && <p className="dispatch-confirmation" role="status">Dispatched. Buyer tracking: {savedTrackingReference}</p>}
                </div>
            </div>
        </div>
    );
};
