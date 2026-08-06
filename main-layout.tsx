import React, { useEffect, useState } from 'react';

const categories = [
  { title: 'Jewelry', subtitle: 'Hand-finished heirlooms' },
  { title: 'Home', subtitle: 'Quiet luxury essentials' },
  { title: 'Fashion', subtitle: 'Curated seasonal picks' },
  { title: 'Wellness', subtitle: 'Calm daily rituals' },
];

const featuredItems = [
  { name: 'Aurora Pendant', price: '$168', badge: 'Bestseller' },
  { name: 'Linen Lounge Set', price: '$124', badge: 'New' },
  { name: 'Golden Candle', price: '$42', badge: 'Limited' },
];

const defaultMaxAllowedListings = 3;
const extraListingCost = 0.5;
const extraListingSlotBoost = 3;

type ListingQuotaState = {
  activeListings: number;
  maxAllowedListings: number;
  publishMessage: string;
  paymentMessage: string;
};

const listingDatabase = {
  'demo-user': {
    activeListings: 3,
    maxAllowedListings: defaultMaxAllowedListings,
  },
};

const supabaseSchemaSql = `
create table if not exists profiles (
  id uuid primary key,
  max_allowed_listings integer not null default 3
);
`;

const validateListingSubmission = async (userId = 'demo-user') => {
  const profile = listingDatabase[userId as keyof typeof listingDatabase] ?? {
    activeListings: 0,
    maxAllowedListings: defaultMaxAllowedListings,
  };

  const liveAvailableItems = profile.activeListings;
  const isAllowed = liveAvailableItems < profile.maxAllowedListings;

  return {
    isAllowed,
    liveAvailableItems,
    maxAllowedListings: profile.maxAllowedListings,
    reason: isAllowed ? null : 'Live available listings have reached the allowance.',
  };
};

const fetchListingQuota = async (userId = 'demo-user') => {
  const record = listingDatabase[userId as keyof typeof listingDatabase] ?? {
    activeListings: 0,
    maxAllowedListings: defaultMaxAllowedListings,
  };

  return {
    activeListings: record.activeListings,
    maxAllowedListings: record.maxAllowedListings,
  };
};

const shippingOptions = [
  { id: 'evri', label: 'Evri Standard', price: 2.99, eta: '2-3 working days' },
  { id: 'royal-48', label: 'Royal Mail Tracked 48', price: 3.65, eta: 'Tracked delivery in 2 days' },
  { id: 'royal-24', label: 'Royal Mail Tracked 24', price: 4.65, eta: 'Tracked delivery next day' },
];

const packingSteps = [
  'Scan the QR code and open the seller packing brief on your phone.',
  'Place the item inside a clean protective pouch or mailer.',
  'Add a padded layer to keep the product safe in transit.',
  'Seal the parcel and attach the courier label to the front.',
  'Place the package in the pickup-ready area for collection.',
  'Confirm the order as packed and send the dispatch update.',
];

type GuestBasketItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
};

type GuestCheckoutStep = 'browse' | 'checkout' | 'thanks';

const guestBasketStorageKey = 'arkana-guest-basket';
const tarotDeck = {
  id: 'moon-tarot-deck',
  name: 'Moon Tarot Deck',
  price: 34.95,
};

const isValidUkPostcode = (value: string) => {
  const postcode = value.trim().toUpperCase();
  return /^(GIR 0AA|[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2})$/.test(postcode);
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value);

