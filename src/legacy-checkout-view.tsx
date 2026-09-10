// LEGACY REFERENCE COPY — the "Delivery and payment" checkout screen, preserved exactly as it
// currently exists in main-layout.tsx (CheckoutViewIntegrated). Not imported/rendered anywhere;
// kept here purely so this version can be restored or diffed against later if the live checkout
// screen changes. The active component in src/main-layout.tsx is untouched by this file.
import React, { useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { createOrderCheckout } from './lib/order-checkout';
import { createPayPalOrder } from './lib/paypal';
import { getRuntimeConfig } from './lib/config';
import type { MarketplaceListing } from './lib/listings';

const SHIPPING_FEE = 2.99;
type BasketItem = MarketplaceListing & { courierFee: number };

export const LegacyCheckoutViewIntegrated: React.FC<{ basket: BasketItem[]; onRemoveFromBasket: (listingId: string) => void; onSignIn: () => void; onOpenLegal: (page: 'terms' | 'privacy') => void; onFlashMessage: (message: string) => void }> = ({ basket, onRemoveFromBasket, onSignIn, onFlashMessage }) => {
    type PaymentGateway = 'stripe' | 'paypal';
    const [selectedGateway, setSelectedGateway] = React.useState<PaymentGateway>('stripe');
    const [postcode, setPostcode] = React.useState<string>('');
    const [isPostcodeValid, setIsPostcodeValid] = React.useState<boolean>(true);
    const [fullName, setFullName] = React.useState<string>('');
    const [email, setEmail] = React.useState<string>('');
    const [addressLineOne, setAddressLineOne] = React.useState<string>('');
    const [addressLineTwo, setAddressLineTwo] = React.useState<string>('');
    const [townOrCity, setTownOrCity] = React.useState<string>('');
    const [termsAccepted, setTermsAccepted] = React.useState<boolean>(false);
    const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
    const [checkoutError, setCheckoutError] = React.useState<string | null>(null);
    const [deliveryReference] = React.useState(() => `ARK-${Date.now().toString().slice(-6)}`);
    const runtimeConfig = getRuntimeConfig();

    const handleRequiredFieldInvalid = (event: React.FormEvent<HTMLInputElement | HTMLSelectElement>) => {
        event.currentTarget.classList.add('field-border-error');
        event.currentTarget.closest('label')?.classList.add('field-error');
    };

    const handleRequiredFieldInput = (event: React.FormEvent<HTMLInputElement | HTMLSelectElement>) => {
        if (event.currentTarget.value.trim()) {
            event.currentTarget.classList.remove('field-border-error');
            event.currentTarget.closest('label')?.classList.remove('field-error');
        }
    };

    // Validate UK Postcode format
    const handlePostcodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.toUpperCase();
        setPostcode(val);
        const ukPostcodeRegex = /^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$/;
        setIsPostcodeValid(val === '' || ukPostcodeRegex.test(val));
    };

    const basketItems = basket;
    const paymentMethod = selectedGateway;
    const activeSellerId = useMemo(() => basketItems?.[0]?.sellerId, [basketItems]);
    const activeCheckoutItems = useMemo(() => basketItems.filter((item) => item.sellerId === basketItems[0]?.sellerId), [basketItems]);
    const subtotal = useMemo(() => activeCheckoutItems.reduce((sum, item) => sum + item.price, 0), [activeCheckoutItems]);
    const stripeFee = useMemo(() => subtotal * 0.029 + 0.30, [subtotal]);
    const paypalFee = useMemo(() => subtotal * 0.0349 + 0.49, [subtotal]);
    const activeFee = useMemo(() => paymentMethod === 'stripe' ? stripeFee : paypalFee, [paymentMethod, stripeFee, paypalFee]);
    const totalCharged = useMemo(() => subtotal + activeFee + SHIPPING_FEE, [subtotal, activeFee]);
    const deliveryQrValue = JSON.stringify({
        reference: deliveryReference,
        courier: 'Evri Standard',
        postcode: postcode || 'Awaiting postcode',
    });

    const handleCheckoutSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setCheckoutError(null);
        if (!activeCheckoutItems.length || !activeSellerId) {
            setCheckoutError('Your basket is empty. Add a deck before checking out.');
            return;
        }
        if (basket.length > activeCheckoutItems.length) {
            onFlashMessage(`Checking out ${activeCheckoutItems.length} deck(s) from this seller first. The remaining items stay in your basket to check out next.`);
        }
        if (!isPostcodeValid || !postcode || !fullName.trim() || !email.trim() || !addressLineOne.trim() || !townOrCity.trim() || !termsAccepted) {
            setCheckoutError('Complete your delivery details and accept the Terms & Conditions to continue.');
            return;
        }
        if (!runtimeConfig.isSecureMode) {
            setCheckoutError('Secure checkout is unavailable until production payment settings are configured.');
            return;
        }

        setIsSubmitting(true);
        try {
            const checkoutInput = {
                listingIds: activeCheckoutItems.map((item) => item.id),
                shippingOption: 'evri_standard' as const,
                totalCharged,
                transactionFee: activeFee,
                successUrl: `${window.location.origin}/?checkout=success&courier=${encodeURIComponent(deliveryReference)}`,
                deliveryAddress: {
                    name: fullName.trim(),
                    email: email.trim(),
                    addressLineOne: addressLineOne.trim(),
                    addressLineTwo: addressLineTwo.trim() || undefined,
                    city: townOrCity.trim(),
                    postcode: postcode.trim(),
                },
            };
            const response = selectedGateway === 'paypal'
                ? await createPayPalOrder(checkoutInput)
                : await createOrderCheckout(checkoutInput);
            if (!response?.url) throw new Error('Payment session did not return a checkout URL.');
            window.location.assign(response.url);
        } catch (error) {
            setCheckoutError(error instanceof Error ? error.message : 'Checkout could not be created.');
            setIsSubmitting(false);
        }
    };

    return (
        <section className="checkout-page-shell">
            <div className="checkout-page-heading">
                <p className="checkout-page-kicker">Secure checkout</p>
                <h2>Delivery and payment</h2>
                <p>Sign in to protect your purchase, confirm delivery, and keep your order history.</p>
                <button type="button" className="guest-account-link" onClick={onSignIn}>Sign in or create an account</button>
            </div>

            <div className="checkout-page-grid">
                <form onSubmit={handleCheckoutSubmit} className="checkout-details-panel">
                    <div className="checkout-section-heading">
                        <span>1</span>
                        <div><h3>Delivery details</h3><p>Used only for dispatch and order updates.</p></div>
                    </div>
                    <div className="checkout-field-grid">
                        <label className="checkout-field checkout-field-wide">Full name <span className="text-red-500 font-bold ml-0.5">*</span>
                            <input type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} onInvalid={handleRequiredFieldInvalid} onInput={handleRequiredFieldInput} autoComplete="name" required aria-required="true" maxLength={120} placeholder="Your full name" />
                            <span className="field-error-text">This space must be filled in.</span>
                        </label>
                        <label className="checkout-field checkout-field-wide">Email address <span className="text-red-500 font-bold ml-0.5">*</span>
                            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} onInvalid={handleRequiredFieldInvalid} onInput={handleRequiredFieldInput} autoComplete="email" required aria-required="true" maxLength={254} placeholder="you@example.com" />
                            <span className="field-error-text">This space must be filled in.</span>
                        </label>
                        <label className="checkout-field checkout-field-wide">Address line 1 <span className="text-red-500 font-bold ml-0.5">*</span>
                            <input type="text" value={addressLineOne} onChange={(event) => setAddressLineOne(event.target.value)} onInvalid={handleRequiredFieldInvalid} onInput={handleRequiredFieldInput} autoComplete="address-line1" required aria-required="true" maxLength={120} placeholder="House number and street" />
                            <span className="field-error-text">This space must be filled in.</span>
                        </label>
                        <label className="checkout-field checkout-field-wide">Address line 2 <span className="checkout-field-optional">Optional</span>
                            <input type="text" value={addressLineTwo} onChange={(event) => setAddressLineTwo(event.target.value)} autoComplete="address-line2" maxLength={120} placeholder="Flat, building, or area" />
                        </label>
                        <label className="checkout-field">Town or city <span className="text-red-500 font-bold ml-0.5">*</span>
                            <input type="text" value={townOrCity} onChange={(event) => setTownOrCity(event.target.value)} onInvalid={handleRequiredFieldInvalid} onInput={handleRequiredFieldInput} autoComplete="address-level2" required aria-required="true" maxLength={80} placeholder="London" />
                            <span className="field-error-text">This space must be filled in.</span>
                        </label>
                        <label className="checkout-field">Country
                            <input type="text" value="United Kingdom" disabled />
                        </label>
                        <label className="checkout-field">UK postcode <span className="text-red-500 font-bold ml-0.5">*</span>
                            <input type="text" value={postcode} onChange={handlePostcodeChange} onInvalid={handleRequiredFieldInvalid} onInput={handleRequiredFieldInput} required aria-required="true" maxLength={10} placeholder="SW1A 1AA" aria-invalid={!isPostcodeValid} />
                            <span className="field-error-text">This space must be filled in.</span>
                            {!isPostcodeValid && <span className="checkout-validation">Enter a valid UK postcode.</span>}
                        </label>
                    </div>
                    <div className="checkout-section-heading checkout-section-heading--courier">
                        <span>2</span>
                        <div><h3>Delivery service</h3><p>Flat-rate standard delivery is included with this order.</p></div>
                    </div>
                    <p className="checkout-security-note">Evri Standard Drop-off (2-3 Days) — £{SHIPPING_FEE.toFixed(2)}</p>
                    <label className="checkout-terms">
                        <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} onInvalid={handleRequiredFieldInvalid} onInput={handleRequiredFieldInput} required aria-required="true" />
                        <span>I agree to the Terms of Service, Privacy Policy, and Seller Guidelines. <span className="text-red-500 font-bold ml-0.5">*</span></span><span className="field-error-text">This space must be filled in.</span>
                    </label>
                    {checkoutError && <p className="checkout-error" role="alert">{checkoutError}</p>}
                    <div className="payment-gateway-grid" role="radiogroup" aria-label="Choose payment method">
                        {(['stripe', 'paypal'] as const).map((gateway) => (
                            <label key={gateway} className={`payment-gateway-card${selectedGateway === gateway ? ' payment-gateway-card--selected' : ''}`}>
                                <input
                                    type="radio"
                                    name="paymentGateway"
                                    value={gateway}
                                    checked={selectedGateway === gateway}
                                    onChange={() => setSelectedGateway(gateway)}
                                />
                                <span className="payment-gateway-card__copy">
                                    <strong>{gateway === 'stripe' ? 'Credit Card' : 'PayPal'}</strong>
                                    <small>{gateway === 'stripe' ? 'Secure card payment via Stripe' : 'Pay securely with PayPal'}</small>
                                </span>
                                <span className="payment-gateway-card__mark" aria-hidden="true">{selectedGateway === gateway ? 'Selected' : ''}</span>
                            </label>
                        ))}
                    </div>
                    <div className="checkout-total-list checkout-price-breakdown">
                        <div><span>Items subtotal</span><strong>£{subtotal.toFixed(2)}</strong></div>
                        <div><span>Delivery fee</span><strong>£{SHIPPING_FEE.toFixed(2)}</strong></div>
                        <div><span>Transaction fee ({selectedGateway === 'stripe' ? 'Stripe' : 'PayPal'})</span><strong>£{activeFee.toFixed(2)}</strong></div>
                        <div className="checkout-grand-total"><span>Total charged</span><strong>£{totalCharged.toFixed(2)}</strong></div>
                    </div>
                    {selectedGateway === 'stripe' ? (
                        <button type="submit" className="checkout-pay-btn" disabled={isSubmitting || !activeCheckoutItems.length}>
                            {isSubmitting ? 'Opening secure payment...' : 'Continue with Credit Card'}
                        </button>
                    ) : (
                        <button type="submit" className="paypal-btn" disabled={isSubmitting || !activeCheckoutItems.length}>
                            {isSubmitting ? 'Opening PayPal...' : 'Continue with PayPal'}
                        </button>
                    )}
                    <p className="checkout-security-note">Payments are securely processed by Stripe or PayPal. Card details are never stored by Arkana.</p>
                </form>

                <aside className="checkout-summary-panel">
                    <div className="checkout-section-heading">
                        <span>Order</span>
                        <div><h3>Your basket</h3><p>{activeCheckoutItems.length} item{activeCheckoutItems.length === 1 ? '' : 's'} ready to ship.</p></div>
                    </div>
                    <div className="checkout-items">
                        {activeCheckoutItems.map(item => (
                            <div key={item.id} className="checkout-item-row">
                                <div><strong>{item.name}</strong><span>Tarot deck · Standard delivery</span></div>
                                <div className="checkout-item-price"><strong>£{item.price.toFixed(2)}</strong><button type="button" onClick={() => onRemoveFromBasket(item.id)}>Remove</button></div>
                            </div>
                        ))}
                    </div>
                    <div className="checkout-total-list">
                        <div><span>Items subtotal</span><strong>£{subtotal.toFixed(2)}</strong></div>
                        <div><span>Delivery fee</span><strong>£{SHIPPING_FEE.toFixed(2)}</strong></div>
                        <div><span>Transaction fee</span><strong>£{activeFee.toFixed(2)}</strong></div>
                        <div className="checkout-grand-total"><span>Grand total</span><strong>£{totalCharged.toFixed(2)}</strong></div>
                    </div>
                    <div className="delivery-qr-panel">
                        <div>
                            <p className="delivery-qr-kicker">Delivery reference</p>
                            <strong>{deliveryReference}</strong>
                            <p>Keep this code for your order records. A carrier label and tracking link are issued after dispatch.</p>
                        </div>
                        <QRCodeSVG value={deliveryQrValue} size={84} level="M" includeMargin aria-label={`Delivery reference ${deliveryReference}`} />
                    </div>
                </aside>
            </div>
        </section>
    );
};
