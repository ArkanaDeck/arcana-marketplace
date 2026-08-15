import React, { useState, useEffect } from 'react';
// @ts-ignore
import './main-layout.css';

const navItems = ['Home', 'Dashboard', 'Listings', 'Sell'];

interface DeckListing {
    id: string;
    name: string;
    price: number;
    image?: string;
}

export const MainLayout: React.FC = () => {
    const [activeView, setActiveView] = useState('Home');

    // Marketplace core states
    const [listings, setListings] = useState<DeckListing[]>(() => {
        const savedListings = localStorage.getItem('arkana_listings');
        return savedListings ? JSON.parse(savedListings) : [];
    });

    const [totalRevenue, setTotalRevenue] = useState<number>(() => {
        const savedRevenue = localStorage.getItem('arkana_revenue');
        return savedRevenue ? parseFloat(savedRevenue) : 0;
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
        localStorage.setItem('arkana_listings', JSON.stringify(listings));
    }, [listings]);

    useEffect(() => {
        localStorage.setItem('arkana_revenue', totalRevenue.toString());
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

    const handleLoginSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim() || !password.trim()) {
            alert('Please enter your details to sign in.');
            return;
        }
        setIsAuthenticated(true);
        setCheckoutStep('delivery');
    };

    const handleGuestCheckout = () => {
        setCheckoutStep('delivery');
    };

    const handleFinalisePayment = (gateway: 'Stripe' | 'PayPal') => {
        if (!selectedItem) return;

        const dynamicDeliveryCost = deliveryMethod === 'express' ? 5.50 : 2.99;
        const totalCharged = selectedItem.price + dynamicDeliveryCost;

        setTotalRevenue(prevRevenue => prevRevenue + totalCharged);
        setListings(listings.filter(listing => listing.id !== selectedItem.id));

        alert(`Success! Securely processed £${totalCharged.toFixed(2)} via ${gateway} Gateway.`);

        setSelectedItem(null);
        setCheckoutStep(null);
    };

    return (
        <div className="container">
            <div className="frame">
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
