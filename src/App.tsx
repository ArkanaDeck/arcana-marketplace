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

  // 🔮 1. Home View Component Layout
  // 🔮 Upgraded Home Entry Portal Component Layout with Multi-Tab Auth
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
      // Future hook point: Connect to your database auth table pipeline here
    };

    return (
      <div className="auth-container">
        {/* Tab selection switches header interface states dynamically */}
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
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="e.g. Alex Crowley"
              />
            </div>
          )}

          <div className="form-group">
            <label>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="name@domain.com"
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button type="submit" className="stripe-btn" style={{ width: '100%', marginTop: '10px' }}>
            {authMode === 'signin' ? 'Sign In Securely' : 'Register Account'}
          </button>
        </form>

        {/* Guest Path Integration Element */}
        <div className="auth-divider">OR</div>

        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '16px' }}>
          In a rush to secure a rare deck? Skip the queue safely.
        </p>

        <Link to="/listings" style={{ textDecoration: 'none' }}>
          <button className="guest-btn">
            Continue as Guest Checkout 🚀
          </button>
        </Link>
      </div>
    );
  };


  // 📊 2. Upgraded Dynamic Dashboard View Component Layout
  const Dashboard = () => {
    // Check if the current user has created any listings
    const userDecks = listings.filter(deck => deck.id !== 1 && deck.id !== 2); // Excludes initial mock seeds
    const hasListings = userDecks.length > 0;

    // Calculate total shop valuation metrics dynamically
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

        {/* Conditional Layout Switching Logic */}
        {!hasListings ? (
          /* 📭 Empty State Grid Box (Shows when user has 0 items) */
          <div style={{
            background: '#F4EEE8',
            padding: '32px 20px',
            borderRadius: '16px',
            border: '2px dashed #F5CEBE',
            marginTop: '16px'
          }}>
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
          /* 📈 Active Shop Stats Layout Box (Shows automatically once they list an item) */
          <div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              marginBottom: '24px'
            }}>
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
                <div key={deck.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  background: '#fafafa',
                  borderRadius: '8px',
                  border: '1px solid #F4EEE8'
                }}>
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
            <div className="deck-image-frame">{deck.imagePreview}</div>
            <div className="deck-details">
              <h3>{deck.title}</h3>
              <div className="deck-sub-meta">
                <span>📍 {deck.location}</span>
                <span className="condition-badge">{deck.condition}</span>
              </div>
              <p>{deck.description}</p>
              <div className="deck-meta-row">
                <span className="deck-price">{deck.price}</span>
                {/* ✉️ Direct Messaging: HTML Mailto anchor opens native email applications */}
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

  // 💰 4. Form Submission View Component Layout
  // 💰 4. Form Submission View with Dynamic Tier-Based Payments
  const SellView = () => {
    const [payMethod, setPayMethod] = useState<'stripe' | 'paypal'>('stripe');

    // Mathematical Calculation: Check active index limit boundaries
    const currentCount = listings.length;
    const isFreeTier = currentCount < 3;

    // Every 3 items after the initial 3 costs an additional £0.66
    const listingFee = isFreeTier ? 0 : 0.66;

    const handleSubmitWithPayment = (e: React.FormEvent) => {
      e.preventDefault();

      if (!isFreeTier) {
        // Simulated Payment Authorization Framework Routing Points
        const gatewayName = payMethod === 'stripe' ? 'Stripe Secure Checkout' : 'PayPal Instant Transfer';
        alert(`Redirecting to ${gatewayName} to process your £0.66 listing submission fee...`);
      }

      // Execute base submission pipeline logic directly
      handleCreateListing(e);
    };

    return (
      <div className="sell-form-card">
        <h2 style={{ color: '#114E60', marginTop: 0, marginBottom: '6px' }}>Create New Listing</h2>

        {/* Dynamic Status Counter Box */}
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
          </div>
          <div className="form-group">
            <label>Asking Price (£) *</label>
            <input type="number" value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="45" required />
          </div>
          <div className="form-group">
            <label>Your Email (For Buyer Contact) *</label>
            <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="yourname@domain.com" required />
          </div>
          <div className="form-group">
            <label>Location / Address</label>
            <input type="text" value={newLoc} onChange={e => setNewLoc(e.target.value)} placeholder="e.g. London, UK" />
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
            <label>Description</label>
            <textarea rows={3} value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Provide information about card quality, completeness..." />
          </div>

          {/* Conditional Payment UI: Renders only when user falls outside free limits */}
          {!isFreeTier && (
            <div className="form-group" style={{ borderTop: '1px solid #F4EEE8', paddingTop: '16px' }}>
              <label>Select Gateway Platform for Listing Fee (£0.66)</label>
              <div className="payment-methods-grid">
                <button
                  type="button"
                  className={`payment-method-card stripe-select ${payMethod === 'stripe' ? 'active' : ''}`}
                  onClick={() => setPayMethod('stripe')}
                >
                  💳 Stripe
                </button>
                <button
                  type="button"
                  className={`payment-method-card paypal-select ${payMethod === 'paypal' ? 'active' : ''}`}
                  onClick={() => setPayMethod('paypal')}
                >
                  🪪 PayPal
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            className="stripe-btn"
            style={{
              width: '100%',
              marginTop: '10px',
              backgroundColor: !isFreeTier && payMethod === 'paypal' ? '#003087' : '#325288'
            }}
          >
            {isFreeTier ? 'Publish Free Listing' : `Pay £0.66 & Publish Item`}
          </button>
        </form>
      </div>
    );
  };


  return (
    <BrowserRouter>
      {/* 🧭 Flat White Navbar Structural Header Wrapper */}
      <nav className="navbar">
        <div style={{ fontWeight: 800, fontSize: '1.4rem', color: '#114E60', letterSpacing: '-0.5px' }}>ARKANA</div>
        <div className="nav-links">
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/listings">Listings</NavLink>
          <NavLink to="/sell">Sell</NavLink>
          <div className="gold-avatar">A</div>
        </div>
      </nav>

      {/* 🔮 Background dot-mesh core canvas view engine container */}
      <main className="full-background-canvas">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/listings" element={<ListingsView />} />
          <Route path="/sell" element={<SellView />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
