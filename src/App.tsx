import { BrowserRouter, Routes, Route, Link, NavLink } from 'react-router-dom';

// 🔮 Home View Component
const Home = () => (
  <div className="brand-overlay-card">
    <h1>Welcome to Arkana</h1>
    <p>Zero-commission marketplace for tarot and oracle card enthusiasts.</p>
    <Link to="/listings" className="stripe-btn" style={{ textDecoration: 'none', display: 'inline-block' }}>
      Explore our listings
    </Link>
  </div>
);
// 📊 Dashboard View Component Placeholder
const Dashboard = () => (
  <div className="brand-overlay-card">
    <h1>Your Dashboard</h1>
    <p>Track your active sales, purchase history, and tarot shop analytics.</p>
  </div>
);

// 💰 Sell View Component Placeholder
const Sell = () => (
  <div className="brand-overlay-card">
    <h1>List a Tarot Deck</h1>
    <p>Upload details, conditions, and images to list your deck on the marketplace.</p>
  </div>
);

// Mock database array structure representing listed inventory items
const MOCK_DECKS = [
  { id: 1, title: "The Celestial Arcana", description: "First edition gilded gold edges. Out of print collectible.", price: "£75", condition: "Mint" },
  { id: 2, title: "Mystic Woodland Oracle", description: "Hand-illustrated indie deck featuring raw matte cardstock finishes.", price: "£32", condition: "Like New" },
  { id: 3, title: "Classic Rider-Waite (1971)", description: "Vintage printing historical deck with authentic color tones.", price: "£45", condition: "Good" }
];

// Upgraded Listings/Marketplace interactive catalog loop
const Listings = () => (
  <div className="listings-container">
    <h1 style={{ color: '#114E60', textAlign: 'center', marginBottom: '32px', fontWeight: 800 }}>
      Current Marketplace Catalog
    </h1>

    <div className="deck-grid">
      {MOCK_DECKS.map((deck) => (
        <div key={deck.id} className="deck-card">
          {/* Visual element anchor frame */}
          <div className="deck-image-frame">🔮</div>

          <div className="deck-details">
            <h3>{deck.id}. {deck.title}</h3>
            <p>{deck.description}</p>

            <div className="deck-meta-row">
              <span className="deck-price">{deck.price}</span>
              <span className="condition-badge">{deck.condition}</span>
            </div>

            <Link to="/" className="stripe-btn" style={{ textDecoration: 'none', textAlign: 'center', marginTop: '16px' }}>
              View Listing
            </Link>
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default function App() {
  return (
    <BrowserRouter>
      {/* 1. Flat White Navigation Bar Layout Matching Your CSS */}
      <nav className="navbar">
        <div style={{ fontWeight: 800, fontSize: '1.4rem', color: '#114E60', letterSpacing: '-0.5px' }}>
          ARKANA
        </div>
        <div className="nav-links">
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/listings">Listings</NavLink>
          <NavLink to="/sell">Sell</NavLink>
          <div className="gold-avatar">A</div>
        </div>
      </nav>

      {/* 2. FULL CANVAS AREA: Dot-mesh canvas wrapper */}
      <main className="full-background-canvas">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/listings" element={<Listings />} />
          <Route path="/sell" element={<Sell />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

