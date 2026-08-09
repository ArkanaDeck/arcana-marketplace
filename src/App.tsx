import React, { useState } from 'react';
import './MainLayout.css'; // Ensure the CSS file is imported

const navItems = ['Home', 'Dashboard', 'Listings', 'Sell'];

export const MainLayout: React.FC = () => {
  const [activeView, setActiveView] = useState('Home');

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

          <button className="primary-btn">Create listing</button>
        </header>

        <main className="page-content">
          {activeView === 'Home' && (
            // Home page content
            <section className="hero-grid">
              <div className="hero-card">
                <h1>Welcome to Arkana</h1>
                <p>Zero-commission marketplace for tarot and oracle card enthusiasts.</p>
                <button className="secondary-btn">Explore our listings</button>
              </div>
              <div className="hero-img
