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

// 🃏 Listings / Marketplace View Component
const Listings = () => (
  <div className="brand-overlay-card">
    <h1>Marketplace Listings</h1>
    <p>Browse beautiful community decks currently up for trading or sale.</p>
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

