
import { useState } from 'react';
import { BrowserRouter, Routes, Route, Link, NavLink } from 'react-router-dom';

// 📋 TypeScript blueprint interface definition for our marketplace items
interface DeckItem {
    id: number;
    title: string;
    description: string;
    price: string;
    condition: string;
    location: string;
    sellerEmail: string;
    imagePreview: string;
}

export default function App() {
    // 📊 Global state loop managing shared listings array memory context
    const [listings, setListings] = useState<DeckItem[]>([
        {
            id: 1,
            title: "The Celestial Arcana",
            description: "First edition gilded gold edges. Out of print collectible.",
            price: "£75",
            condition: "Mint",
            location: "London, UK",
            sellerEmail: "seller1@arkana.com",
            imagePreview: "🔮"
        },
        {
            id: 2,
            title: "Mystic Woodland Oracle",
            description: "Hand-illustrated indie deck featuring raw matte cardstock finishes.",
            price: "£32",
            condition: "Like New",
            location: "Manchester, UK",
            sellerEmail: "seller2@arkana.com",
            imagePreview: "🌿"
        }
    ]);

    // 📝 Form submission text string data buffers
    const [newTitle, setNewTitle] = useState('');
    const [newPrice, setNewPrice] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [newLoc, setNewLoc] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [newCondition, setNewCondition] = useState('Mint');

    const handleCreateListing = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle || !newPrice || !newEmail) return alert("Please fill in required fields.");

        const item: DeckItem = {
            id: Date.now(),
            title: newTitle,
            description: newDesc,
            price: `£${newPrice.replace('£', '')}`,
            condition: newCondition,
            location: newLoc || "Remote",
            sellerEmail: newEmail,
            imagePreview: "🃏"
        };

        setListings([item, ...listings]);

        // Clear individual form input rows text memory hooks
        setNewTitle('');
        setNewPrice('');
        setNewDesc('');
        setNewLoc('');
        setNewEmail('');

        alert("Listing published successfully! Click 'Listings' tab to view your item.");
    };

    // 🔮 1. Upgraded Home Entry Portal Component Layout with Multi-Tab Auth
    const Home = () => {
        const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
        const [email, setEmail] = useState('');
        const [password, setPassword] = useState('');
        const [fullName, setFullName] = useState('');

        const handleAuthSubmit = (e: React.FormEvent) => {
            e.preventDefault();
            if (!email || !password) return alert("Please enter your credentials.");

            if (authMode === 'signup') {
                alert(`Welcome to Arkana, ${fullName || 'Collector'}! Your account has been initialized.`);
            } else {
                alert(`Welcome back! Session successfully authenticated.`);
            }
        };

        return (
            <div className="auth-container">
                <div className="auth-tabs">
                    <button
                        className={`auth-tab-btn ${authMode === 'signin' ? 'active' : ''}`}
                        onClick={() => setAuthMode('signin')}
                    >
                        Sign In
                    </button>
                    <button
                        className={`auth-tab-btn ${authMode === 'signup' ? 'active' : ''}`}
                        onClick={() => setAuthMode('signup')}
                    >
                        Create Account
                    </button>
                </div>

                <h2 style={{ color: '#114E60', marginTop: 0, marginBottom: '20px', fontWeight: 800 }}>
                    {authMode === 'signin' ? 'Log In to Arkana' : 'Join the Marketplace'}
                </h2>

                <form onSubmit={handleAuthSubmit}>
                    {authMode === 'signup' && (
                        <div className="form-group">
                            <label>Full Name</label>
                            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="e.g. Alex Crowley" />

                        </div>
                    )}

                    <div className="form-group">
                        <label>Email Address</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@domain.com" required />
                    </div>

                    <div className="form-group">
                        <label>Password</label>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
                    </div>

                    <button type="submit" className="stripe-btn" style={{ width: '100%', marginTop: '10px' }}>
                        {authMode === 'signin' ? 'Sign In Securely' : 'Register Account'}
                    </button>
                </form>

                <div className="auth-divider">OR</div>
                <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '16px' }}>
                    In a rush to secure a rare deck? Skip the queue safely.
                </p>

                <Link to="/listings" style={{ textDecoration: 'none' }}>
                    <button className="guest-btn">Continue as Guest Checkout 🚀</button>
                </Link>
            </div>
        );
    };

    // 📊 2. Upgraded Dynamic Dashboard View Component Layout
    const Dashboard = () => {
        const userDecks = listings.filter(deck => deck.id !== 1 && deck.id !== 2);
        const hasListings = userDecks.length > 0;

        const totalValue = userDecks.reduce((sum, deck) => {
            const priceNum = parseFloat(deck.price.replace(/[^0-9.]/g, '')) || 0;
            return sum + priceNum;
        }, 0);

        return (
            <div className="brand-overlay-card" style={{ maxWidth: '600px', width: '100%' }}>
                <h1 style={{ color: '#114E60', marginTop: 0, marginBottom: '8px', fontWeight: 800 }}>
                    Your Collector Dashboard
                </h1>
                <p style={{ color: '#325288', margin: '0 0 24px 0', fontSize: '0.95rem' }}>
                    Manage your inventory, tracking metrics, and marketplace revenue.
                </p>

                {!hasListings ? (
                    <div style={{ background: '#F4EEE8', padding: '32px 20px', borderRadius: '16px', border: '2px dashed #F5CEBE', marginTop: '16px' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '12px' }}>📦</div>
                        <h3 style={{ color: '#114E60', margin: '0 0 8px 0' }}>No Active Listings Yet</h3>
                        <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0 0 20px 0' }}>
                            Your store inventory is empty. List your first tarot or oracle deck to start tracking your shop metrics here!
                        </p>
                        <Link to="/sell" className="stripe-btn" style={{ textDecoration: 'none', display: 'inline-block', marginTop: 0 }}>
                            Create Your First Listing
                        </Link>
                    </div>
                ) : (
                    <div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                            <div style={{ background: '#F4EEE8', padding: '16px', borderRadius: '12px', border: '1px solid #F5CEBE' }}>
                                <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>ACTIVE DECK LISTINGS</span>
                                <h2 style={{ color: '#114E60', margin: '4px 0 0 0', fontSize: '2rem', fontWeight: 800 }}>{userDecks.length}</h2>
                            </div>
                            <div style={{ background: '#F4EEE8', padding: '16px', borderRadius: '12px', border: '1px solid #F5CEBE' }}>
                                <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>TOTAL SHOP VALUE</span>
                                <h2 style={{ color: '#114E60', margin: '4px 0 0 0', fontSize: '2rem', fontWeight: 800 }}>£{totalValue.toFixed(2)}</h2>
                            </div>
                        </div>

                        <h3 style={{ color: '#114E60', textAlign: 'left', marginBottom: '12px', fontSize: '1.1rem' }}>Your Live Shop Inventory</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {userDecks.map((deck) => (
                                <div key={deck.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#fafafa', borderRadius: '8px', border: '1px solid #F4EEE8' }}>
                                    <div style={{ textAlign: 'left' }}>
                                        <div style={{ color: '#114E60', fontWeight: 700 }}>{deck.title}</div>
                                        <div style={{ color: '#64748b', fontSize: '0.8rem' }}>📍 {deck.location} • <span style={{ color: '#114E60', fontWeight: 600 }}>{deck.condition}</span></div>
                                    </div>
                                    <span style={{ color: '#325288', fontWeight: 800, fontSize: '1.1rem' }}>{deck.price}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // 🃏 3. Interactive Listings Catalog Grid View Component Layout
    const ListingsView = () => (
        <div className="listings-container">
            <h1 style={{ color: '#114E60', textAlign: 'center', marginBottom: '32px', fontWeight: 800 }}>
                Current Marketplace Catalog
            </h1>
            <div className="deck-grid">
                {listings.map((deck) => (
                    <div key={deck.id} className="deck-card">
                        <div className="deck-image-frame" style={{ display: 'flex', gap: '6px', overflowX: 'auto', padding: '4px', background: '#f8fafc', borderRadius: '6px' }}>
                            {Array.isArray(deck.imagePreview) && deck.imagePreview.length > 0 ? (
                                deck.imagePreview.map((imgUrl: string, idx: number) => (
                                    <img
                                        key={idx}
                                        src={imgUrl.startsWith('data:') ? imgUrl : undefined}
                                        alt={`Deck View ${idx + 1}`}
                                        style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }}
                                    />
                                ))
                            ) : (
                                <div style={{ fontSize: '2.5rem', margin: 'auto' }}>{deck.imagePreview || '🃏'}</div>
                            )}
                        </div>

                        <div className="deck-details">
                            <h3>{deck.title}</h3>
                            <div className="deck-sub-meta">
                                <span>📍 {deck.location}</span>
                                <span className="condition-badge">{deck.condition}</span>
                            </div>
                            <p>{deck.description}</p>
                            <div className="deck-meta-row">
                                <span className="deck-price">{deck.price}</span>
                                <a href={`mailto:${deck.sellerEmail}?subject=Inquiry about ${encodeURIComponent(deck.title)}`} className="contact-seller-btn" style={{ textDecoration: 'none' }}>
                                    Contact Seller
                                </a>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    // 💰 4. Upgraded Form Submission View with 4 Payment Channels
    const SellView = () => {
        const [newImage, setNewImage] = useState<string[]>([]);


        const [payMethod, setPayMethod] = useState<'stripe' | 'paypal' | 'cash' | 'qrcode'>('stripe');
        const currentCount = listings.length;
        const isFreeTier = currentCount < 3;

        const handleSubmitWithPayment = (e: React.FormEvent) => {
            e.preventDefault(); handleCreateListing(e);

            if (!isFreeTier) {
                let displayMessage = "";
                if (payMethod === 'stripe') displayMessage = "Redirecting to Stripe Secure Checkout to process your £0.66 fee...";
                if (payMethod === 'paypal') displayMessage = "Redirecting to PayPal Instant Transfer to process your £0.66 fee...";
                if (payMethod === 'cash') displayMessage = "Listing processed! Bring cash to the mutual collection exchange rendezvous.";
                if (payMethod === 'qrcode') displayMessage = "Listing authorized! Generate your custom digital delivery tracking QR Code.";
                alert(displayMessage);
            }
            handleCreateListing(e);
        };

        return (
            <div className="sell-form-card">
                <h2 style={{ color: '#114E60', marginTop: 0, marginBottom: '6px' }}>Create New Listing</h2>
                <div className="tier-banner">
                    Inventory Level: {currentCount} Decks Listed. <br />
                    {isFreeTier ? (
                        <span style={{ color: '#2e7d32' }}>✅ You have {3 - currentCount} Free Listing spaces remaining!</span>
                    ) : (
                        <span style={{ color: '#c62828' }}>⚠️ Free Tier Limit Met. Fee to publish next item: £0.66</span>
                    )}
                </div>

                <form onSubmit={handleSubmitWithPayment}>
                    <div className="form-group">
                        <label>Deck Title *</label>
                        <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Vintage Thoth Tarot" required />
                        <SafeMultiImageUploader images={newImage} setImages={setNewImage} />

                    </div>
                    <div className="form-group">
                        <label>Price (£) *</label>
                        <input type="number" value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="45" required />
                    </div>
                    <div className="form-group">
                        <label>Your Email (For Buyer Contact) *</label>
                        <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="yourname@domain.com" required />
                    </div>
                    <div className="form-group">
                        <label>Location / Collection Address / Shipp.÷ing Rules</label>
                        <input type="text" value={newLoc} onChange={e => setNewLoc(e.target.value)} placeholder="e.g. Royal Mail Tracked / London, UK" />
                    </div>
                    <div className="form-group">
                        <label>Condition</label>
                        <select value={newCondition} onChange={e => setNewCondition(e.target.value)}>
                            <option value="Mint">Mint</option>
                            <option value="Like New">Like New</option>
                            <option value="Good">Good</option>
                            <option value="Fair">Fair</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Description (Specify Delivery options, packaging details, etc.)</label>
                        <textarea rows={3} value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Provide information about card quality, completeness..." />
                    </div>

                    <div className="form-group" style={{ borderTop: '1px solid #F4EEE8', paddingTop: '16px' }}>
                        <label style={{ marginBottom: '12px' }}>
                            Select Payment & Delivery Handling Channel —{' '}
                            {isFreeTier ? (
                                <span style={{ color: '#2e7d32', fontWeight: 700 }}>Due Now: £0.00 (Free Spaces Active)</span>
                            ) : (
                                <span style={{ color: '#c62828', fontWeight: 700 }}>Due Now: £0.66 (Listing Fee Applies)</span>
                            )}
                        </label>

                        <div className="payment-methods-grid-expanded">
                            <button type="button" className={`payment-method-card stripe-select ${payMethod === 'stripe' ? 'active' : ''}`} onClick={() => setPayMethod('stripe')}>💳 Stripe</button>
                            <button type="button" className={`payment-method-card paypal-select ${payMethod === 'paypal' ? 'active' : ''}`} onClick={() => setPayMethod('paypal')}>🪪 PayPal</button>
                            <button type="button" className={`payment-method-card cash-select ${payMethod === 'cash' ? 'active' : ''}`} onClick={() => setPayMethod('cash')}>🤝 Cash on Collection</button>
                            <button type="button" className={`payment-method-card qr-select ${payMethod === 'qrcode' ? 'active' : ''}`} onClick={() => setPayMethod('qrcode')}>📱 Delivery QR Code</button>
                        </div>

                        {payMethod === 'cash' && (
                            <div className="payment-instruction-box">
                                <strong>🤝 Cash on Collection:</strong> Best for local trading hubs. Buyer contacts you via email, verifies deck details in person, and swaps physical currency directly on handover.
                            </div>
                        )}
                        {payMethod === 'qrcode' && (
                            <div className="payment-instruction-box">
                                <strong>📱 Delivery QR Code:</strong> Secure digital tracking system. Generates a distinct delivery reference scan block upon order fulfillment to confirm parcel receipt.
                            </div>
                        )}
                        {(payMethod === 'stripe' || payMethod === 'paypal') && (
                            <div className="payment-instruction-box">
                                <strong>💳 Digital Gateway:</strong> Instant processing framework. Best for long-distance shipping protection buffers with comprehensive tracking integrations.
                            </div>
                        )}
                    </div>

                    <button
                        type="submit"
                        className="stripe-btn"
                        style={{
                            width: '100%',
                            marginTop: '10px',
                            backgroundColor: !isFreeTier && payMethod === 'paypal' ? '#003087' : payMethod === 'cash' ? '#114E60' : payMethod === 'qrcode' ? '#e65100' : '#325288'
                        }}
                    >
                        {isFreeTier ? 'Publish Free Listing' : `Pay £0.66 & Publish Item`}
                    </button>
                </form>
            </div>
        );
    };

    // 📖 5. Terms & Conditions Policy View Component Layout
    const TermsView = () => (
        <div className="brand-overlay-card" style={{ maxWidth: '650px', width: '100%', textAlign: 'left', maxHeight: '75vh', overflowY: 'auto' }}>
            <h1 style={{ color: '#114E60', marginTop: 0, fontWeight: 800, textAlign: 'center' }}>Terms of Service</h1>
            <p style={{ color: '#64748b', fontSize: '0.85rem', textAlign: 'center', marginBottom: '24px' }}>Last Updated: August 18, 2026</p>

            <h3 style={{ color: '#114E60', borderBottom: '1px solid #F4EEE8', paddingBottom: '6px' }}>1. No Liability Disclaimer</h3>
            <p style={{ color: '#325288', fontSize: '0.9rem', lineHeight: 1.5 }}>
                Arkana Marketplace operates solely as an introductory peer-to-peer indexing directory. We do not own, inspect, hold, or ship any items. Under no circumstances shall Arkana Marketplace be liable for financial loss, fraudulent listings, or damaged goods. All interactions and trades are conducted entirely at your own risk.
            </p>

            <h3 style={{ color: '#114E60', borderBottom: '1px solid #F4EEE8', paddingBottom: '6px', marginTop: '20px' }}>2. Dispute Resolution</h3>
            <p style={{ color: '#325288', fontSize: '0.9rem', lineHeight: 1.5 }}>
                Any transaction disputes regarding payments, conditions, or fake claims must be handled directly between the buyer and seller via email. Arkana Marketplace does not process refunds and cannot mediate user conflicts.
            </p>

            <h3 style={{ color: '#114E60', borderBottom: '1px solid #F4EEE8', paddingBottom: '6px', marginTop: '20px' }}>3. Delivery & Shipping Policies</h3>
            <p style={{ color: '#325288', fontSize: '0.9rem', lineHeight: 1.5 }}>
                Sellers are completely responsible for shipping items safely and sharing valid tracked delivery numbers. Buyers are responsible for any international custom fees or local VAT charges.
            </p>

            <h3 style={{ color: '#114E60', borderBottom: '1px solid #F4EEE8', paddingBottom: '6px', marginTop: '20px' }}>4. Listing Fees</h3>
            <p style={{ color: '#325288', fontSize: '0.9rem', lineHeight: 1.5 }}>
                Your first 3 active deck slots are 100% free. Additional listings require a non-refundable deployment fee of £0.66 paid via Stripe or PayPal.
            </p>

            <Link to="/" className="stripe-btn" style={{ textDecoration: 'none', display: 'block', textAlign: 'center', margin: '24px auto 0 auto', maxWidth: '200px' }}>
                Accept & Return
            </Link>
        </div>
    );

    return (
        <BrowserRouter>
            <nav className="navbar">
                <div style={{ fontWeight: 800, fontSize: '1.4rem', color: '#114E60', letterSpacing: '-0.5px' }}>ARKANA</div>
                <div className="nav-links">
                    <NavLink to="/" end>Home</NavLink>
                    <NavLink to="/dashboard">Dashboard</NavLink>
                    <NavLink to="/listings">Listings</NavLink>
                    <NavLink to="/sell">Sell</NavLink>
                    <NavLink to="/terms">T&Cs</NavLink>
                    <div className="gold-avatar">A</div>
                </div>
            </nav>

            <main className="full-background-canvas">
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/listings" element={<ListingsView />} />
                    <Route path="/sell" element={<SellView />} />
                    <Route path="/terms" element={<TermsView />} />
                    <Route path="*" element={<Home />} />
                </Routes>
            </main>
        </BrowserRouter>
    );
}
// 🗑️ 6. Isolated Delete Action Button Component Block
interface DeleteButtonProps {
    itemId: number;
    listingsState: any[];
    setListingsState: React.Dispatch<React.SetStateAction<any[]>>;
    onDeleteSuccess?: () => void;
}

export const DeleteListingButton: React.FC<DeleteButtonProps> = ({
    itemId,
    listingsState,
    setListingsState,
    onDeleteSuccess
}) => {
    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation(); // Avoid triggering card click layout events

        const confirmation = window.confirm("Are you sure you want to permanently remove this marketplace listing?");
        if (!confirmation) return;

        // Filter out the selected item by ID string validation rules
        const updatedListings = listingsState.filter((item) => item.id !== itemId);
        setListingsState(updatedListings);

        alert("Listing removed successfully from index registry records.");
        if (onDeleteSuccess) onDeleteSuccess();
    };

    return (
        <button
            type="button"
            onClick={handleDelete}
            style={{
                padding: '6px 12px',
                backgroundColor: '#c62828',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                marginTop: '8px',
                width: '100%',
                textAlign: 'center',
                transition: 'background-color 0.2s ease'
            }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#b71c1c')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#c62828')}
        >
            🗑️ Delete Entry Listing
        </button>
    );
};
// 🎴 7. Integrated Card Row Component Layout with Delete Action Hook
interface IntegratedCardProps {
    deck: {
        id: number;
        title: string;
        description: string;
        price: string;
        condition: string;
        location: string;
        sellerEmail: string;
        imagePreview: string;
    };
    listingsState: any[];
    setListingsState: React.Dispatch<React.SetStateAction<any[]>>;
}

export const IntegratedMarketplaceCard: React.FC<IntegratedCardProps> = ({
    deck,
    listingsState,
    setListingsState,
}) => {
    return (
        <div style={{ border: '1px solid #F4EEE8', borderRadius: '8px', overflow: 'hidden', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: '#fff' }}>
            <div style={{ fontSize: '2.5rem', background: '#f1f5f9', padding: '20px', borderRadius: '6px', textAlign: 'center' }}>
                {deck.imagePreview}
            </div>

            <h3 style={{ color: '#114E60', margin: '4px 0' }}>{deck.title}</h3>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#64748b' }}>
                <span>📍 {deck.location}</span>
                <span style={{ fontWeight: 600, color: '#325288' }}>{deck.condition}</span>
            </div>

            <p style={{ fontSize: '0.9rem', color: '#475569', flexGrow: 1 }}>{deck.description}</p>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                <span style={{ fontWeight: 800, color: '#114E60', fontSize: '1.2rem' }}>£{deck.price}</span>
                <a
                    href={`mailto:${deck.sellerEmail}?subject=Inquiry: ${encodeURIComponent(deck.title)}`}
                    style={{ textDecoration: 'none', background: '#325288', color: '#fff', padding: '6px 12px', borderRadius: '4px', fontSize: '0.85rem' }}
                >
                    Contact Seller
                </a>
            </div>

            {/* 🛑 Injected Delete Action Button Component Hook Instance */}
            <DeleteListingButton
                itemId={deck.id}
                listingsState={listingsState}
                setListingsState={setListingsState}
            />
        </div>
    );
};
// 🗑️ 6. Isolated Delete Action Button Component Block
interface DeleteButtonProps {
    itemId: number;
    listingsState: any[];
    setListingsState: React.Dispatch<React.SetStateAction<any[]>>;
}
// 📸 10. Standalone Multi-Image Base64 Uploader Component Block (Max 3 Images)
interface MultiImageUploaderProps {
    imagesArray: string[];
    setImagesArray: React.Dispatch<React.SetStateAction<string[]>>;
}

export const MultiImageUploader: React.FC<MultiImageUploaderProps> = ({
    imagesArray = [],
    setImagesArray
}) => {
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        // Convert file list to an array and slice to enforce a hard maximum limit
        const incomingFiles = Array.from(files).filter(file => file.type.startsWith('image/'));

        if (imagesArray.length + incomingFiles.length > 3) {
            alert("Maximum limit reached. You can only attach up to 3 product pictures per deck listing.");
            return;
        }

        incomingFiles.forEach((file) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                if (typeof reader.result === 'string') {
                    setImagesArray((prev) => [...prev, reader.result as string].slice(0, 3));
                }
            };
            reader.readAsDataURL(file);
        });
    };

    const removeImage = (indexToRemove: number) => {
        setImagesArray((prev) => prev.filter((_, index) => index !== indexToRemove));
    };

    return (
        <div style={{ marginTop: '8px' }}>
            <label
                htmlFor="deck-multi-file-upload"
                style={{
                    display: 'inline-block',
                    padding: '10px 16px',
                    backgroundColor: imagesArray.length >= 3 ? '#94a3b8' : '#114E60',
                    color: '#ffffff',
                    borderRadius: '6px',
                    cursor: imagesArray.length >= 3 ? 'not-allowed' : 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    textAlign: 'center',
                    width: '100%',
                    border: imagesArray.length >= 3 ? '1px solid #94a3b8' : '1px solid #114E60',
                    boxSizing: 'border-box'
                }}
            >
                {imagesArray.length >= 3 ? '🚫 Maximum 3 Images Reached' : `📸 Upload Gallery Photos (${imagesArray.length}/3)`}
            </label>

            <input
                id="deck-multi-file-upload"
                type="file"
                accept="image/*"
                multiple
                disabled={imagesArray.length >= 3}
                onChange={handleFileChange}
                style={{ display: 'none' }}
            />

            {/* Grid preview layout block */}
            {imagesArray.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '12px' }}>
                    {imagesArray.map((imgString, index) => (
                        <div key={index} style={{ position: 'relative', border: '1px solid #F4EEE8', borderRadius: '6px', overflow: 'hidden', height: '80px', backgroundColor: '#f8fafc' }}>
                            <img
                                src={imgString}
                                alt={`Preview ${index + 1}`}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                            <button
                                type="button"
                                onClick={() => removeImage(index)}
                                style={{
                                    position: 'absolute',
                                    top: '2px',
                                    right: '2px',
                                    background: 'rgba(198, 40, 40, 0.9)',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '18px',
                                    height: '18px',
                                    fontSize: '10px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 'bold'
                                }}
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
// ========================================================
// 📸 10. ISOLATED MULTI-IMAGE UPLOADER (Paste at the very bottom)
// ========================================================
interface SafeUploaderProps {
    images: string[];
    setImages: React.Dispatch<React.SetStateAction<string[]>>;
}

export const SafeMultiImageUploader: React.FC<SafeUploaderProps> = ({ images = [], setImages }) => {
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        const incomingFiles = Array.from(files).filter(file => file.type.startsWith('image/'));

        if (images.length + incomingFiles.length > 3) {
            alert("Maximum limit reached! You can only attach up to 3 pictures per deck.");
            return;
        }
        incomingFiles.forEach((file) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                if (typeof reader.result === 'string') {
                    setImages((prev) => [...prev, reader.result as string].slice(0, 3));
                }
            };
            reader.readAsDataURL(file);
        });
    };



    return (
        <div style={{ marginTop: '12px', marginBottom: '12px', textAlign: 'left' }}>
            <label
                htmlFor="safe-gallery-upload"
                style={{
                    display: 'block',
                    padding: '10px 16px',
                    backgroundColor: images.length >= 3 ? '#94a3b8' : '#114E60',
                    color: '#ffffff',
                    borderRadius: '6px',
                    cursor: images.length >= 3 ? 'not-allowed' : 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    textAlign: 'center',
                    border: 'none'
                }}
            >
                {images.length >= 3 ? '🚫 Photo Slots Full (3/3)' : `📸 Upload Gallery Photos (${images.length}/3)`}
            </label>

            <input
                id="safe-gallery-upload"
                type="file"
                accept="image/*"
                multiple
                disabled={images.length >= 3}
                onChange={handleFileChange}
                style={{ display: 'none' }}
            />

            {images.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    {images.map((img, idx) => (
                        <div key={idx} style={{ position: 'relative', width: '60px', height: '60px', borderRadius: '6px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                            <img src={img} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <button
                                type="button"
                                onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                                style={{
                                    position: 'absolute',
                                    top: '2px',
                                    right: '2px',
                                    background: 'rgba(198, 40, 40, 0.9)',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '16px',
                                    height: '16px',
                                    fontSize: '9px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 'bold'
                                }}
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
