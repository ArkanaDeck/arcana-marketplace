import React, { useState } from 'react';
import heroImage from './assets/Screenshot 2026-08-04 at 23.20.54.png';
import feedImage from './assets/Screenshot 2026-08-04 at 23.21.57.png';

type ViewKey = 'Home' | 'Dashboard' | 'Listings' | 'Sell';

const navItems: ViewKey[] = ['Home', 'Dashboard', 'Listings', 'Sell'];

const featuredListings = [
  { title: 'Moon Tarot Deck', price: '£34.95', tag: 'Best seller', description: 'Bright, hand-finished deck for collectors and first-time readers.' },
  { title: 'Golden Reading Set', price: '£19.50', tag: 'New', description: 'A calm starter kit with cards, spread guide and velvet pouch.' },
  { title: 'Shadow Oracle Deck', price: '£27.00', tag: 'Limited', description: 'Minimalist artwork and tactile finish for modern decks.' },
];

const dashboardFeed = [
  { title: 'Free listing slots', value: '3 remaining', detail: 'Each new account starts with three free listings.' },
  { title: 'Live sales', value: '12 this week', detail: 'Your items are getting discovered by buyers every day.' },
  { title: 'Seller payout', value: '£144.00', detail: 'Fast transfer ready for your next payout.' },
];

