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
  const Home = () => (
    <div className="brand-overlay-card">
      <h1>Welcome to Arkana</h1>
      <p>Zero-commission marketplace for tarot and oracle card enthusiasts.</p>
      <Link to="/listings" className="stripe-btn" style={{ textDecoration: 'none', display: 'inline-block' }}>
        Explore our listings
      </Link>
    </div>
  );

  // 📊 2. Dashboard View Component Layout
  const Dashboard = () => (
    <div className="brand-overlay-card">
      <h1>Your Dashboard</h1>
      <p>Track your active sales, purchase history, and tarot shop analytics.</p>
    </div>
  );

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
  const SellView = () => (
    <div className="sell-form-card">
      <h2 style={{ color: '#114E60', marginTop: 0, marginBottom: '24px' }}>Create New Listing</h2>
      <form onSubmit={handleCreateListing}>
        <div className="form-group">
          <label>Deck Title *</label>
          <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Vintage Thoth Tarot" required />
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
          <textarea rows={3} value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Provide information about card quality, completeness, packaging, shipping..." />
        </div>
        <button type="submit" className="stripe-btn" style={{ width: '100%', marginTop: '10px' }}>Publish Item</button>
      </form>
    </div>
  );

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