export default function MainLayout() {
  const [selectedShipping, setSelectedShipping] = useState(shippingOptions[1].id);
  const [quota, setQuota] = useState<ListingQuotaState>({
    activeListings: 0,
    maxAllowedListings: defaultMaxAllowedListings,
    publishMessage: 'Checking listing allowance…',
    paymentMessage: '',
  });
  const [guestBasket, setGuestBasket] = useState<GuestBasketItem[]>([]);
  const [guestCheckoutStep, setGuestCheckoutStep] = useState<GuestCheckoutStep>('browse');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPostcode, setGuestPostcode] = useState('');
  const [guestPassword, setGuestPassword] = useState('');
  const [guestFeedback, setGuestFeedback] = useState('');
  const [guestConversionMessage, setGuestConversionMessage] = useState('');

  const itemSubtotal = 64.95;
  const selectedOption = shippingOptions.find((option) => option.id === selectedShipping) ?? shippingOptions[1];
  const total = itemSubtotal + selectedOption.price;
  const canPublish = quota.activeListings < quota.maxAllowedListings;

  useEffect(() => {
    const loadQuota = async () => {
      const result = await fetchListingQuota();
      setQuota((current) => ({
        ...current,
        activeListings: result.activeListings,
        maxAllowedListings: result.maxAllowedListings,
        publishMessage: result.activeListings < result.maxAllowedListings
          ? 'Free publishing is available for this account.'
          : 'You have reached the free listing limit. Add a 50p bundle to publish more.',
      }));
    };

    void loadQuota();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const storedBasket = window.localStorage.getItem(guestBasketStorageKey);
    if (!storedBasket) {
      return;
    }

    try {
      const parsedBasket = JSON.parse(storedBasket) as GuestBasketItem[];
      if (Array.isArray(parsedBasket)) {
        setGuestBasket(parsedBasket);
      }
    } catch {
      window.localStorage.removeItem(guestBasketStorageKey);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(guestBasketStorageKey, JSON.stringify(guestBasket));
  }, [guestBasket]);

  const handlePublishListing = async () => {
    const validation = await validateListingSubmission();

    if (!validation.isAllowed) {
      setQuota((current) => ({
        ...current,
        publishMessage: 'Submission blocked. Use the 50p bundle to unlock more slots.',
      }));
      return;
    }

    setQuota((current) => ({
      ...current,
      activeListings: current.activeListings + 1,
      publishMessage: 'Listing published successfully. Your active count has increased.',
    }));
  };

  const routeToStripeMicrotransaction = async () => {
    setQuota((current) => ({
      ...current,
      paymentMessage: 'Redirecting to Stripe Checkout for the 50p bundle…',
    }));

    await new Promise((resolve) => setTimeout(resolve, 700));

    setQuota((current) => ({
      ...current,
      paymentMessage: 'Stripe webhook received. Added +3 listing slots.',
    }));
  };

  const handleStripeWebhookSuccess = async () => {
    const stripeMetadataPayload = {
      user_id: 'demo-user',
      increment: 'max_allowed_listings + 3',
      amount: extraListingCost,
      currency: 'gbp',
      success: true,
    };

    setQuota((current) => ({
      ...current,
      maxAllowedListings: current.maxAllowedListings + extraListingSlotBoost,
      publishMessage: 'Bundle purchased. You now have 3 extra listing slots.',
    }));

    await routeToStripeMicrotransaction();

    console.info('Stripe Checkout metadata payload', stripeMetadataPayload);
  };

  const addTarotDeckToBasket = () => {
    setGuestBasket((current) => {
      const existing = current.find((item) => item.id === tarotDeck.id);
      if (existing) {
        return current.map((item) =>
          item.id === tarotDeck.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }

      return [...current, { ...tarotDeck, quantity: 1 }];
    });

    setGuestFeedback('Moon Tarot Deck added to your guest basket.');
  };

  const handleGuestCheckoutSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!guestEmail.trim() || !guestPostcode.trim() || !isValidUkPostcode(guestPostcode)) {
      setGuestFeedback('Please provide a valid email and a UK postcode to continue.');
      return;
    }

    const basketTotal = guestBasket.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const checkoutTotal = basketTotal + selectedOption.price;
    const sellerPayoutPayload = {
      seller_id: 'seller-001',
      amount: checkoutTotal,
      currency: 'gbp',
      customer_email: guestEmail.trim(),
      uk_postcode: guestPostcode.trim(),
      destination: 'seller-stripe-balance',
    };

    console.info('Guest checkout payout payload', sellerPayoutPayload);
    setGuestFeedback('Guest checkout complete. Your payment is routed to the seller balance.');
    setGuestCheckoutStep('thanks');
  };

  const handleGuestAccountConversion = (event: React.FormEvent) => {
    event.preventDefault();

    if (!guestPassword.trim()) {
      setGuestConversionMessage('Optional: add a password to turn this session into a free Arkana account.');
      return;
    }

    if (guestPassword.trim().length < 6) {
      setGuestConversionMessage('Please choose a password with at least 6 characters.');
      return;
    }

    setGuestConversionMessage('Guest session converted to a free Arkana account.');
  };

  const basketTotal = guestBasket.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const guestCheckoutTotal = basketTotal + selectedOption.price;

  return (
    <div className="marketplace-page">
      <style>{`
        :root {
          color-scheme: light;
          --bg: #fcfbf7;
          --surface: #ffffff;
          --surface-soft: #f7f3ea;
          --text: #1f1a16;
          --muted: #6f675f;
          --accent: #c8a24a;
          --accent-strong: #a77f2b;
          --border: #ece4d8;
        }

        * { box-sizing: border-box; }
        body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }

        .marketplace-page {
          min-height: 100vh;
          background: linear-gradient(180deg, #fffdf8 0%, var(--bg) 100%);
          padding: 24px;
          color: var(--text);
        }

        .shell {
          max-width: 1280px;
          margin: 0 auto;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 28px;
          box-shadow: 0 30px 80px rgba(31, 26, 22, 0.06);
          overflow: hidden;
        }

        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 22px 32px;
          background: var(--surface);
          border-bottom: 1px solid var(--border);
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          font-size: 0.95rem;
        }

        .brand-mark {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--accent), #f0d590);
          display: grid;
          place-items: center;
          color: white;
          font-weight: 800;
        }

        .nav-links {
          display: flex;
          gap: 20px;
          color: var(--muted);
          font-size: 0.95rem;
        }

        .header-actions {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .pill-btn,
        .ghost-btn {
          border-radius: 999px;
          padding: 10px 16px;
          font-weight: 600;
          border: 1px solid transparent;
          cursor: pointer;
          transition: transform 180ms ease, box-shadow 180ms ease;
        }

        .pill-btn:hover,
        .ghost-btn:hover {
          transform: translateY(-1px);
        }

        .pill-btn {
          background: var(--accent);
          color: white;
          box-shadow: 0 10px 20px rgba(200, 162, 74, 0.22);
        }

        .ghost-btn {
          background: var(--surface);
          color: var(--text);
          border-color: var(--border);
        }

        .hero {
          display: grid;
          grid-template-columns: 1.15fr 0.85fr;
          gap: 28px;
          padding: 36px 32px 32px;
          background: linear-gradient(120deg, #ffffff 0%, #fcf8ef 100%);
        }

        .hero-copy {
          padding: 10px 4px;
        }

        .eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 999px;
          background: #fff8e6;
          color: var(--accent-strong);
          font-size: 0.82rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 16px;
        }

        h1 {
          font-size: clamp(2rem, 3vw, 3rem);
          line-height: 1.08;
          margin: 0 0 14px;
          letter-spacing: -0.03em;
        }

        .hero-copy p {
          font-size: 1rem;
          line-height: 1.7;
          color: var(--muted);
          max-width: 560px;
          margin: 0 0 24px;
        }

        .cta-row {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 24px;
        }

        .stats-row {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }

        .stat-card {
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 14px;
          background: var(--surface);
        }

        .stat-card strong {
          display: block;
          font-size: 1rem;
          color: var(--text);
          margin-bottom: 4px;
        }

        .stat-card span {
          color: var(--muted);
          font-size: 0.86rem;
        }

        .hero-visual {
          display: grid;
          gap: 12px;
        }

        .feature-card {
          border: 1px solid var(--border);
          border-radius: 22px;
          padding: 18px;
          background: var(--surface);
          box-shadow: 0 12px 30px rgba(31, 26, 22, 0.04);
        }

        .feature-card.top {
          background: linear-gradient(135deg, #fffdf8 0%, #f8efe0 100%);
        }

        .feature-card h3 {
          margin: 0 0 6px;
          font-size: 1rem;
        }

        .feature-card p {
          margin: 0;
          color: var(--muted);
          line-height: 1.6;
        }

        .card-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
          margin-top: 10px;
        }

        .mini-card {
          padding: 16px;
          border-radius: 18px;
          background: #fff;
          border: 1px solid var(--border);
        }

        .mini-card .label {
          display: inline-block;
          font-size: 0.76rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--accent-strong);
          font-weight: 700;
          margin-bottom: 8px;
        }

        .mini-card strong {
          display: block;
          margin-bottom: 6px;
        }

        .mini-card span {
          color: var(--muted);
          font-size: 0.9rem;
        }

        .section {
          padding: 0 32px 34px;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .section-header h2 {
          margin: 0;
          font-size: 1.12rem;
        }

        .section-header a {
          color: var(--accent-strong);
          text-decoration: none;
          font-weight: 600;
        }

        .category-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 16px;
        }

        .category-card {
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 18px;
          background: var(--surface-soft);
        }

        .category-card h3 {
          margin: 0 0 6px;
          font-size: 1rem;
        }

        .category-card p {
          margin: 0;
          color: var(--muted);
          line-height: 1.5;
          font-size: 0.92rem;
        }

        .featured-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }

        .product-card {
          border: 1px solid var(--border);
          border-radius: 22px;
          padding: 16px;
          background: var(--surface);
        }

        .product-media {
          height: 132px;
          border-radius: 16px;
          background: linear-gradient(135deg, #f9eecf 0%, #fff 100%);
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent-strong);
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .product-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 10px;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          padding: 6px 10px;
          border-radius: 999px;
          background: #fff8e6;
          color: var(--accent-strong);
          font-size: 0.76rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .price {
          font-weight: 700;
          color: var(--text);
        }

        .delivery-layout {
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap: 16px;
        }

        .delivery-card,
        .seller-card {
          border: 1px solid var(--border);
          border-radius: 22px;
          padding: 18px;
          background: var(--surface);
        }

        .shipping-option {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          border: 1px solid var(--border);
          border-radius: 16px;
          margin-bottom: 10px;
          cursor: pointer;
          background: var(--surface);
        }

        .shipping-option.active {
          border-color: var(--accent);
          background: #fff8e6;
        }

        .shipping-option strong {
          display: block;
          margin-bottom: 2px;
        }

        .shipping-option span {
          color: var(--muted);
          font-size: 0.9rem;
        }

        .summary-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          color: var(--muted);
        }

        .summary-row.total {
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid var(--border);
          font-weight: 700;
          color: var(--text);
        }

        .qr-box {
          margin-top: 12px;
          border-radius: 18px;
          background: linear-gradient(135deg, #fff9e8 0%, #f8efde 100%);
          border: 1px dashed var(--accent);
          padding: 14px;
          text-align: center;
          color: var(--accent-strong);
          font-weight: 700;
        }

        .packing-list {
          padding-left: 18px;
          color: var(--muted);
          line-height: 1.8;
        }

        @media (max-width: 920px) {
          .hero {
            grid-template-columns: 1fr;
          }

          .category-grid,
          .featured-grid,
          .delivery-layout {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 640px) {
          .marketplace-page { padding: 12px; }
          .topbar, .hero, .section { padding-left: 16px; padding-right: 16px; }
          .topbar { flex-direction: column; gap: 12px; align-items: flex-start; }
          .nav-links { flex-wrap: wrap; }
          .stats-row,
          .category-grid,
          .featured-grid,
          .delivery-layout {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="shell">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark">A</div>
            <span>Arkana Market</span>
          </div>

          <nav className="nav-links">
            <span>Shop</span>
            <span>Collections</span>
            <span>Stories</span>
            <span>About</span>
          </nav>

          <div className="header-actions">
            <button className="ghost-btn">Sign in</button>
            <button className="pill-btn">Start shopping</button>
          </div>
        </header>

        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">✨ Curated light luxury</div>
            <h1>Discover elevated essentials in a bright, modern marketplace.</h1>
            <p>
              Thoughtfully selected pieces for the home, wardrobe, and everyday rituals — designed to feel calm,
              polished, and unmistakably premium.
            </p>

            <div className="cta-row">
              <button className="pill-btn">Explore the collection</button>
              <button className="ghost-btn">View best sellers</button>
            </div>

            <div className="stats-row">
              <div className="stat-card">
                <strong>4.9/5</strong>
                <span>Average customer rating</span>
              </div>
              <div className="stat-card">
                <strong>24h</strong>
                <span>Fast dispatch</span>
              </div>
              <div className="stat-card">
                <strong>100%</strong>
                <span>Handpicked goods</span>
              </div>
            </div>
          </div>

          <div className="hero-visual">
            <div className="feature-card top">
              <h3>Featured drop</h3>
              <p>Soft sculptural forms, warm metallics, and timeless texture in one refined edit.</p>
            </div>

            <div className="card-grid">
              <div className="mini-card">
                <span className="label">New arrival</span>
                <strong>Marble + gold tray</strong>
                <span>Elevated hosting essentials</span>
              </div>
              <div className="mini-card">
                <span className="label">Editor’s pick</span>
                <strong>Velvet lounge chair</strong>
                <span>Comfort-first statement</span>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-header">
            <h2>UK shipping selection</h2>
            <a href="#">Secure checkout</a>
          </div>

          <div className="delivery-layout">
            <div className="delivery-card">
              <h3>Item display & courier choice</h3>
              <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
                This item is ready to ship in the UK with fixed courier paths and automatic postage math.
              </p>

              <div className="product-card" style={{ marginTop: 12 }}>
                <div className="product-media">Aurora Pendant</div>
                <div className="badge">Ready to dispatch</div>
                <div className="product-meta">
                  <strong>Hand-finished pendant</strong>
                  <span className="price">{formatCurrency(itemSubtotal)}</span>
                </div>
              </div>

              {shippingOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`shipping-option ${selectedShipping === option.id ? 'active' : ''}`}
                  onClick={() => setSelectedShipping(option.id)}
                  style={{ width: '100%', textAlign: 'left' }}
                >
                  <div>
                    <strong>{option.label}</strong>
                    <span>{option.eta}</span>
                  </div>
                  <strong>{formatCurrency(option.price)}</strong>
                </button>
              ))}
            </div>

            <div className="delivery-card">
              <h3>Checkout summary</h3>
              <div className="summary-row">
                <span>Item subtotal</span>
                <span>{formatCurrency(itemSubtotal)}</span>
              </div>
              <div className="summary-row">
                <span>Postage</span>
                <span>{formatCurrency(selectedOption.price)}</span>
              </div>
              <div className="summary-row total">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
              <button className="pill-btn" style={{ marginTop: 12, width: '100%' }}>
                Confirm order
              </button>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-header">
            <h2>Listing bundle system</h2>
            <a href="#">Publishing rules</a>
          </div>

          <div className="delivery-layout">
            <div className="delivery-card">
              <h3>Active listing quota</h3>
              <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
                Each account starts with {defaultMaxAllowedListings} free listing slots. The publish flow checks the database count before submission.
              </p>
              <div className="summary-row">
                <span>Active listings</span>
                <span>{quota.activeListings}</span>
              </div>
              <div className="summary-row">
                <span>Max allowed</span>
                <span>{quota.maxAllowedListings}</span>
              </div>
              <div className="summary-row total">
                <span>Status</span>
                <span>{canPublish ? 'Free publish enabled' : 'Limit reached'}</span>
              </div>
              <button className="pill-btn" style={{ marginTop: 12, width: '100%' }} onClick={handlePublishListing}>
                {canPublish ? 'Publish listing' : 'Publish Extra Listing (50p)'}
              </button>
              <p style={{ color: 'var(--muted)', marginTop: 10 }}>{quota.publishMessage}</p>
            </div>

            <div className="delivery-card">
              <h3>50p extra listing bundle</h3>
              <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
                When the free slot allowance is exhausted, sellers can unlock an extra bundle for 50p and receive +3 more listing slots.
              </p>
              <div className="summary-row">
                <span>Bundle price</span>
                <span>{formatCurrency(extraListingCost)}</span>
              </div>
              <div className="summary-row">
                <span>Bonus slots</span>
                <span>+{extraListingSlotBoost}</span>
              </div>
              <button className="pill-btn" style={{ marginTop: 12, width: '100%' }} onClick={handleStripeWebhookSuccess}>
                Publish Extra Listing (50p)
              </button>
              <p style={{ color: 'var(--muted)', marginTop: 10 }}>{quota.paymentMessage}</p>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-header">
            <h2>Guest checkout path</h2>
            <a href="#">No password required</a>
          </div>

          <div className="delivery-layout">
            <div className="delivery-card">
              <h3>Anonymous basket</h3>
              <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
                Anonymous visitors can add a tarot deck to a temporary basket stored in the browser, then continue straight to checkout.
              </p>
              <div className="product-card" style={{ marginTop: 12 }}>
                <div className="product-media">Moon Tarot Deck</div>
                <div className="badge">Guest ready</div>
                <div className="product-meta">
                  <strong>{tarotDeck.name}</strong>
                  <span className="price">{formatCurrency(tarotDeck.price)}</span>
                </div>
              </div>
              <div className="summary-row" style={{ marginTop: 12 }}>
                <span>Basket items</span>
                <span>{guestBasket.reduce((count, item) => count + item.quantity, 0)}</span>
              </div>
              <button className="pill-btn" style={{ marginTop: 10, width: '100%' }} onClick={addTarotDeckToBasket}>
                Add to basket
              </button>
              <button className="ghost-btn" style={{ marginTop: 8, width: '100%' }} onClick={() => setGuestCheckoutStep('checkout')}>
                Proceed to guest checkout
              </button>
              {guestFeedback ? <p style={{ color: 'var(--muted)', marginTop: 10 }}>{guestFeedback}</p> : null}
            </div>

            <div className="delivery-card">
              {guestCheckoutStep === 'checkout' ? (
                <form onSubmit={handleGuestCheckoutSubmit}>
                  <h3>Checkout details</h3>
                  <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
                    We keep the flow frictionless by skipping password screens and collecting only the essentials.
                  </p>
                  <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                    <input
                      type="email"
                      value={guestEmail}
                      onChange={(event) => setGuestEmail(event.target.value)}
                      placeholder="Email address"
                      style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border)' }}
                      required
                    />
                    <input
                      type="text"
                      value={guestPostcode}
                      onChange={(event) => setGuestPostcode(event.target.value)}
                      placeholder="UK postcode"
                      style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border)' }}
                      required
                    />
                  </div>
                  <div className="summary-row" style={{ marginTop: 12 }}>
                    <span>Deck total</span>
                    <span>{formatCurrency(basketTotal || tarotDeck.price)}</span>
                  </div>
                  <div className="summary-row">
                    <span>Shipping</span>
                    <span>{formatCurrency(selectedOption.price)}</span>
                  </div>
                  <div className="summary-row total">
                    <span>Checkout total</span>
                    <span>{formatCurrency(guestCheckoutTotal)}</span>
                  </div>
                  <button className="pill-btn" style={{ marginTop: 12, width: '100%' }} type="submit">
                    Pay and finish
                  </button>
                </form>
              ) : guestCheckoutStep === 'thanks' ? (
                <div>
                  <h3>Thank you</h3>
                  <p style={{ color: 'var(--muted)', lineHeight: 1.7 }}>
                    Your order is confirmed and the checkout total has been routed to the seller balance.
                  </p>
                  <div className="qr-box">Guest session complete • Secure handoff • Free account optional</div>
                  <form onSubmit={handleGuestAccountConversion} style={{ marginTop: 12 }}>
                    <input
                      type="password"
                      value={guestPassword}
                      onChange={(event) => setGuestPassword(event.target.value)}
                      placeholder="Optional password"
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border)' }}
                    />
                    <button className="ghost-btn" style={{ marginTop: 8, width: '100%' }} type="submit">
                      Convert to free Arkana account
                    </button>
                  </form>
                  {guestConversionMessage ? <p style={{ color: 'var(--muted)', marginTop: 10 }}>{guestConversionMessage}</p> : null}
                </div>
              ) : (
                <div>
                  <h3>Guest checkout is ready</h3>
                  <p style={{ color: 'var(--muted)', lineHeight: 1.7 }}>
                    No sign-in required. Add a tarot deck to your anonymous basket, then continue with a simple email and postcode form.
                  </p>
                  <div className="summary-row" style={{ marginTop: 12 }}>
                    <span>Selected shipping</span>
                    <span>{selectedOption.label}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-header">
            <h2>Shop by category</h2>
            <a href="#">See all</a>
          </div>

          <div className="category-grid">
            {categories.map((category) => (
              <div className="category-card" key={category.title}>
                <h3>{category.title}</h3>
                <p>{category.subtitle}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-header">
            <h2>Featured marketplace picks</h2>
            <a href="#">Browse more</a>
          </div>

          <div className="featured-grid">
            {featuredItems.map((item) => (
              <div className="product-card" key={item.name}>
                <div className="product-media">{item.name}</div>
                <div className="badge">{item.badge}</div>
                <div className="product-meta">
                  <strong>{item.name}</strong>
                  <span className="price">{item.price}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-header">
            <h2>Seller order view</h2>
            <a href="#">Packing guide</a>
          </div>

          <div className="delivery-layout">
            <div className="seller-card">
              <h3>Smartphone QR packing guide</h3>
              <div className="qr-box">Scan QR • Packing checklist • Dispatch ready</div>
              <ol className="packing-list">
                {packingSteps.map((step, index) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>

            <div className="seller-card">
              <h3>Ready for fulfilment</h3>
              <p style={{ color: 'var(--muted)', lineHeight: 1.7 }}>
                The selected UK courier path is already attached to the order so the seller can pack and dispatch without extra steps.
              </p>
              <div className="summary-row">
                <span>Courier</span>
                <span>{selectedOption.label}</span>
              </div>
              <div className="summary-row">
                <span>Shipping cost</span>
                <span>{formatCurrency(selectedOption.price)}</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
