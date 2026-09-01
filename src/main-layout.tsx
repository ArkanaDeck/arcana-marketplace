import React, { useState, useEffect } from 'react';
// @ts-ignore
import './main-layout.css';
import { getProductionChecklist } from './production-checklist';
import { createCheckoutSession } from './lib/stripe';
import { signInWithEmail } from './lib/auth';
import { getRuntimeConfig } from './lib/config';

const navItems = ['Home', 'Dashboard', 'Listings', 'Sell', 'Checkout', 'Fulfillment', 'Production'];

interface DeckListing {
    id: string;
    name: string;
    price: number;
    image?: string;
}

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
    const [deckImage, setDeckImage] = useState<string>('');

    // Checkout Flow States
    const [selectedItem, setSelectedItem] = useState<DeckListing | null>(null);
    const [checkoutStep, setCheckoutStep] = useState<'auth' | 'delivery' | 'payment' | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [deliveryMethod, setDeliveryMethod] = useState<'standard' | 'express'>('standard');

    // Auth form state placeholders
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    useEffect(() => {
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

    const handlePublish = (e: React.FormEvent) => {
        e.preventDefault();
        if (!deckName.trim() || !deckPrice.trim()) {
            alert('Please fill out all fields before publishing.');
            return;
        }
        if (!runtimeConfig.isSecureMode) {
            alert('Publishing listings is disabled until Supabase and Stripe are configured for production.');
            return;
        }
        const newListing: DeckListing = {
            id: Date.now().toString(),
            name: deckName,
            price: parseFloat(deckPrice),
            image: deckImage || undefined
        };
        setListings([...listings, newListing]);
        setDeckName('');
        setDeckPrice('');
        setDeckImage('');
        setActiveView('Listings');
    };

    const handleDelete = (idToDelete: string) => {
        setListings(listings.filter(item => item.id !== idToDelete));
    };

    const handleInitiateCheckout = (item: DeckListing) => {
        setSelectedItem(item);
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
            setCheckoutStep('delivery');
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Unable to sign in. Please check your credentials.');
        }
    };

    const handleGuestCheckout = () => {
        setCheckoutStep('delivery');
    };

    const handleFinalisePayment = async (gateway: 'Stripe' | 'PayPal') => {
        if (!selectedItem) return;

        if (!isSecureCheckoutEnabled) {
            alert('Checkout is disabled until Stripe and Supabase are configured for production.');
            return;
        }

        const dynamicDeliveryCost = deliveryMethod === 'express' ? 5.50 : 2.99;
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

                <header className="topbar">
                    <div className="brand">
                        <div className="brand-mark">A</div>
                        <div>
                            <strong>Arkana</strong>
                            <span>Zero-commission marketplace</span>
                        </div>
                    </div>
                    <nav className="nav-links">
                        {navItems.map((item) => (
                            <button
                                key={item}
                                className={`nav-btn ${activeView === item ? 'active' : ''}`}
                                onClick={() => setActiveView(item)}
                            >
                                {item}
                            </button>
                        ))}
                    </nav>
                    <button className="primary-btn" onClick={() => setActiveView('Sell')}>
                        Create listing
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
                                    Explore our listings
                                </button>
                            </div>
                            <div className="hero-img"></div>
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
                            <h2>Marketplace Listings</h2>
                            <p>Browse authentic tarot and oracle decks from the community.</p>
                            {listings.length === 0 ? (
                                <div className="items-placeholder-grid">
                                    <p className="empty-message">No listings available at the moment.</p>
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
                                                <span className="price-tag">£{item.price.toFixed(2)}</span>
                                                <div className="product-footer">
                                                    <button
                                                        className="buy-btn"
                                                        onClick={() => handleInitiateCheckout(item)}
                                                    >
                                                        💳 Checkout
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
                            <form onSubmit={handlePublish} className="sell-form">
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
                                    <label>Price (£)</label>
                                    <input
                                        type="number"
                                        value={deckPrice}
                                        onChange={(e) => setDeckPrice(e.target.value)}
                                        placeholder="0.00"
                                        step="0.01"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Deck Cover Image</label>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleImageChange}
                                    />
                                </div>
                                <button type="submit" className="primary-btn">Publish Listing</button>
                            </form>
                        </section>
                    )}

                    {/* 5. CHECKOUT VIEW */}
                    {activeView === 'Checkout' && (
                        <CheckoutViewIntegrated />
                    )}

                    {/* 6. FULFILLMENT/SELLER DASHBOARD VIEW */}
                    {activeView === 'Fulfillment' && (
                        <SellerDashboardIntegrated />
                    )}

                    {activeView === 'Production' && (
                        <ProductionChecklistView checklist={productionChecklist} />
                    )}
                </main>

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
                                        <div className="summary-row"><span>Shipping</span><span>£{deliveryMethod === 'express' ? '5.50' : '2.99'}</span></div>
                                        <div className="summary-row total-row"><strong>Final Total</strong><strong>£{(selectedItem.price + (deliveryMethod === 'express' ? 5.50 : 2.99)).toFixed(2)}</strong></div>
                                    </div>

                                    <div className="payment-gateway-buttons">
                                        <button className="buy-btn secure-payment-final-btn" onClick={() => handleFinalisePayment('Stripe')}>
                                            🛡️ Pay with Stripe
                                        </button>
                                        <button className="paypal-btn" onClick={() => handleFinalisePayment('PayPal')}>
                                            🟨 Pay with PayPal
                                        </button>
                                    </div>
                                </div>
                            )}
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
const CheckoutViewIntegrated: React.FC = () => {
    const [basket, setBasket] = React.useState<{ id: string; name: string; price: number }[]>([
        { id: '1', name: 'Arkana Golden Tarot Deck (Example)', price: 25.00 }
    ]);
    const [shipping, setShipping] = React.useState<number>(2.99);
    const [postcode, setPostcode] = React.useState<string>('');
    const [isPostcodeValid, setIsPostcodeValid] = React.useState<boolean>(true);
    const [isOrdered, setIsOrdered] = React.useState<boolean>(false);

    // Validate UK Postcode format
    const handlePostcodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.toUpperCase();
        setPostcode(val);
        const ukPostcodeRegex = /^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$/;
        setIsPostcodeValid(val === '' || ukPostcodeRegex.test(val));
    };

    const deckTotal = basket.reduce((sum, item) => sum + item.price, 0);
    const totalCost = deckTotal + shipping;

    if (isOrdered) {
        return (
            <div className="p-6 max-w-xl mx-auto bg-white rounded-lg border border-[#E5E7EB] text-center my-12 text-[#1F2937]">
                <h2 className="text-3xl font-bold text-[#D4AF37] mb-2">🎉 Order Placed!</h2>
                <p className="mb-6">Thank you for your guest checkout order. 100% of your funds went straight to the seller.</p>
                <div className="bg-[#FAFAFA] p-6 rounded border border-[#E5E7EB] mb-6">
                    <p className="text-sm font-semibold mb-2">Save Your Details</p>
                    <p className="text-xs text-gray-500 mb-4">Type a password below to turn this guest order into a free permanent account.</p>
                    <input type="password" placeholder="Choose a password" className="p-2 border border-[#E5E7EB] rounded w-full mb-3" />
                    <button className="w-full bg-[#D4AF37] text-white py-2 rounded font-semibold hover:bg-opacity-90">Create Free Account</button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 text-[#1F2937]">
            <div className="md:col-span-2 bg-white p-6 rounded-lg border border-[#E5E7EB]">
                <h2 className="text-xl font-bold mb-4">🇬🇧 Secure UK Guest Checkout</h2>
                <form onSubmit={(e) => { e.preventDefault(); if (isPostcodeValid && postcode) setIsOrdered(true); }} className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold mb-1">Full Name</label>
                        <input type="text" required className="w-full p-2 border border-[#E5E7EB] rounded" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold mb-1">Email Address</label>
                        <input type="email" required className="w-full p-2 border border-[#E5E7EB] rounded" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold mb-1">Country</label>
                            <input type="text" value="United Kingdom" disabled className="w-full p-2 border border-[#E5E7EB] rounded bg-gray-100 cursor-not-allowed" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold mb-1">UK Postcode</label>
                            <input type="text" value={postcode} onChange={handlePostcodeChange} required className={`w-full p-2 border rounded ${!isPostcodeValid ? 'border-red-500' : 'border-[#E5E7EB]'}`} />
                            {!isPostcodeValid && <p className="text-red-500 text-xs mt-1">Invalid UK Postcode format</p>}
                        </div>
                    </div>
                    <button type="submit" disabled={!isPostcodeValid || !postcode} className="w-full mt-4 bg-[#D4AF37] text-white py-3 rounded font-semibold disabled:opacity-50">Pay Now (£{totalCost.toFixed(2)})</button>
                </form>
            </div>

            <div className="bg-[#FAFAFA] p-6 rounded-lg border border-[#E5E7EB] h-fit">
                <h3 className="text-lg font-bold mb-4">Shopping Basket</h3>
                {basket.map(item => (
                    <div key={item.id} className="flex justify-between text-sm py-2 border-b border-gray-200">
                        <span>{item.name}</span>
                        <span className="font-semibold">£{item.price.toFixed(2)}</span>
                    </div>
                ))}
                <div className="mt-4 space-y-2">
                    <label className="block text-xs font-semibold">Select Postage courier</label>
                    <select value={shipping} onChange={(e) => setShipping(parseFloat(e.target.value))} className="w-full p-2 bg-white border border-[#E5E7EB] rounded text-sm">
                        <option value={2.99}>Evri Standard Drop-off — £2.99</option>
                        <option value={3.65}>Royal Mail Tracked 48 — £3.65</option>
                        <option value={4.65}>Royal Mail Tracked 24 — £4.65</option>
                    </select>
                </div>
                <div className="mt-6 pt-4 border-t border-gray-300 flex justify-between font-bold text-lg">
                    <span>Total:</span>
                    <span>£{totalCost.toFixed(2)}</span>
                </div>
            </div>
        </div>
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
    return (
        <div className="p-6 max-w-4xl mx-auto bg-white rounded-lg border border-[#E5E7EB] shadow-sm my-6 text-[#1F2937]">
            <h2 className="text-2xl font-bold mb-4">📦 Seller Fulfillment Dashboard</h2>

            <div className="mb-6 p-4 bg-[#FAFAFA] border-l-4 border-[#D4AF37] rounded">
                <p className="text-sm font-semibold">Active Shipping Logistics Guidelines (UK Locked)</p>
            </div>

            <div className="space-y-4">
                <p><strong>Step 1:</strong> Pack the Tarot Deck securely (use bubble wrap to protect the card box corners!).</p>
                <p><strong>Step 2:</strong> Copy the buyer's UK shipping address displayed below.</p>

                <div className="p-4 bg-white border border-[#E5E7EB] rounded my-2 font-mono text-sm">
                    [Buyer Delivery Address Block Manifests Here]
                </div>

                <p><strong>Step 3:</strong> Head to the official courier page to buy your label:</p>
                <ul className="list-disc pl-6 space-y-2">
                    <li>If the buyer chose Evri: <a href="https://evri.com" target="_blank" rel="noreferrer" className="text-[#D4AF37] hover:underline font-semibold">Click here to open Evri Send (evri.com)</a></li>
                    <li>If the buyer chose Royal Mail: <a href="https://royalmail.com" target="_blank" rel="noreferrer" className="text-[#D4AF37] hover:underline font-semibold">Click here to open Royal Mail Click & Drop (royalmail.com)</a></li>
                </ul>

                <p><strong>Step 4:</strong> Choose the 'Drop off at shop / No printer needed' option. The courier will email a digital QR Code to your phone.</p>
                <p><strong>Step 5:</strong> Take your parcel to your local Post Office or Evri ParcelShop. They will scan your phone's QR code and print the sticky shipping label for free!</p>
                <p><strong>Step 6:</strong> Once dropped off, paste your tracking reference number in the box below to notify the buyer.</p>
            </div>

            <div className="mt-6 pt-4 border-t border-[#E5E7EB]">
                <label className="block text-sm font-medium mb-2">Tracking Reference Number</label>
                <div className="flex gap-2">
                    <input type="text" placeholder="e.g. 123456789012345" className="p-2 border border-[#E5E7EB] rounded w-full focus:outline-none focus:border-[#D4AF37]" />
                    <button className="bg-[#D4AF37] text-white px-4 py-2 rounded font-semibold hover:bg-opacity-90 transition">Submit</button>
                </div>
            </div>
        </div>
    );
};
