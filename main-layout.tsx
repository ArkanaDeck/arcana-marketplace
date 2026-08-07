import React, { useState } from 'react';
import SellerDashboard from './SellerDashboard';
import CheckoutView from './CheckoutView';
// Import your freshly renamed background texture asset
import mysticalBg from './assets/mystical-bg.jpg'; 

export default function MainLayout() {
  const [activeTab, setActiveTab] = useState<'marketplace' | 'dashboard' | 'checkout'>('marketplace');

  return (
    <div 
      className="min-h-screen font-sans antialiased text-[#1F2937] bg-fixed bg-cover bg-center"
      style={{ backgroundImage: `url(${mysticalBg})` }}
    >
      {/* Translucent glassmorphism top navigation bar */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-[#E5E7EB] px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div 
            onClick={() => setActiveTab('marketplace')} 
            className="text-xl font-bold tracking-wider cursor-pointer hover:opacity-80"
          >
            🔮 ARKANA
          </div>
          <div className="flex space-x-6">
            <button 
              onClick={() => setActiveTab('marketplace')} 
              className={`text-sm font-semibold transition-colors ${activeTab === 'marketplace' ? 'text-[#D4AF37]' : 'text-gray-500 hover:text-[#1F2937]'}`}
            >
              Marketplace
            </button>
            <button 
              onClick={() => setActiveTab('checkout')} 
              className={`text-sm font-semibold transition-colors ${activeTab === 'checkout' ? 'text-[#D4AF37]' : 'text-gray-500 hover:text-[#1F2937]'}`}
            >
              Basket & Checkout
            </button>
            <button 
              onClick={() => setActiveTab('dashboard')} 
              className={`text-sm font-semibold transition-colors ${activeTab === 'dashboard' ? 'text-[#D4AF37]' : 'text-gray-500 hover:text-[#1F2937]'}`}
            >
              Seller Dashboard
            </button>
          </div>
        </div>
      </nav>

      {/* Main Container with blurred translucent content cards so your text stays sharp */}
      <main className="max-w-7xl mx-auto py-6 px-4">
        {activeTab === 'marketplace' && (
          <div className="p-8 text-center bg-white/95 backdrop-blur-sm rounded-xl border border-[#E5E7EB] my-6 shadow-xl max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold mb-4">Welcome to Arkana Tarot Marketplace</h2>
            <p className="text-gray-500 mb-6">Browse unique card listings collected across the United Kingdom market.</p>
            
            {/* Revenue Disclosure Card */}
            <div className="p-4 bg-[#FAFAFA]/90 border border-[#E5E7EB] rounded-lg text-left text-xs text-gray-600 leading-relaxed">
              <span className="font-bold text-[#1F2937] block mb-1">Our Platform Cut: £0.00 / 0% Commission.</span>
              This website is 100% free to browse, swap, and list decks for casual collectors. To keep the website running without commissions, we charge a flat 50p fee only when a seller hosts more than 3 active listings at the same time. All transactions flow directly from the buyer to the seller's wallet via UK payment card networks.
            </div>
          </div>
        )}

        {activeTab === 'checkout' && <CheckoutView />}
        {activeTab === 'dashboard' && <SellerDashboard />}
      </main>
    </div>
  );
}