export default function App() {
  const [activeView, setActiveView] = useState<ViewKey>('Home');

  return (
    <div className="app-shell">
      <style>{`
        :root {
          color-scheme: light;
          --page-bg: #fafafa;
          --surface: #ffffff;
          --surface-2: #f5f5f3;
          --text: #121212;
          --muted: #60656e;
          --accent: #d3b15b;
          --accent-strong: #b48c2b;
          --border: #ececec;
        }

        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background: var(--page-bg);
          color: var(--text);
        }

        .app-shell {
          min-height: 100vh;
          background: linear-gradient(180deg, #ffffff 0%, var(--page-bg) 100%);
          padding: 24px;
        }

        .frame {
          max-width: 1320px;
          margin: 0 auto;
          border: 1px solid var(--border);
          border-radius: 28px;
          overflow: hidden;
          background: var(--surface);
          box-shadow: 0 22px 60px rgba(18, 18, 18, 0.06);
        }

        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 28px;
          border-bottom: 1px solid var(--border);
          background: var(--surface);
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .brand-mark {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--accent), #f0d59a);
          display: grid;
          place-items: center;
          color: white;
          font-weight: 800;
          letter-spacing: 0.04em;
        }

        .brand strong {
          display: block;
          font-size: 0.95rem;
        }

        .brand span {
          color: var(--muted);
          font-size: 0.82rem;
        }

        .nav-links {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .nav-btn {
          border: 0;
          background: transparent;
          color: var(--muted);
          font-weight: 600;
          padding: 8px 12px;
          border-radius: 999px;
          cursor: pointer;
        }

        .nav-btn.active {
          color: var(--text);
          background: var(--surface-2);
        }

        .primary-btn {
          border: 0;
          background: var(--accent);
          color: white;
          padding: 10px 16px;
          border-radius: 999px;
          font-weight: 700;
          cursor: pointer;
        }

        .page-content {
          padding: 24px 28px 28px;
          background: linear-gradient(180deg, #ffffff 0%, var(--page-bg) 100%);
        }

        .hero-grid {
          display: grid;
          grid-template-columns: 1.25fr 0.75fr;
          gap: 20px;
          align-items: stretch;
        }

        .hero-card, .panel-card, .listing-card, .form-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 24px;
          padding: 20px;
        }

        .hero-card {
          background: linear-gradient(135deg, #ffffff 0%, #faf7ec 100%);
        }

        .eyebrow {
          display: inline-block;
          padding: 7px 10px;
          border-radius: 999px;
          background: #fff8e1;
          color: var(--accent-strong);
          font-size: 0.76rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 12px;
        }

        .hero-card h1 {
          font-size: clamp(1.8rem, 2.6vw, 2.7rem);
          line-height: 1.08;
          margin: 0 0 12px;
        }

        .hero-card p {
          color: var(--muted);
          line-height: 1.7;
          margin: 0 0 16px;
        }

        .hero-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 16px;
        }

        .secondary-btn {
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text);
          padding: 10px 16px;
          border-radius: 999px;
          font-weight: 600;
          cursor: pointer;
        }

        .hero-img {
          width: 100%;
          height: 260px;
          object-fit: cover;
          border-radius: 18px;
          border: 1px solid var(--border);
        }

        .stats-row {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-top: 14px;
        }

        .stat-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 12px;
        }

        .stat-card strong {
          display: block;
          font-size: 1rem;
          margin-bottom: 4px;
        }

        .stat-card span {
          color: var(--muted);
          font-size: 0.84rem;
        }

        .disclosure-card {
          padding: 18px;
          border-radius: 22px;
          background: linear-gradient(135deg, #ffffff 0%, #fbf7e8 100%);
          border: 1px solid #edd9a7;
          margin-top: 18px;
        }

        .disclosure-card h3 {
          margin: 0 0 8px;
          font-size: 1.05rem;
        }

        .disclosure-card p {
          margin: 0;
          color: var(--muted);
          line-height: 1.65;
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap: 20px;
        }

        .feed-card {
          border: 1px solid var(--border);
          border-radius: 22px;
          padding: 16px;
          background: var(--surface);
        }

        .feed-card h3, .panel-card h3, .listing-card h3, .form-card h3 {
          margin: 0 0 10px;
        }

        .feed-list {
          display: grid;
          gap: 10px;
        }

        .feed-item {
          padding: 12px 14px;
          border-radius: 16px;
          background: var(--surface-2);
        }

        .feed-item strong { display: block; margin-bottom: 4px; }

        .feed-item span { color: var(--muted); font-size: 0.9rem; }

        .listing-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
          margin-top: 8px;
        }

        .listing-card img {
          width: 100%;
          height: 150px;
          object-fit: cover;
          border-radius: 14px;
          margin-bottom: 10px;
          border: 1px solid var(--border);
        }

        .listing-card .pill {
          display: inline-block;
          padding: 6px 10px;
          border-radius: 999px;
          background: #fff8e1;
          color: var(--accent-strong);
          font-size: 0.73rem;
          font-weight: 700;
          margin-bottom: 8px;
        }

        .listing-card p { margin: 6px 0 10px; color: var(--muted); line-height: 1.55; }

        .price-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-weight: 700;
        }

        .form-card form {
          display: grid;
          gap: 10px;
        }

        .form-card input, .form-card textarea {
          width: 100%;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: #fcfcfc;
          font: inherit;
        }

        .form-card textarea { min-height: 90px; resize: vertical; }

        @media (max-width: 980px) {
          .hero-grid, .dashboard-grid, .listing-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 720px) {
          .app-shell { padding: 12px; }
          .topbar, .page-content { padding-left: 16px; padding-right: 16px; }
          .topbar { flex-direction: column; gap: 12px; align-items: flex-start; }
          .stats-row { grid-template-columns: 1fr; }
        }
      `}</style>

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

          <button className="primary-btn">Create listing</button>
        </header>

        <main className="page-content">
          {activeView === 'Home' && (
            <section className="hero-grid">
              <div className="hero-card">
                <div className="eyebrow">Community-first tarot marketplace</div>
                <h1>Bright, simple selling for decks, spreads and collector pieces.</h1>
                <p>Arkana brings a calm, premium experience to first-time sellers and seasoned collectors — with a transparent, zero-commission revenue model.</p>
                <div className="hero-actions">
                  <button className="primary-btn">Start selling</button>
                  <button className="secondary-btn">Browse decks</button>
                </div>
                <div className="stats-row">
                  <div className="stat-card">
                    <strong>3</strong>
                    <span>Free listings to begin</span>
                  </div>
                  <div className="stat-card">
                    <strong>0%</strong>
                    <span>Commission on sales</span>
                  </div>
                  <div className="stat-card">
                    <strong>24h</strong>
                    <span>Fast seller support</span>
                  </div>
                </div>
              </div>

              <div className="panel-card">
                <img className="hero-img" src={heroImage} alt="Arkana marketplace preview" />
                <div className="disclosure-card">
                  <h3>Zero commission revenue disclosure</h3>
                  <p>Arkana keeps the platform transparent. Sellers keep their full sale value, and a small charge is only applied after the first three free listings.</p>
                </div>
              </div>
            </section>
          )}

          {activeView === 'Dashboard' && (
            <section className="dashboard-grid">
              <div className="feed-card">
                <h3>Main dashboard feed</h3>
                <div className="feed-list">
                  {dashboardFeed.map((item) => (
                    <div className="feed-item" key={item.title}>
                      <strong>{item.title}</strong>
                      <span>{item.value}</span>
                      <div style={{ color: 'var(--muted)', marginTop: 4, fontSize: '0.88rem' }}>{item.detail}</div>
                    </div>
                  ))}
                </div>

                <div className="disclosure-card" style={{ marginTop: 14 }}>
                  <h3>Zero commission revenue disclosure</h3>
                  <p>This is the core promise of the Arkana marketplace: no commission on standard sales, no hidden fees, and a clear small charge only after the first three free listings.</p>
                </div>
              </div>

              <div className="panel-card">
                <img className="hero-img" src={feedImage} alt="Arkana dashboard preview" />
                <div className="disclosure-card" style={{ marginTop: 14 }}>
                  <h3>Seller confidence</h3>
                  <p>Every dashboard view is designed to feel calm, bright and confidence-building — with clear numbers, simple actions and a premium finish.</p>
                </div>
              </div>
            </section>
          )}

          {activeView === 'Listings' && (
            <section>
              <div className="hero-card">
                <div className="eyebrow">Marketplace browse</div>
                <h1>Browse curated decks and accessories with the same calm layout across every page.</h1>
                <p>Every listing card uses the white-and-off-white palette, clean spacing and light premium styling from the Arkana blueprint.</p>
              </div>
              <div className="listing-grid" style={{ marginTop: 16 }}>
                {featuredListings.map((item) => (
                  <div className="listing-card" key={item.title}>
                    <img src={heroImage} alt={item.title} />
                    <div className="pill">{item.tag}</div>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                    <div className="price-row">
                      <span>{item.price}</span>
                      <button className="primary-btn">View</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeView === 'Sell' && (
            <section className="dashboard-grid">
              <div className="form-card">
                <h3>List a new item</h3>
                <form>
                  <input placeholder="Item title" />
                  <input placeholder="Price" />
                  <textarea placeholder="Describe your deck, reading tools or collection piece" />
                  <button className="primary-btn" type="button">Publish listing</button>
                </form>
              </div>
              <div className="panel-card">
                <img className="hero-img" src={feedImage} alt="Arkana selling experience" />
                <div className="disclosure-card" style={{ marginTop: 14 }}>
                  <h3>Sell with confidence</h3>
                  <p>Our flow keeps the experience light and reassuring, from upload to checkout, while keeping the zero-commission promise visible at every step.</p>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
