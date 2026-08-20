
import React, { useState } from 'react';

// 🟦 1. Blueprint Validation Data Schema
interface DeckItem {
  id: number;
  title: string;
  category: string; // Tarot, Trading Cards
  description: string;
  price: string;
  condition: string;
  location: string;
  sellerEmail: string;
  imagePreview: string[]; // Holds up to 3 gallery image strings
  courier: string;
  shippingCost: string;
  qrTracking: boolean;
  collectionAddress?: string;
  customShippingRules?: string;
}

export default function App() {
  const [currentView, setCurrentView] = useState('Listings');

  // 🗄️ Universal Database Array State Registry
  const [listings, setListings] = useState<DeckItem[]>([
    {
      id: 1,
      title: "Vintage Thoth Tarot Deck",
      category: "Tarot",
      description: "Excellent historical print with complete booklet insert.",
      price: "45",
      condition: "Like New",
      location: "London, UK",
      sellerEmail: "collector@example.com",
      imagePreview: ["🔮"],
      courier: "Royal Mail",
      shippingCost: "4.45",
      qrTracking: true,
      customShippingRules: "Ships securely within 24 hours."
    }
  ]);

  // 📥 Universal Form Input State Trackers
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Tarot');
  const [newPrice, setNewPrice] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newLoc, setNewLoc] = useState('');
  const [newCondition, setNewCondition] = useState('Mint');
  const [newDesc, setNewDesc] = useState('');
  const [newImage, setNewImage] = useState<string[]>([]);

  // 📦 Delivery, Courier and Extra Instruction states
  const [shipCourier, setShipCourier] = useState('Royal Mail');
  const [shipCost, setShipCost] = useState('4.45');
  const [qrTrackingToggle, setqrTrackingToggle] = useState(false);
  const [extraInstructionType, setExtraInstructionType] = useState('none');
  const [extraInstructionText, setExtraInstructionText] = useState('');

  const currentCount = listings.length;

  // 📤 Form submission capturing handler
  const handleCreateListingSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!newTitle || !newPrice || !newEmail) {
      return alert("Please fill in all required fields marked with an asterisk (*).");
    }

    const itemPayload: DeckItem = {
      id: Date.now(),
      title: newTitle,
      category: newCategory,
      description: newDesc || "No description provided.",
      price: newPrice,
      condition: newCondition,
      location: newLoc || "UK Hub Collection Point",
      sellerEmail: newEmail,
      imagePreview: newImage.length > 0 ? newImage : ["🔮"],
      courier: shipCourier,
      shippingCost: shipCost,
      qrTracking: qrTrackingToggle,
      collectionAddress: extraInstructionType === 'collection' ? extraInstructionText : undefined,
      customShippingRules: extraInstructionType === 'shipping' ? extraInstructionText : undefined
    };

    setListings([itemPayload, ...listings]);
    alert("Published successfully!");

    // Clear inputs cleanly
    setNewTitle('');
    setNewPrice('');
    setNewEmail('');
    setNewLoc('');
    setNewDesc('');
    setNewImage([]);
    setqrTrackingToggle(false);
    setExtraInstructionType('none');
    setExtraInstructionText('');
    setCurrentView('Listings');
  };

  // 🟦 2. Listings Catalog Grid View Component Layout
  const ListingsView = () => {
    return (
      <div className="listings-container">
        <h1 style={{ color: '#114E60', textAlign: 'center', marginBottom: '32px', fontWeight: 800 }}>
          Current Marketplace Catalog
        </h1>

        <div className="deck-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, min max(300px, 1fr))', gap: '24px' }}>
          {listings.map((deck) => (
            <div key={deck.id} className="deck-card" style={{ border: '1px solid #F4EEE8', borderRadius: '8px', overflow: 'hidden', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: '#fff', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}>

              <MarketCardGalleryViewer galleryImages={deck.imagePreview} />

              <div className="deck-details" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem', background: '#e2e8f0', color: '#334155', padding: '2px 8px', borderRadius: '20px', width: 'fit-content', fontWeight: 600, textTransform: 'uppercase' }}>
                  {deck.category}
                </span>
                <h3 style={{ color: '#114E60', margin: '4px 0', fontSize: '1.25rem', fontWeight: 700 }}>{deck.title}</h3>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#64748b' }}>
                  <span>📍 {deck.location}</span>
                  <span style={{ fontWeight: 600, color: '#325288' }}>{deck.condition}</span>
                </div>

                <p style={{ fontSize: '0.9rem', color: '#475569', margin: '8px 0', lineHeight: 1.4 }}>{deck.description}</p>

                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', fontSize: '0.85rem', border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div>🚚 <strong>Courier:</strong> {deck.courier} (Cost: £{deck.shippingCost})</div>
                  {deck.qrTracking && <div>📱 <strong>Tracking:</strong> Delivery QR Code Active</div>}
                  {deck.collectionAddress && <div style={{ color: '#15803d' }}>🏠 <strong>Pickup Address:</strong> {deck.collectionAddress}</div>}
                  {deck.customShippingRules && <div style={{ color: '#b45309' }}>📦 <strong>Shipping Rules:</strong> {deck.customShippingRules}</div>}
                </div>
              </div>

              <div className="deck-meta-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '10px', marginTop: 'auto' }}>
                <span style={{ fontWeight: 800, color: '#114E60', fontSize: '1.3rem' }}>£{deck.price}</span>
                <a href={`mailto:${deck.sellerEmail}?subject=Inquiry about ${encodeURIComponent(deck.title)}`} style={{ textDecoration: 'none', background: '#325288', color: '#fff', padding: '6px 14px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
                  Contact Seller
                </a>
              </div>

              <DeleteListingButton itemId={deck.id} setListingsState={setListings} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  // 💰 3. Form Submission Creation Page
  const SellView = () => {
    return (
      <form onSubmit={handleCreateListingSubmit} style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'left', backgroundColor: '#fff', padding: '24px', borderRadius: '8px', border: '1px solid #F4EEE8' }}>
        <h2 style={{ color: '#114E60', marginTop: 0, marginBottom: '4px', fontWeight: 800 }}>Create New Marketplace Entry</h2>
        <p style={{ color: '#64748b', marginBottom: '16px', fontSize: '0.9rem' }}>Database Registry Size: {currentCount} Active Items.</p>

        <div className="form-group" style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontWeight: 600, color: '#114E60', marginBottom: '6px' }}>Marketplace Category *</label>
          <select value={newCategory} onChange={e => setNewCategory(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box', fontSize: '1rem' }}>
            <option value="Tarot">🔮 Tarot Decks</option>
            <option value="Trading Cards">🃏 Trading Cards</option>
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontWeight: 600, color: '#114E60', marginBottom: '6px' }}>Item Title *</label>
          <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Vintage Tarot Deck / Rare TCG Card" required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
        </div>

        {newCategory === 'Trading Cards' && (
          <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '6px', border: '1px solid #bbf7d0', marginBottom: '16px', fontSize: '0.85rem', color: '#166534' }}>
            ⚡ <strong>TCG Custom Rules:</strong> Listings must specify card grading profiles (PSA, BGS, or raw sleeve conditions) inside descriptions.
          </div>
        )}

        <div className="form-group" style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontWeight: 600, color: '#114E60', marginBottom: '6px' }}>Gallery Photos (Max 3 Images) *</label>
          <MultiImageUploader imagesArray={newImage} setImagesArray={setNewImage} />
        </div>

        <div className="form-group" style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontWeight: 600, color: '#114E60', marginBottom: '6px' }}>Price (£) *</label>
          <input type="number" value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="45" required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
        </div>

        <div className="form-group" style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontWeight: 600, color: '#114E60', marginBottom: '6px' }}>Your Contact Email *</label>
          <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="yourname@example.com" required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
        </div>

        <div className="form-group" style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontWeight: 600, color: '#114E60', marginBottom: '6px' }}>General Location City Address</label>
          <input type="text" value={newLoc} onChange={e => setNewLoc(e.target.value)} placeholder="e.g. London, UK / Manchester Hub" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
        </div>

        <SafeShippingManager selectedCourier={shipCourier} setSelectedCourier={setShipCourier} shippingPrice={shipCost} setShippingPrice={setShipCost} useQrCodeTracking={qrTrackingToggle} setUseQrCodeTracking={setqrTrackingToggle} />
        <ExtraShippingDetailsManager rulesType={extraInstructionType} setRulesType={setExtraInstructionType} detailsText={extraInstructionText} setDetailsText={setExtraInstructionText} />

        <div className="form-group" style={{ marginTop: '16px', marginBottom: '16px' }}>
          <label style={{ display: 'block', fontWeight: 600, color: '#114E60', marginBottom: '6px' }}>Condition Grading Quality</label>
          <select value={newCondition} onChange={e => setNewCondition(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}>
            <option value="Mint">Mint (Perfect Pack Fresh)</option>
            <option value="Like New">Like New (Minimal Wear)</option>
            <option value="Good">Good (Lightly Played)</option>
            <option value="Fair">Fair (Heavy Card Scratches)</option>
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', fontWeight: 600, color: '#114E60', marginBottom: '6px' }}>Item Details & Description</label>
          <textarea rows={3} value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Provide full card context details..." style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box', resize: 'vertical' }} />
        </div>

        <button type="submit" style={{ width: '100%', padding: '14px', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', backgroundColor: '#325288' }}>
          Publish Marketplace Listing
        </button>
      </form>
    );
  };

  return (
    <div style={{ fontFamily: 'sans-serif', minHeight: '100vh', backgroundColor: '#fdfbf7' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 30px', borderBottom: '1px solid #F4EEE8', backgroundColor: '#fff' }}>
        <div onClick={() => setCurrentView('Listings')} style={{ fontWeight: 900, fontSize: '1.5rem', color: '#114E60', cursor: 'pointer' }}>ARKANA</div>
        <nav style={{ display: 'flex', gap: '16px' }}>
          <button onClick={() => setCurrentView('Listings')} style={{ background: 'none', border: 'none', color: currentView === 'Listings' ? '#114E60' : '#64748b', fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}>Browse Catalog</button>
          <button onClick={() => setCurrentView('Sell')} style={{ background: 'none', border: 'none', color: currentView === 'Sell' ? '#114E60' : '#64748b', fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}>+ List Item</button>
        </nav>
      </header>

      <main style={{ padding: '40px 20px', maxWidth: '1200px', margin: '0 auto' }}>
        {currentView === 'Listings' && <ListingsView />}
        {currentView === 'Sell' && <SellView />}
      </main>
    </div>
  );
}
5

// ========================================================
// 🛠️ STANDALONE UTILITY SUB-COMPONENTS (Appended to end of page)
// ========================================================

const MultiImageUploader = ({ imagesArray = [], setImagesArray }: any) => {
  const handleFile = (e: any) => {
    const files = Array.from(e.target.files || []).filter((f: any) => f.type.startsWith('image/'));
    if (imagesArray.length + files.length > 3) return alert("Maximum 3 gallery images allowed.");

    files.forEach((file: any) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setImagesArray((prev: any) => [...prev, reader.result as string].slice(0, 3));
        }
      };
      reader.readAsDataURL(file);
    });
  };

  return (
    <div style={{ marginTop: '4px' }}>
      <label htmlFor="multi-upload-node" style={{ display: 'block', padding: '12px', backgroundColor: imagesArray.length >= 3 ? '#94a3b8' : '#114E60', color: '#fff', borderRadius: '6px', textAlign: 'center', cursor: 'pointer' }}>
        {imagesArray.length >= 3 ? '🚫 Photo Slots Full (3/3)' : `📸 Select Deck Images (${imagesArray.length}/3)`}
      </label>
      <input id="multi-upload-node" type="file" accept="image/*" multiple disabled={imagesArray.length >= 3} onChange={handleFile} style={{ display: 'none' }} />
      <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
        {imagesArray.map((img: string, idx: number) => (
          <div key={idx} style={{ position: 'relative', width: '70px', height: '70px', borderRadius: '6px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
            <img src={img} alt="Thumb" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <button type="button" onClick={() => setImagesArray((prev: any) => prev.filter((_: any, i: number) => i !== idx))} style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(198,40,40,0.9)', color: '#fff', border: 'none', borderRadius: '50%', width: '16px', height: '16px', fontSize: '9px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
};

const MarketCardGalleryViewer = ({ galleryImages = [] }: any) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const images = galleryImages.length > 0 ? galleryImages : ["🔮"];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
      <div style={{ width: '100%', height: '200px', overflow: 'hidden', borderRadius: '6px', backgroundColor: '#f8fafc', border: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {images[activeIdx].startsWith('data:') ? (
          <img src={images[activeIdx]} alt="Product" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ fontSize: '3rem' }}>{images[activeIdx]}</div>
        )}
      </div>
      {images.length > 1 && (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
          {images.map((thumb: string, idx: number) => (
            <div key={idx} onClick={() => setActiveIdx(idx)} style={{ width: '40px', height: '30px', borderRadius: '4px', overflow: 'hidden', cursor: 'pointer', border: activeIdx === idx ? '2px solid #114E60' : '1px solid #e2e8f0', opacity: activeIdx === idx ? 1 : 0.5 }}>
              {thumb.startsWith('data:') ? <img src={thumb} alt="Mini" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ fontSize: '0.75rem', textAlign: 'center', lineHeight: '30px' }}>{thumb}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const SafeShippingManager = ({ selectedCourier, setSelectedCourier, shippingPrice, setShippingPrice, useQrCodeTracking, setUseQrCodeTracking }: any) => {
  return (
    <div style={{ marginTop: '16px', borderTop: '1px solid #F4EEE8', paddingTop: '16px' }}>
      <label style={{ display: 'block', fontWeight: 600, color: '#114E60', marginBottom: '8px' }}>Delivery Method Selection</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
        <button type="button" onClick={() => { setSelectedCourier('Royal Mail'); setShippingPrice('4.45'); }} style={{ padding: '10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, border: '1px solid #325288', background: selectedCourier === 'Royal Mail' ? '#325288' : '#fff', color: selectedCourier === 'Royal Mail' ? '#fff' : '#325288' }}>✉️ Royal Mail</button>
        <button type="button" onClick={() => { setSelectedCourier('Evri'); setShippingPrice('3.20'); }} style={{ padding: '10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, border: '1px solid #325288', background: selectedCourier === 'Evri' ? '#325288' : '#fff', color: selectedCourier === 'Evri' ? '#fff' : '#325288' }}>📦 Evri Tracked</button>
        <button type="button" onClick={() => { setSelectedCourier('Collection'); setShippingPrice('0.00'); }} style={{ padding: '10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, border: '1px solid #325288', background: selectedCourier === 'Collection' ? '#325288' : '#fff', color: selectedCourier === 'Collection' ? '#fff' : '#325288' }}>🤝 Pickup</button>
      </div>
      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Courier Shipping Cost (£)</label>
        <input type="number" step="0.01" value={shippingPrice} onChange={(e) => setShippingPrice(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
        <input id="tracking-qr-manifest" type="checkbox" checked={useQrCodeTracking} onChange={(e) => setUseQrCodeTracking(e.target.checked)} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
        <label htmlFor="tracking-qr-manifest" style={{ fontSize: '0.85rem', color: '#114E60', fontWeight: 600, cursor: 'pointer' }}>📱 Generate Tracking QR Code label receipts</label>
      </div>
    </div>
  );
};

const ExtraShippingDetailsManager = ({ rulesType, setRulesType, detailsText, setDetailsText }: any) => {
  return (
    <div style={{ marginTop: '16px' }}>
      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>➕ Specific Delivery Address or Packaging Instructions</label>
      <select value={rulesType} onChange={(e) => { setRulesType(e.target.value); if (e.target.value === 'none') setDetailsText(''); }} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', marginBottom: '8px', boxSizing: 'border-box' }}>
        <option value="none">No extra instructions required</option>
        <option value="collection">🏠 Add Specific Physical Pickup Address</option>
        <option value="shipping">📦 Add Custom Courier Packing Guidelines</option>
      </select>
      {rulesType !== 'none' && (
        <textarea rows={2} value={detailsText} onChange={(e) => setDetailsText(e.target.value)} placeholder={rulesType === 'collection' ? "e.g. Collection from 123 High Street..." : "e.g. Shipped inside cardboard sleeves..."} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box', fontSize: '0.9rem', resize: 'vertical' }} />
      )}
    </div>
  );
};

const DeleteListingButton = ({ itemId, setListingsState }: any) => {
  const handleDelete = () => {
    if (!window.confirm("Are you sure you want to permanently clear this item row?")) return;
    setListingsState((prev: any) => prev.filter((item: any) => item.id !== itemId));
    alert("Listing successfully deleted.");
  };
  return (
    <button type="button" onClick={handleDelete} style={{ padding: '10px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', marginTop: '6px', width: '100%' }}>
      🗑️ Delete Entry Listing
    </button>
  );
};
