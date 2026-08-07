import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('app');

if (!rootElement) {
  throw new Error('Root element #app was not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
// 1. Add this import statement near the very top of the file
import SellerDashboard from './SellerDashboard';

// 2. Inside your layout function component, add a state variable to track tabs
const [activeTab, setActiveTab] = React.useState('marketplace');

// 3. Update your navigation menu link element to set the tab state on click:
<button 
  onClick={() => setActiveTab('dashboard')}
  className={`font-semibold ${activeTab === 'dashboard' ? 'text-[#D4AF37]' : 'text-[#1F2937]'}`}
>
  Seller Dashboard
</button>

// 4. In the main content body rendering container, toggle your views:
<main className="min-h-screen bg-[#FAFAFA]">
  {activeTab === 'dashboard' ? <SellerDashboard /> : <MarketplaceGrid />}
</main>
