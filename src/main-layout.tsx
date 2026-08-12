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
        const updatedListings = listings.filter(item => item.id !== idToDelete);
        setListings(updatedListings);
    };

    const handleBuyItem = (item: DeckListing) => {
        setTotalRevenue(prevRevenue => prevRevenue + item.price);
        setListings(listings.filter(listing => listing.id !== item.id));
        alert(`Successfully purchased ${item.name}!`);
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

                    {activeView === 'Dashboard' && (
                        <section className="dashboard-section">
                            <h2>Your Dashboard</h2>
                            <p>Track your sales, purchases, and active store analytics.</p>
                            <div className="stats-placeholder-grid">
                                <div className="stat-card">
                                    <h3>{listings.length}</h3>
                                    <p>Active Listings</p>
                                </div>
                                <div className="stat-card">
                                    <h3>£{totalRevenue.toFixed(2)}</h3>
                                    <p>Total Revenue</p>
                                </div>
                            </div>
                        </section>
                    )}

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
                                                        onClick={() => handleBuyItem(item)}
                                                    >
                                                        💳 Buy Now
                                                    </button>

                                                    <button
                                                        className="delete-btn"
                                                        onClick={() => handleDelete(item.id)}
                                                        title="Delete listing"
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

                    {activeView === 'Sell' && (
                        <section className="sell-section">
                            <h2>Create a New Listing</h2>
                            <p>List your deck with zero marketplace commissions.</p>
                            <form className="listing-placeholder-form" onSubmit={handlePublish}>
                                <input
                                    type="text"
                                    placeholder="Deck Name (e.g., Rider-Waite Tarot)"
                                    className="form-input"
                                    value={deckName}
                                    onChange={(e) => setDeckName(e.target.value)}
                                />
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="Price (£)"
                                    className="form-input"
                                    value={deckPrice}
                                    onChange={(e) => setDeckPrice(e.target.value)}
                                />

                                <div className="image-upload-wrapper">
                                    <label className="upload-label">Deck Preview Image (Optional)</label>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="file-input-field"
                                        onChange={handleImageChange}
                                    />
                                    {deckImage && (
                                        <div className="upload-preview-container">
                                            <p>Image preview locked:</p>
                                            <img src={deckImage} alt="Upload Preview" className="form-preview-thumb" />
                                        </div>
                                    )}
                                </div>

                                <button type="submit" className="primary-btn">Publish Item</button>
                            </form>
                        </section>
                    )}
                </main>
            </div>
        </div>
    );
};
