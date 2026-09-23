import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import type { Session } from '@supabase/supabase-js';
import { QRCodeSVG } from 'qrcode.react';
import { getProductionChecklist } from './production-checklist';
import { confirmOrderAccepted, deleteListing, loadBuyerSoldListingIds, loadListings, updateListing, publishListingBundle, type DeckCondition, type MarketplaceListing } from './lib/listings';
import { getWebsiteLinkStatus, startWebsiteLinkCheckout, type WebsiteLinkStatus } from './lib/website-link';
import { saveDirectPaymentLink, getSellerDirectPaymentLinks } from './lib/direct-payment';
import { assessListingRisk } from './lib/risk-check';
import { createOrderCheckout, createPayPalOrder } from './lib/order-checkout';
import { connectPayPalAccount } from './lib/paypal';
import { resendSignupConfirmation, sendPasswordReset, signInWithEmail, signOut, signUpWithEmail, deleteOwnAccount } from './lib/auth';
import { getSupabaseSession, supabase, uploadDeckImage } from './lib/supabase';
import { getRuntimeConfig } from './lib/config';
import { DirectPaymentAction } from './direct-payment-action';
import { openDashboardChat } from './lib/dashboard-chat';
import { MessagesDashboard } from './messages-dashboard';
import { AdminSupportDashboard } from './admin-support-dashboard';
import { SellerProfilePage } from './seller-profile-page';
import { ResetPasswordPage } from './reset-password-page';

type DeckListing = MarketplaceListing;
const SHIPPING_FEE = 2.99;
const DELIVERY_FEE = 2.99;
type BasketItem = DeckListing & { courierFee: number };
type DiscoveryCategory = 'all' | 'tarot' | 'oracle' | 'lenormand' | 'swap';

const DISCOVERY_CATEGORIES: Array<{ value: DiscoveryCategory; label: string }> = [
    { value: 'all', label: 'All Decks' },
    { value: 'tarot', label: 'Tarot Cards' },
    { value: 'oracle', label: 'Oracle Decks' },
    { value: 'lenormand', label: 'Lenormand' },
    { value: 'swap', label: 'Decks for Swap' },
];

// ============================================================================
// ESCROW SYSTEM FEATURE FLAG — DORMANT, NOT DELETED.
// The old escrow/basket checkout flow (Stripe/PayPal Connect payouts, the `orders`/`payments`
// tables, basket + CheckoutViewIntegrated, BuyerOrdersPanel/SellerOrdersPanel, dispatch/delivery/
// dispute handling) is fully intact below and still functional end-to-end — it is just no longer
// reachable from the active UI. The app now defaults entirely to the Direct Payment Link flow
// (PayOrMessageButton). Flip this back to `true` to re-expose the old escrow entry points; no
// other code needs to change to bring it back.
// ============================================================================
const ESCROW_LEGACY_ENABLED = false;

// Stricter than a regex prefix check: rejects malformed URLs (e.g. "https://") that a regex alone would accept.
function isValidExternalUrl(value: string): boolean {
    try {
        const parsed = new URL(value.trim());
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

// True only inside the Capacitor iOS/Android wrapper, never in the browser build.
const isNativeApp = Capacitor.isNativePlatform();

// Views reachable from the bottom tab bar keep the brand mark; everything else gets a back button.
const NATIVE_ROOT_VIEWS = ['Home', 'Listings', 'Account'];
const NATIVE_VIEW_TITLES: Record<string, string> = {
    Sell: 'Create Listing',
    Help: 'Help & FAQ',
    Dashboard: 'Dashboard',
    Checkout: 'Checkout',
    Production: 'Production',
};

export const MainLayout: React.FC = () => {
    const runtimeConfig = getRuntimeConfig();
    const [activeView, setActiveView] = useState('Home');
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const nativeSearchRef = useRef<HTMLInputElement>(null);
    const profileFormRef = useRef<HTMLFormElement>(null);
    const hasSecureBackend = runtimeConfig.supabaseEnabled;
    const isSecureCheckoutEnabled = runtimeConfig.isSecureMode;
    const productionChecklist = getProductionChecklist({
        VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
        VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
        VITE_STRIPE_PUBLISHABLE_KEY: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY,
        VITE_APP_URL: import.meta.env.VITE_APP_URL,
        VITE_SITE_NAME: import.meta.env.VITE_SITE_NAME,
    });

    // Marketplace core states
    const [listings, setListings] = useState<DeckListing[]>(() => {
        try {
            const savedListings = localStorage.getItem('arkana_listings');
            return savedListings ? JSON.parse(savedListings).map((listing: DeckListing) => ({ ...listing, status: listing.status || 'active' })) : [];
        } catch {
            return [];
        }
    });

    const [totalRevenue, setTotalRevenue] = useState<number>(() => {
        try {
            const savedRevenue = localStorage.getItem('arkana_revenue');
            return savedRevenue ? parseFloat(savedRevenue) : 0;
        } catch {
            return 0;
        }
    });

    const [deckName, setDeckName] = useState('');
    const [deckPrice, setDeckPrice] = useState('');
    const [deckDescription, setDeckDescription] = useState('');
    const [condition, setCondition] = useState<DeckCondition>('good');
    const [freeDelivery, setFreeDelivery] = useState<boolean>(false);
    const [listingType, setListingType] = useState<DeckListing['listingType']>('sale');
    const [deckImageFiles, setDeckImageFiles] = useState<File[]>([]);
    const [imagePreviews, setImagePreviews] = useState<string[]>([]);
    const [wantsExternalLink, setWantsExternalLink] = useState<boolean>(false);
    const [externalStoreUrl, setExternalStoreUrl] = useState('');
    const [externalLinkUrlError, setExternalLinkUrlError] = useState<string | null>(null);
    const [wantsAuthentication, setWantsAuthentication] = useState<boolean>(false);
    const [isRentingExternalLink, setIsRentingExternalLink] = useState(false);
    const [editModeData, setEditModeData] = useState<DeckListing | null>(null);
    const [basket, setBasket] = useState<BasketItem[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [discoveryCategory, setDiscoveryCategory] = useState<DiscoveryCategory>('all');
    const [isChatOpen, setIsChatOpen] = useState(false);

    // Checkout Flow States
    const [selectedItem, setSelectedItem] = useState<DeckListing | null>(null);
    const [viewingListing, setViewingListing] = useState<DeckListing | null>(null);
    const [checkoutStep, setCheckoutStep] = useState<'auth' | 'delivery' | 'payment' | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [deliveryMethod, setDeliveryMethod] = useState<'standard' | 'express' | 'collection'>('standard');
    const [flashMessage, setFlashMessage] = useState<string | null>(null);
    const [termsAccepted, setTermsAccepted] = useState<boolean>(false);
    const [showTermsModal, setShowTermsModal] = useState<boolean>(false);
    const [activeLegalPage, setActiveLegalPage] = useState<'terms' | 'privacy' | 'refunds' | 'shipping' | null>(null);
    const [accountMode, setAccountMode] = useState<'signin' | 'signup'>('signin');
    const [accountEmail, setAccountEmail] = useState('');
    const [accountPassword, setAccountPassword] = useState('');
    const [accountConfirmPassword, setAccountConfirmPassword] = useState('');
    const [accountStatus, setAccountStatus] = useState<string | null>(null);
    const [isEmailSent, setIsEmailSent] = useState(false);
    const [isResendingVerification, setIsResendingVerification] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [isResetView, setIsResetView] = useState(false);
    const [showResetMessage, setShowResetMessage] = useState(false);
    const [isResetSent, setIsResetSent] = useState(false);
    const [isResetSubmitting, setIsResetSubmitting] = useState(false);
    const [isAccountSubmitting, setIsAccountSubmitting] = useState(false);
    const [displayName, setDisplayName] = useState('');
    const [profileBio, setProfileBio] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [session, setSession] = useState<Session | null>(null);
    const [isProfileComplete, setIsProfileComplete] = useState(false);
    const [isProfileLoading, setIsProfileLoading] = useState(false);
    const [isStartingConnect, setIsStartingConnect] = useState(false);
    const [isStartingPayPalConnect, setIsStartingPayPalConnect] = useState(false);
    const [isStripePayoutEnabled, setIsStripePayoutEnabled] = useState(false);
    const [websiteLinkStatus, setWebsiteLinkStatus] = useState<WebsiteLinkStatus>({ websiteUrl: null, isActive: false, expiresAt: null });
    const [websiteUrlInput, setWebsiteUrlInput] = useState('');
    const [isStartingWebsiteLink, setIsStartingWebsiteLink] = useState(false);
    const [directPaymentLinkInput, setDirectPaymentLinkInput] = useState('');
    const [isEditingDirectPaymentLink, setIsEditingDirectPaymentLink] = useState(false);
    const [isSavingDirectPaymentLink, setIsSavingDirectPaymentLink] = useState(false);
    const [sellerDirectPaymentLinks, setSellerDirectPaymentLinks] = useState<Record<string, string | null>>({});
    const [buyerSoldListingIds, setBuyerSoldListingIds] = useState<Set<string>>(new Set());

    // Auth form state placeholders
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const filteredListings = listings.filter((listing) => {
        if (listing.status === 'completed') return false;
        if (listing.reviewStatus !== 'approved' && listing.sellerId !== session?.user?.id) return false;
        const query = searchQuery.trim().toLowerCase();
        return !query || listing.name.toLowerCase().includes(query) || listing.description?.toLowerCase().includes(query);
    });
    const discoveryListings = listings
        .filter((listing) => listing.status === 'active' && listing.reviewStatus === 'approved')
        .filter((listing) => {
            if (discoveryCategory === 'all') return true;
            if (discoveryCategory === 'swap') return listing.listingType === 'swap';
            const searchableText = `${listing.name} ${listing.description || ''}`.toLowerCase();
            return searchableText.includes(discoveryCategory);
        })
        .slice(0, 4);

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

    useEffect(() => {
        if (!hasSecureBackend) return;
        loadListings()
            .then((loadedListings) => {
                setListings(loadedListings);
                getSellerDirectPaymentLinks(loadedListings.map((listing) => listing.sellerId))
                    .then(setSellerDirectPaymentLinks)
                    .catch(() => setSellerDirectPaymentLinks({}));
            })
            .catch((error) => setFlashMessage(error instanceof Error ? error.message : 'Unable to load marketplace listings.'));
    }, [hasSecureBackend]);

    useEffect(() => {
        if (!supabase) return;
        getSupabaseSession()
            .then((activeSession) => {
                setIsAuthenticated(Boolean(activeSession));
                setAccountEmail(activeSession?.user.email || '');
                setSession(activeSession);
            })
            .catch(() => setIsAuthenticated(false));
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, activeSession) => {
            setIsAuthenticated(Boolean(activeSession));
            setAccountEmail(activeSession?.user.email || '');
            setSession(activeSession);
        });
        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        if (!session?.user) {
            setBuyerSoldListingIds(new Set());
            return;
        }
        loadBuyerSoldListingIds()
            .then(setBuyerSoldListingIds)
            .catch(() => setBuyerSoldListingIds(new Set()));
    }, [session?.user?.id]);

    const handleConfirmOrderAccepted = async (listingId: string) => {
        try {
            await confirmOrderAccepted(listingId);
            setListings((currentListings) => currentListings.filter((listing) => listing.id !== listingId));
            setBuyerSoldListingIds((currentIds) => {
                const nextIds = new Set(currentIds);
                nextIds.delete(listingId);
                return nextIds;
            });
            if (viewingListing?.id === listingId) setViewingListing(null);
            setFlashMessage('Order accepted. The listing has been completed.');
        } catch (error) {
            setFlashMessage(error instanceof Error ? error.message : 'Unable to confirm this order.');
        }
    };

    useEffect(() => {
        if (!supabase || !session?.user) {
            setDisplayName('');
            setProfileBio('');
            setAvatarUrl('');
            setDirectPaymentLinkInput('');
            setIsEditingDirectPaymentLink(false);
            setIsProfileComplete(false);
            setIsProfileLoading(false);
            return;
        }
        const currentUserId = session.user.id;
        setIsProfileLoading(true);
        (async () => {
            try {
                const { data } = await supabase.from('profiles').select('display_name, bio, avatar_url, direct_payment_link').eq('id', currentUserId).maybeSingle();
                setDisplayName(data?.display_name || '');
                setProfileBio(data?.bio || '');
                setAvatarUrl(data?.avatar_url || '');
                setDirectPaymentLinkInput(data?.direct_payment_link || '');
                setIsEditingDirectPaymentLink(false);
                setIsProfileComplete(Boolean(data));
            } catch {
                setIsProfileComplete(false);
            } finally {
                setIsProfileLoading(false);
            }
        })();
        getWebsiteLinkStatus().then((status) => { setWebsiteLinkStatus(status); setWebsiteUrlInput(status.websiteUrl || ''); }).catch(() => setWebsiteLinkStatus({ websiteUrl: null, isActive: false, expiresAt: null }));
    }, [session]);

    // Only auto-skip the Account onboarding view once per sign-in, not on every manual "Your Profile" click.
    const hasSkippedAccountOnboarding = React.useRef(false);
    useEffect(() => {
        hasSkippedAccountOnboarding.current = false;
    }, [session?.user?.id]);

    useEffect(() => {
        if (!session?.user || isProfileLoading || !isProfileComplete) return;
        if (activeView !== 'Account' || hasSkippedAccountOnboarding.current) return;
        hasSkippedAccountOnboarding.current = true;
        setActiveView('Listings');
    }, [session, isProfileLoading, isProfileComplete, activeView]);

    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [activeView]);

    useEffect(() => {
        if (new URLSearchParams(window.location.search).get('auth') !== 'confirmed') return;
        setActiveView('Account');
        setAccountMode('signin');
        setAccountStatus('Email confirmed. Sign in to continue.');
        window.history.replaceState({}, '', window.location.pathname);
    }, []);

    useEffect(() => {
        if (new URLSearchParams(window.location.search).get('passwordReset') !== 'success') return;
        setActiveView('Account');
        setAccountMode('signin');
        setAccountStatus('Password updated. Sign in with your new password.');
        window.history.replaceState({}, '', window.location.pathname);
    }, []);

    useEffect(() => {
        if (new URLSearchParams(window.location.search).get('connect') !== 'complete') return;
        getSupabaseSession()
            .then(async (session) => {
                if (!session?.access_token) throw new Error('Sign in again to verify your payout setup.');
                const response = await fetch('/api/connect-status', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } });
                const payload = await response.json();
                if (!response.ok) throw new Error(payload?.error || 'Unable to verify payout setup.');
                setIsStripePayoutEnabled(Boolean(payload.payoutEnabled));
                setAccountStatus(payload.payoutEnabled ? 'Stripe payouts are enabled.' : 'Stripe needs additional information before payouts can be enabled.');
            })
            .catch((error) => setAccountStatus(error instanceof Error ? error.message : 'Unable to verify payout setup.'))
            .finally(() => window.history.replaceState({}, '', window.location.pathname));
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('paypal') !== 'success') return;
        const paypalOrderId = params.get('token');
        if (!paypalOrderId || !supabase) return;

        getSupabaseSession()
            .then(async (session) => {
                if (!session?.access_token) throw new Error('Sign in again to confirm your PayPal payment.');
                const response = await fetch('/api/checkout/paypal/capture-order', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                    body: JSON.stringify({ paypalOrderId }),
                });
                const payload = await response.json();
                if (!response.ok) throw new Error(payload?.error || 'Unable to confirm PayPal payment.');
                setActiveView('Checkout');
                setFlashMessage('PayPal payment confirmed. Your order is being prepared.');
            })
            .catch((error) => setFlashMessage(error instanceof Error ? error.message : 'Unable to confirm PayPal payment.'))
            .finally(() => window.history.replaceState({}, '', window.location.pathname));
    }, []);

    useEffect(() => {
        if (hasSecureBackend) return;
        try {
            localStorage.setItem('arkana_listings', JSON.stringify(listings));
        } catch {
            // Ignore storage write failures in private/incognito mode.
        }
    }, [listings]);

    useEffect(() => {
        try {
            localStorage.setItem('arkana_revenue', totalRevenue.toString());
        } catch {
            // Ignore storage write failures in private/incognito mode.
        }
    }, [totalRevenue]);

    useEffect(() => {
        if (!flashMessage) return;
        const timer = window.setTimeout(() => setFlashMessage(null), 2800);
        return () => window.clearTimeout(timer);
    }, [flashMessage]);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newFiles = Array.from(e.target.files || []);
        const existingImageUrls = imagePreviews.filter((url) => !url.startsWith('blob:'));
        const availableSlots = 3 - existingImageUrls.length - deckImageFiles.length;
        if (newFiles.length === 0) return;
        if (newFiles.length > availableSlots) {
            setFlashMessage(availableSlots > 0 ? `Select up to ${availableSlots} more image${availableSlots === 1 ? '' : 's'} (3 total including existing photos).` : 'You already have 3 images. Remove one before adding another.');
            e.target.value = '';
            return;
        }
        const mergedFiles = [...deckImageFiles, ...newFiles];
        setDeckImageFiles(mergedFiles);
        setImagePreviews([...existingImageUrls, ...mergedFiles.map((file) => URL.createObjectURL(file))]);
        e.target.value = '';
    };

    const handleRemoveImage = (index: number) => {
        const previewUrl = imagePreviews[index];
        if (!previewUrl) return;
        // Blob previews map 1:1 onto deckImageFiles, which always sit after any saved image URLs.
        if (previewUrl.startsWith('blob:')) {
            const savedImageCount = imagePreviews.filter((url) => !url.startsWith('blob:')).length;
            const fileIndex = index - savedImageCount;
            setDeckImageFiles((files) => files.filter((_, position) => position !== fileIndex));
            URL.revokeObjectURL(previewUrl);
        }
        setImagePreviews((previews) => previews.filter((_, position) => position !== index));
    };

    const handleStartCreate = () => {
        setEditModeData(null);
        setDeckName('');
        setDeckPrice('');
        setDeckDescription('');
        setCondition('good');
        setFreeDelivery(false);
        setListingType('sale');
        setDeckImageFiles([]);
        setImagePreviews([]);
        setActiveView('Sell');
    };

    const handleStartEdit = (item: DeckListing) => {
        setEditModeData(item);
        setActiveView('Sell');
    };

    useEffect(() => {
        if (!editModeData) return;
        setDeckName(editModeData.name);
        setDeckPrice(editModeData.listingType === 'sale' ? editModeData.price.toFixed(2) : '');
        setDeckDescription(editModeData.description || '');
        setCondition(editModeData.condition);
        setFreeDelivery(editModeData.freeDelivery);
        setListingType(editModeData.listingType);
        setDeckImageFiles([]);
        setImagePreviews(editModeData.images || []);
    }, [editModeData]);

    const handlePublish = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!deckName.trim() || (listingType === 'sale' && !deckPrice.trim())) {
            alert('Add a deck name and a price for sale listings before publishing.');
            return;
        }
        const parsedPrice = listingType === 'sale' ? Number(deckPrice) : 0;
        if (Number.isNaN(parsedPrice) || parsedPrice <= 0) {
            alert('Please enter a valid price greater than zero.');
            return;
        }
        if (!runtimeConfig.isSecureMode) {
            alert('Publishing listings is disabled until Supabase and Stripe are configured for production.');
            return;
        }
        if (!session?.user) {
            handleRequireSignIn('Sign in before publishing a listing.');
            return;
        }
        if (wantsExternalLink && !isValidExternalUrl(externalStoreUrl)) {
            setExternalLinkUrlError('Enter a valid web store link starting with http:// or https://.');
            return;
        }
        setExternalLinkUrlError(null);
        const risk = assessListingRisk({
            price: parsedPrice,
            listingType,
            accountCreatedAt: session.user.created_at,
            recentListingCount: listings.filter((listing) => listing.sellerId === session.user!.id).length,
        });
        try {
            const existingListing = editModeData;
            const isEditing = existingListing !== null;

            // NEW submissions route through the unified batch pipeline (a "batch" of exactly 1 deck) —
            // the server there computes the same stacked fee and creates the listing hidden until paid.
            if (!isEditing) {
                const uploadedImageUrl = deckImageFiles[0] ? await uploadDeckImage(deckImageFiles[0]) : null;
                if (deckImageFiles[0] && !uploadedImageUrl) throw new Error('Unable to upload the deck image. Please try again.');
                const result = await publishListingBundle({ name: deckName.trim(), price: parsedPrice, description: deckDescription.trim() || undefined, listingType, imageFiles: deckImageFiles, uploadedImageUrl: uploadedImageUrl || undefined, freeDelivery, condition, externalStoreUrl: wantsExternalLink ? externalStoreUrl.trim() : undefined, wantsAuthentication });
                if (result.requiresPayment) {
                    window.location.assign(result.checkoutUrl);
                    return;
                }
                setListings((currentListings) => [result.listing, ...currentListings]);
                if (wantsExternalLink) {
                    setIsRentingExternalLink(true);
                    const rentSession = await getSupabaseSession();
                    if (!rentSession?.access_token) throw new Error('Sign in again to rent an external store link.');
                    const response = await fetch('/api/listings/rent-link', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rentSession.access_token}` },
                        body: JSON.stringify({ listingId: result.listing.id, externalStoreUrl: externalStoreUrl.trim() }),
                    });
                    const payload = await response.json();
                    if (!response.ok || !payload?.url) throw new Error(payload?.error || 'Unable to start external link checkout.');
                    window.location.assign(payload.url);
                    return;
                }
                setDeckName('');
                setDeckPrice('');
                setDeckDescription('');
                setCondition('good');
                setFreeDelivery(false);
                setListingType('sale');
                setDeckImageFiles([]);
                setImagePreviews([]);
                setWantsAuthentication(false);
                setFlashMessage(`Published: ${result.listing.name}`);
                setActiveView('Listings');
                return;
            }

            // Existing listing edits are free in the active rollout. The legacy listing-fee
            // checkout route remains intact and dormant for a future premium pricing switch.
            const savedListing = await updateListing(existingListing.id, { name: deckName.trim(), price: parsedPrice, description: deckDescription.trim() || undefined, listingType, imageFiles: deckImageFiles, existingImages: existingListing.images || [], freeDelivery, condition, reviewStatus: 'approved' });
            setListings((currentListings) => currentListings.map((listing) => listing.id === savedListing.id ? savedListing : listing));

            if (wantsExternalLink) {
                setIsRentingExternalLink(true);
                const rentSession = await getSupabaseSession();
                if (!rentSession?.access_token) throw new Error('Sign in again to rent an external store link.');
                const response = await fetch('/api/listings/rent-link', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rentSession.access_token}` },
                    body: JSON.stringify({ listingId: savedListing.id, externalStoreUrl: externalStoreUrl.trim() }),
                });
                const payload = await response.json();
                if (!response.ok || !payload?.url) throw new Error(payload?.error || 'Unable to start external link checkout.');
                window.location.assign(payload.url);
                return;
            }

            setDeckName('');
            setDeckPrice('');
            setDeckDescription('');
            setCondition('good');
            setFreeDelivery(false);
            setListingType('sale');
            setDeckImageFiles([]);
            setImagePreviews([]);
            setWantsExternalLink(false);
            setExternalStoreUrl('');
            setExternalLinkUrlError(null);
            setWantsAuthentication(false);
            setEditModeData(null);
            setFlashMessage(risk.requiresReview ? `Submitted for review: ${savedListing.name}. ${risk.reasons[0]}` : `Updated: ${savedListing.name}`);
            setActiveView('Listings');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to publish your listing.';
            setIsRentingExternalLink(false);
            if (message === 'Sign in before creating a listing.') {
                handleRequireSignIn(message);
                return;
            }
            setFlashMessage(`Card verification failed: ${message}`);
            alert(message);
        }
    };

    const handleStartWebsiteLink = async () => {
        if (!isValidExternalUrl(websiteUrlInput)) {
            alert('Enter a valid website URL starting with http:// or https://.');
            return;
        }
        setIsStartingWebsiteLink(true);
        try {
            const checkout = await startWebsiteLinkCheckout(websiteUrlInput.trim());
            window.location.assign(checkout.url);
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Unable to start website link checkout.');
            setIsStartingWebsiteLink(false);
        }
    };

    const handleDelete = async (idToDelete: string) => {
        const target = listings.find(item => item.id === idToDelete);
        try {
            await deleteListing(idToDelete);
            setListings((currentListings) => currentListings.filter(item => item.id !== idToDelete));
            if (target) setFlashMessage(`Removed ${target.name}`);
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Unable to remove this listing.');
        }
    };

    const handleAddToBasket = (item: DeckListing) => {
        if (basket.some((basketItem) => basketItem.id === item.id)) {
            setFlashMessage(`${item.name} is already in your basket.`);
            return;
        }
        if (basket.length && basket[0].sellerId !== item.sellerId) {
            setFlashMessage('Complete the current seller order first. A basket can contain up to 3 decks from one seller.');
            return;
        }
        if (basket.length === 3) {
            setFlashMessage('Your basket already has the maximum 3 decks for this seller.');
            return;
        }
        const courierFee = DELIVERY_FEE;
        setBasket((currentBasket) => [...currentBasket, { ...item, courierFee }]);
        setFlashMessage(`Added ${item.name} to your basket.`);
    };

    const handleInitiateCheckout = (item: DeckListing) => {
        setSelectedItem(item);
        setFlashMessage(`Checkout: ${item.name}`);
        setCheckoutStep(isAuthenticated ? 'delivery' : 'auth');
    };

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim() || !password.trim()) {
            alert('Please enter your details to sign in.');
            return;
        }

        if (!hasSecureBackend) {
            alert('Authentication is disabled until VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are configured.');
            return;
        }

        try {
            await signInWithEmail(email, password);
            setIsAuthenticated(true);
            setFlashMessage('Signed in. Continue to delivery details.');
            setCheckoutStep('delivery');
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Unable to sign in. Please check your credentials.');
        }
    };

    const handleAccountSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setAccountStatus(null);
        if (!hasSecureBackend) {
            setAccountStatus('Sign in is unavailable because Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel, then redeploy.');
            return;
        }
        if (accountMode === 'signup' && accountPassword !== accountConfirmPassword) {
            setAccountStatus('Passwords do not match.');
            return;
        }
        setIsAccountSubmitting(true);
        try {
            if (accountMode === 'signup') {
                const result = await signUpWithEmail(accountEmail.trim(), accountPassword);
                if (result.session) {
                    setIsAuthenticated(true);
                    setAccountStatus('Account created. You are ready to sell.');
                } else {
                    setIsEmailSent(true);
                    setAccountStatus(null);
                }
            } else {
                await signInWithEmail(accountEmail.trim(), accountPassword);
                setIsAuthenticated(true);
                setAccountEmail(accountEmail.trim());
                setAccountStatus('Signed in successfully.');
            }
            setAccountPassword('');
            setAccountConfirmPassword('');
            setShowPassword(false);
        } catch (error) {
            setAccountStatus(error instanceof Error ? error.message : 'Unable to continue with your account.');
        } finally {
            setIsAccountSubmitting(false);
        }
    };

    const handlePasswordReset = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!accountEmail.trim()) {
            setAccountStatus('Enter your email address to receive a reset link.');
            return;
        }
        setIsResetSubmitting(true);
        try {
            await sendPasswordReset(accountEmail.trim());
            setIsResetSent(true);
            setAccountStatus(null);
        } catch (error) {
            setAccountStatus(error instanceof Error ? error.message : 'Unable to send the password reset email.');
        } finally {
            setIsResetSubmitting(false);
        }
    };

    const handleResendVerification = async () => {
        if (!accountEmail.trim()) {
            setAccountStatus('Enter your email address, then resend the confirmation.');
            return;
        }
        setIsResendingVerification(true);
        try {
            await resendSignupConfirmation(accountEmail.trim());
            setAccountStatus('Verification email sent again. Check your inbox and spam folder.');
        } catch (error) {
            setAccountStatus(error instanceof Error ? error.message : 'Unable to resend the verification email.');
        } finally {
            setIsResendingVerification(false);
        }
    };

    const handleSignOut = async () => {
        try {
            await signOut();
            setIsAuthenticated(false);
            setAccountStatus('You are signed out.');
            window.history.pushState({}, '', '/');
            setActiveView('Home');
        } catch (error) {
            setAccountStatus(error instanceof Error ? error.message : 'Unable to sign out.');
        }
    };

    const handleDeleteAccount = async () => {
        setIsDeletingAccount(true);
        try {
            await deleteOwnAccount();
            setIsAuthenticated(false);
            setAccountStatus('Your account has been permanently deleted.');
            window.history.pushState({}, '', '/');
            setActiveView('Home');
        } catch (error) {
            setAccountStatus(error instanceof Error ? error.message : 'Unable to delete your account.');
        } finally {
            setIsDeletingAccount(false);
            setIsDeleteDialogOpen(false);
        }
    };

    const handleSaveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!supabase) return;
        setIsSavingProfile(true);
        setAccountStatus(null);
        try {
            const session = await getSupabaseSession();
            if (!session?.user) throw new Error('Sign in before saving your profile.');
            let nextAvatarUrl = avatarUrl.trim() || null;
            if (avatarFile) {
                if (!avatarFile.type.startsWith('image/')) throw new Error('Only image files can be uploaded.');
                const path = `${session.user.id}/${Date.now()}-${avatarFile.name}`;
                const { error: uploadError } = await supabase.storage.from('avatars').upload(path, avatarFile, { contentType: avatarFile.type, upsert: false });
                if (uploadError) throw new Error(uploadError.message || 'Unable to upload your avatar.');
                const { data: publicUrl } = supabase.storage.from('avatars').getPublicUrl(path);
                nextAvatarUrl = publicUrl.publicUrl;
            }
            const { error } = await supabase.from('profiles').update({
                display_name: displayName.trim() || null,
                bio: profileBio.trim() || null,
                avatar_url: nextAvatarUrl,
            }).eq('id', session.user.id);
            if (error) throw error;
            setAvatarUrl(nextAvatarUrl || '');
            setAvatarFile(null);
            setAccountStatus('Profile saved.');
            window.location.href = `/app/profile/${encodeURIComponent(session.user.id)}`;
        } catch (error) {
            setAccountStatus(error instanceof Error ? error.message : 'Unable to save your profile.');
        } finally {
            setIsSavingProfile(false);
        }
    };

    // Requirement 2: standalone save handler for the seller's own direct payment link.
    const handleSaveDirectPaymentLink = async () => {
        setIsSavingDirectPaymentLink(true);
        setAccountStatus(null);
        try {
            await saveDirectPaymentLink(directPaymentLinkInput);
            if (session?.user?.id) {
                setSellerDirectPaymentLinks((currentLinks) => ({
                    ...currentLinks,
                    [session.user.id]: directPaymentLinkInput.trim() || null,
                }));
            }
            setIsEditingDirectPaymentLink(false);
            setAccountStatus('Payment link saved.');
        } catch (error) {
            setAccountStatus(error instanceof Error ? error.message : 'Unable to save your payment link.');
        } finally {
            setIsSavingDirectPaymentLink(false);
        }
    };

    const handleStartConnect = async () => {
        setIsStartingConnect(true);
        setAccountStatus(null);
        try {
            const session = await getSupabaseSession();
            if (!session?.access_token) throw new Error('Sign in before setting up payouts.');
            const response = await fetch('/api/connect/stripe-onboarding', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            });
            const payload = await response.json();
            if (!response.ok || !payload?.url) throw new Error(payload?.error || 'Unable to start Stripe Connect onboarding.');
            window.location.href = payload.url;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to start Stripe Connect onboarding.';
            if (message === 'Sign in before setting up payouts.') handleRequireSignIn(message);
            else setAccountStatus(message);
        } finally {
            setIsStartingConnect(false);
        }
    };

    const handleStartPayPalConnect = async () => {
        setIsStartingPayPalConnect(true);
        setAccountStatus(null);
        try {
            const { url } = await connectPayPalAccount();
            window.location.assign(url);
        } catch (error) {
            setAccountStatus(error instanceof Error ? error.message : 'Unable to start PayPal onboarding.');
            setIsStartingPayPalConnect(false);
        }
    };

    const handleGuestCheckout = () => {
        setCheckoutStep('delivery');
        setTermsAccepted(false);
    };

    const deliveryFee = deliveryMethod === 'express' ? 5.50 : deliveryMethod === 'collection' ? 0 : 2.99;
    const orderTotal = selectedItem ? selectedItem.price + deliveryFee : 0;

    const handleFinalisePayment = async (gateway: 'Stripe' | 'PayPal' | 'Cash') => {
        if (!selectedItem) return;
        if (!termsAccepted) {
            alert('Please agree to the Terms & Conditions before paying.');
            return;
        }

        if (gateway === 'Cash') {
            setFlashMessage(`Collection request sent for ${selectedItem.name}. The seller will confirm a safe collection time and address.`);
            setSelectedItem(null);
            setCheckoutStep(null);
            return;
        }

        if (!isSecureCheckoutEnabled || gateway === 'PayPal') {
            alert('Checkout is disabled until Supabase and at least one payment provider are configured for production.');
            return;
        }

        const dynamicDeliveryCost = deliveryMethod === 'express' ? 5.50 : deliveryMethod === 'collection' ? 0 : 2.99;
        const totalCharged = selectedItem.price + dynamicDeliveryCost;

        try {
            alert(`Checkout for £${totalCharged.toFixed(2)} must be completed from your basket.`);
            return;
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Checkout could not be created.');
            return;
        }

        setSelectedItem(null);
        setCheckoutStep(null);
    };

    const profileRouteMatch = window.location.pathname.match(/^\/app\/profile\/([^/]+)\/?$/);
    if (profileRouteMatch) {
        return <SellerProfilePage sellerId={decodeURIComponent(profileRouteMatch[1])} onBack={() => { window.history.replaceState({}, '', '/'); setActiveView('Listings'); }} onEditProfile={() => { window.history.replaceState({}, '', '/'); hasSkippedAccountOnboarding.current = true; setActiveView('Account'); }} onSignIn={() => { window.history.replaceState({}, '', '/'); setAccountMode('signin'); setAccountStatus('Sign in to message this seller.'); setIsEmailSent(false); setIsResetView(false); setActiveView('Account'); }} />;
    }

    const messagesRouteMatch = window.location.pathname.match(/^\/app\/messages\/?$/);
    if (messagesRouteMatch) {
        const chatId = new URLSearchParams(window.location.search).get('chatId');
        return chatId ? <MessagesDashboard chatId={chatId} onBack={() => { window.history.replaceState({}, '', '/'); setActiveView('Listings'); }} /> : <section className="seller-profile-page"><p>Select a conversation to view messages.</p></section>;
    }

    if (window.location.pathname === '/app/admin/support') {
        return <AdminSupportDashboard />;
    }

    if (window.location.pathname === '/reset-password') {
        return <ResetPasswordPage onDone={() => { window.location.href = '/?passwordReset=success'; }} />;
    }

    const isNestedNativeView = isNativeApp && !NATIVE_ROOT_VIEWS.includes(activeView);
    const nativeScreenTitle = activeView === 'Sell' && editModeData ? 'Edit Listing' : NATIVE_VIEW_TITLES[activeView] || 'Arkana';

    const handleNativeBack = () => {
        setIsMobileMenuOpen(false);
        setActiveView('Listings');
    };

    const handleRequireSignIn = (message: string = SIGN_IN_REQUIRED_MESSAGE) => {
        setViewingListing(null);
        setAccountMode('signin');
        setAccountStatus(message);
        setIsEmailSent(false);
        setIsResetView(false);
        setActiveView('Account');
    };

    return (
        <div className={`container${isNativeApp ? ' app-container' : ''}`}>
            <div className="frame">
                {!isNativeApp && runtimeConfig.warnings.length > 0 && (
                    <div className="runtime-warning-banner" role="alert">
                        <span className="runtime-warning-title">Production blockers:</span>
                        {runtimeConfig.warnings.map((warning) => (
                            <span key={warning} className="runtime-warning-item">• {warning}</span>
                        ))}
                    </div>
                )}

                {flashMessage && (
                    <div className="flash-banner" role="status" aria-live="polite">
                        {flashMessage}
                    </div>
                )}

                {isNativeApp && (
                    <header className="native-header">
                        <div className="native-header-bar">
                            {isNestedNativeView ? (
                                <>
                                    <button type="button" className="header-back-button" onClick={handleNativeBack} aria-label="Back to Marketplace">
                                        <span className="header-back-chevron" aria-hidden="true">‹</span>
                                        <span className="header-back-label">Back</span>
                                    </button>
                                    <span className="native-header-screen-title">{nativeScreenTitle}</span>
                                </>
                            ) : (
                                <button type="button" className="native-header-brand" onClick={() => setActiveView('Home')} aria-label="Go to Arkana home">
                                    <span className="native-header-mark">ARK</span>
                                    <span className="native-header-title">Arkana</span>
                                </button>
                            )}
                            {isNestedNativeView
                                ? <button type="button" className="header-back-button is-cancel" onClick={handleNativeBack}>Cancel</button>
                                : <button type="button" className="native-header-action" onClick={() => setActiveView('Help')} aria-label="Help and FAQ">?</button>}
                        </div>
                        {activeView === 'Listings' && (
                            <div className="native-header-search">
                                <input ref={nativeSearchRef} type="text" name="marketplaceQuery" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search decks..." aria-label="Search decks" />
                            </div>
                        )}
                    </header>
                )}

                {!isNativeApp && (
                    <>
                        <div className="trust-badges" aria-label="Trust markers">
                            <span>🟢 Free Listing</span>
                            <span>🔮 Free AI Authentication Check</span>
                            <span>💬 Direct Contact with Seller</span>
                        </div>

                        <header className="topbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', width: '100%', boxSizing: 'border-box', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: '1 1 280px', minWidth: 0 }}>
                                <button className="brand" type="button" onClick={() => setActiveView('Home')} aria-label="Go to Arkana home">
                                    <div className="brand-mark">ARK</div>
                                    <div>
                                        <strong>Arkana</strong>
                                        <span>Zero-commission marketplace</span>
                                    </div>
                                </button>
                                <input className="header-search" type="text" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onFocus={() => setActiveView('Listings')} placeholder="Search decks..." aria-label="Search decks" style={{ flex: '1 1 160px' }} />
                            </div>
                            {ESCROW_LEGACY_ENABLED && <button type="button" className="basket-btn basket-btn--topbar" onClick={() => setActiveView('Checkout')}>Basket <span>{basket.length}</span></button>}
                            <button
                                type="button"
                                className="mobile-menu-toggle"
                                aria-label="Toggle navigation menu"
                                aria-expanded={isMobileMenuOpen}
                                onClick={() => setIsMobileMenuOpen((current) => !current)}
                            >
                                <span className="mobile-menu-toggle__bar"></span>
                                <span className="mobile-menu-toggle__bar"></span>
                                <span className="mobile-menu-toggle__bar"></span>
                            </button>
                            <div className={`mobile-nav-panel${isMobileMenuOpen ? ' is-open' : ''}`}>
                                <nav className="nav-links" aria-label="Main navigation" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <button className={`nav-btn ${activeView === 'Listings' ? 'active' : ''}`} onClick={() => setActiveView('Listings')}>Marketplace</button>
                                    {ESCROW_LEGACY_ENABLED && <button type="button" className="basket-btn basket-btn--nav" onClick={() => setActiveView('Checkout')}>Basket <span>{basket.length}</span></button>}
                                </nav>
                                <div className="auth-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                    {isAuthenticated ? (
                                        <>
                                            <a className="auth-link-btn" href={`/app/profile/${encodeURIComponent(session?.user.id || '')}`}>Your Profile</a>
                                            <button type="button" className="auth-link-btn" onClick={() => void handleSignOut()}>Sign Out</button>
                                        </>
                                    ) : (
                                        <>
                                            <button type="button" className="auth-link-btn" onClick={() => { setAccountMode('signin'); setAccountStatus(null); setIsEmailSent(false); setIsResetView(false); setActiveView('Account'); }}>Sign in</button>
                                            <button type="button" className="auth-link-btn" onClick={() => { setAccountMode('signup'); setAccountStatus(null); setIsEmailSent(false); setIsResetView(false); setActiveView('Account'); }}>Register</button>
                                        </>
                                    )}
                                    <button type="button" className="primary-btn" onClick={handleStartCreate}>Create Listing</button>
                                    <button type="button" className={`nav-btn ${activeView === 'Help' ? 'active' : ''}`} onClick={() => setActiveView('Help')}>Help &amp; FAQ</button>
                                </div>
                            </div>
                        </header>
                    </>
                )}

                <main className={`page-content${isNativeApp ? ' main-viewport' : ''}${isNativeApp && activeView === 'Listings' ? ' main-viewport--search' : ''}`}>
                    {/* 1. HOME VIEW */}
                    {activeView === 'Home' && (
                        <div className="home-view">
                            <section className="explore-section home-discovery-module" aria-labelledby="browse-categories-title">
                                <div className="home-discovery-heading">
                                    <div>
                                        <p>Explore</p>
                                        <h2 id="browse-categories-title">Browse Categories</h2>
                                    </div>
                                </div>
                                <div className="category-filter-row" role="group" aria-label="Filter recent listings by category">
                                    {DISCOVERY_CATEGORIES.map((category) => (
                                        <button
                                            type="button"
                                            key={category.value}
                                            className={`category-filter-btn${discoveryCategory === category.value ? ' is-active' : ''}`}
                                            aria-pressed={discoveryCategory === category.value}
                                            onClick={() => setDiscoveryCategory(category.value)}
                                        >
                                            {category.label}
                                        </button>
                                    ))}
                                </div>
                            </section>

                            <section className="hero-grid home-hero">
                                <div className="hero-card">
                                    <h1 className="hero-title">Welcome to Arkana</h1>
                                    <p className="hero-subtitle">Zero-commission marketplace for tarot and oracle card enthusiasts.</p>
                                </div>
                                <div className="hero-img" aria-hidden="true"></div>
                            </section>

                            <section className="home-discovery-feed" aria-label="Discover listings">
                                <div className="home-discovery-module">
                                    <div className="home-discovery-heading">
                                        <div>
                                            <p>Fresh finds</p>
                                            <h2>Recent Notice Postings</h2>
                                        </div>
                                        <button type="button" onClick={() => setActiveView('Listings')}>See all</button>
                                    </div>
                                    {discoveryListings.length > 0 ? (
                                        <div className="listings-mini-grid">
                                            {discoveryListings.map((listing) => (
                                                <button type="button" className="mini-listing-card" key={listing.id} onClick={() => setViewingListing(listing)}>
                                                    <div className="mini-listing-image-wrap">
                                                        {listing.images[0]
                                                            ? <img src={listing.images[0]} alt={listing.name} className="mini-listing-image" />
                                                            : <span className="mini-listing-placeholder" aria-hidden="true">ARK</span>}
                                                    </div>
                                                    <div className="mini-listing-copy">
                                                        <h3>{listing.name}</h3>
                                                        <span className={`mini-listing-badge mini-listing-badge--${listing.listingType}`}>
                                                            {listing.listingType === 'sale' ? `£${listing.price.toFixed(2)}` : listing.listingType === 'swap' ? 'Swap' : 'Free'}
                                                        </span>
                                                        <span className="mini-listing-location">Direct with seller</span>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="home-discovery-empty">
                                            <p>No matching notices yet.</p>
                                            <button type="button" onClick={() => setDiscoveryCategory('all')}>View all recent listings</button>
                                        </div>
                                    )}
                                </div>
                            </section>
                        </div>
                    )}

                    {activeView === 'Account' && (
                        <section className={`account-page${isNativeApp ? ' account-auth-container' : ''}`}>
                            <div className="account-panel">
                                <p className="account-kicker">Arkana account</p>
                                <h2>{isAuthenticated ? 'Your account' : accountMode === 'signin' ? 'Welcome back' : 'Create your seller account'}</h2>
                                <p className="account-intro">{isAuthenticated ? 'You can now manage listings and fulfil paid orders.' : 'Sign in to sell, manage listings, and receive order updates.'}</p>
                                {isNativeApp && isAuthenticated && (
                                    <div className="account-profile-view">
                                        <div className="ios-settings-group">
                                            {isAuthenticated && (
                                                <button type="button" className="settings-action-row" onClick={() => profileFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Edit Profile Details</button>
                                            )}
                                            <button type="button" className="settings-action-row" onClick={() => setActiveView('Help')}>Help &amp; Support FAQ</button>
                                            <button type="button" className="settings-action-row" onClick={() => setActiveLegalPage('terms')}>Terms &amp; Conditions</button>
                                            <button type="button" className="settings-action-row" onClick={() => setActiveLegalPage('privacy')}>Privacy Policy</button>
                                            {isAuthenticated && (
                                                <button type="button" className="settings-action-row is-logout" onClick={() => void handleSignOut()}>Log Out</button>
                                            )}
                                        </div>

                                        {isAuthenticated && (
                                            <section className="danger-zone-section" aria-labelledby="danger-zone-title">
                                                <h3 className="danger-zone-title" id="danger-zone-title">Danger Zone</h3>
                                                <p className="danger-zone-warning">
                                                    Deleting your account is permanent and cannot be undone. Every card marketplace listing you have published, along with your seller profile and message history, will be wiped out immediately.
                                                </p>
                                                <button
                                                    type="button"
                                                    className="account-delete-submit-btn"
                                                    disabled={isDeletingAccount}
                                                    onClick={() => setIsDeleteDialogOpen(true)}
                                                >
                                                    {isDeletingAccount ? 'Deleting...' : 'Delete My Account Permanently'}
                                                </button>

                                                {isDeleteDialogOpen && createPortal(
                                                    <div className="confirm-dialog-backdrop" onClick={() => { if (!isDeletingAccount) setIsDeleteDialogOpen(false); }}>
                                                        <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-text" onClick={(event) => event.stopPropagation()}>
                                                            <h2 className="confirm-dialog-title" id="delete-dialog-title">Delete your account?</h2>
                                                            <p className="confirm-dialog-text" id="delete-dialog-text">
                                                                Are you absolutely sure you want to permanently delete your Arkana account? All of your listings and profile data will be erased. This action cannot be undone.
                                                            </p>
                                                            <div className="confirm-dialog-actions">
                                                                <button type="button" className="confirm-dialog-btn is-cancel" disabled={isDeletingAccount} onClick={() => setIsDeleteDialogOpen(false)}>Cancel</button>
                                                                <button type="button" className="confirm-dialog-btn is-destructive" disabled={isDeletingAccount} onClick={() => void handleDeleteAccount()}>{isDeletingAccount ? 'Deleting...' : 'Delete'}</button>
                                                            </div>
                                                        </div>
                                                    </div>,
                                                    document.body,
                                                )}
                                            </section>
                                        )}
                                    </div>
                                )}
                                {isAuthenticated ? (
                                    <div className="account-signed-in">
                                        <strong>Signed in as {accountEmail || 'your Arkana account'}</strong>
                                        {accountStatus && <p role="status">{accountStatus}</p>}
                                        <div className="account-actions">
                                            <button type="button" className="primary-btn" onClick={handleStartCreate}>Create a listing</button>
                                            <button type="button" className="account-text-btn" onClick={handleSignOut}>Sign out</button>
                                        </div>
                                        <form ref={profileFormRef} onSubmit={handleSaveProfile} style={{ display: 'grid', gap: '14px', padding: '20px', border: '1px solid rgba(17, 78, 96, 0.14)', borderRadius: '12px', background: '#ffffff' }}>
                                            <div><h3 style={{ margin: 0, color: '#114e60', fontSize: '1rem' }}>Public profile</h3><p style={{ margin: '4px 0 0', color: '#54717b', fontSize: '0.8rem' }}>These details appear on your seller profile.</p></div>
                                            <label style={{ display: 'grid', gap: '6px', color: '#114e60', fontSize: '0.82rem', fontWeight: 700 }}>Display name<input style={{ width: '100%', border: '1px solid rgba(17, 78, 96, 0.16)', borderRadius: '8px', background: '#ffffff', color: '#114e60', font: 'inherit', padding: '10px 12px' }} type="text" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} placeholder="Your display name" /></label>
                                            <label style={{ display: 'grid', gap: '6px', color: '#114e60', fontSize: '0.82rem', fontWeight: 700 }}>Bio<textarea style={{ width: '100%', border: '1px solid rgba(17, 78, 96, 0.16)', borderRadius: '8px', background: '#ffffff', color: '#114e60', font: 'inherit', padding: '10px 12px', resize: 'vertical' }} value={profileBio} onChange={(event) => setProfileBio(event.target.value)} maxLength={500} rows={3} placeholder="Tell buyers a little about your collection." /></label>
                                            <label style={{ display: 'grid', gap: '6px', color: '#114e60', fontSize: '0.82rem', fontWeight: 700 }}>Avatar<input style={{ width: '100%', border: '1px solid rgba(17, 78, 96, 0.16)', borderRadius: '8px', background: '#ffffff', color: '#114e60', font: 'inherit', padding: '10px 12px' }} type="file" accept="image/*" onChange={(event) => setAvatarFile(event.target.files?.[0] || null)} /></label>
                                            <button type="submit" disabled={isSavingProfile} style={{ border: 'none', borderRadius: '10px', background: '#114e60', color: '#ffffff', cursor: isSavingProfile ? 'wait' : 'pointer', fontWeight: 800, padding: '11px 16px' }}>{isSavingProfile ? 'Saving...' : 'Save Profile'}</button>
                                        </form>
                                        <details style={{ overflow: 'hidden', border: '1px solid rgba(17, 78, 96, 0.16)', borderRadius: '12px', background: '#fffaf7' }}>
                                            <summary style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '18px', padding: '18px 20px', color: '#114e60', cursor: 'pointer' }}>
                                                <span><strong>Link Your Website</strong><small>£2.00 for 30 days on your public seller profile.</small></span>
                                                <span style={{ flex: '0 0 auto', borderRadius: '999px', background: websiteLinkStatus.isActive ? '#edf8ef' : '#fff1d9', color: websiteLinkStatus.isActive ? '#26733f' : '#8a4c09', fontSize: '0.7rem', fontWeight: 800, padding: '6px 9px' }}>{websiteLinkStatus.isActive ? `Active until ${new Date(websiteLinkStatus.expiresAt as string).toLocaleDateString()}` : 'Not linked'}</span>
                                            </summary>
                                            <div style={{ display: 'grid', gap: '14px', padding: '20px' }}>
                                                <label style={{ display: 'grid', gap: '6px', color: '#114e60', fontSize: '0.82rem', fontWeight: 700 }}>Website URL
                                                    <input style={{ width: '100%', border: '1px solid rgba(17, 78, 96, 0.16)', borderRadius: '8px', background: '#ffffff', color: '#114e60', font: 'inherit', padding: '10px 12px' }} type="text" name="marketplaceProfileEndpoint" inputMode="url" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} value={websiteUrlInput} onChange={(event) => setWebsiteUrlInput(event.target.value)} placeholder="https://your-store.example.com" />
                                                </label>
                                                <button type="button" onClick={handleStartWebsiteLink} disabled={isStartingWebsiteLink} style={{ width: '100%', border: 'none', borderRadius: '10px', background: '#114e60', color: '#ffffff', cursor: isStartingWebsiteLink ? 'wait' : 'pointer', fontWeight: 800, padding: '11px 16px' }}>{isStartingWebsiteLink ? 'Opening checkout...' : websiteLinkStatus.isActive ? 'Renew for another 30 days - £2.00' : 'Link your website - £2.00 for 30 days'}</button>
                                            </div>
                                        </details>
                                        <details open style={{ overflow: 'hidden', border: '1px solid rgba(88, 28, 135, 0.18)', borderRadius: '12px', background: '#faf5ff' }}>
                                            <summary style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '18px', padding: '18px 20px', color: '#581c87', cursor: 'pointer' }}>
                                                <span><strong>Direct Payment Link</strong><small>Paste your own Stripe Payment Link, PayPal.me, or Revolut link. Buyers pay you directly \u2014 Arkana never touches the money.</small></span>
                                                <span style={{ flex: '0 0 auto', borderRadius: '999px', background: directPaymentLinkInput ? '#f3e8ff' : '#f4f4f5', color: directPaymentLinkInput ? '#7e22ce' : '#71717a', fontSize: '0.7rem', fontWeight: 800, padding: '6px 9px' }}>{directPaymentLinkInput ? 'Linked' : 'Not linked'}</span>
                                            </summary>
                                            {directPaymentLinkInput && !isEditingDirectPaymentLink ? (
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap', padding: '20px' }}>
                                                    <p style={{ margin: 0, color: '#581c87', overflowWrap: 'anywhere' }}>Your active payment link: <a href={directPaymentLinkInput} target="_blank" rel="noopener noreferrer nofollow">{directPaymentLinkInput}</a></p>
                                                    <button type="button" className="account-text-btn" onClick={() => setIsEditingDirectPaymentLink(true)}>Edit link</button>
                                                </div>
                                            ) : (
                                                <form id="direct-payment-link-form" onSubmit={(event) => { event.preventDefault(); void handleSaveDirectPaymentLink(); }} style={{ display: 'grid', gap: '14px', padding: '20px' }}>
                                                    <label style={{ display: 'grid', gap: '6px', color: '#581c87', fontSize: '0.82rem', fontWeight: 700 }}>Your checkout link
                                                        <input id="direct-payment-link-input" style={{ width: '100%', border: '1px solid rgba(88, 28, 135, 0.2)', borderRadius: '8px', background: '#ffffff', color: '#581c87', font: 'inherit', padding: '10px 12px' }} type="text" name="marketplacePayoutEndpoint" inputMode="url" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} value={directPaymentLinkInput} onChange={(event) => setDirectPaymentLinkInput(event.target.value)} placeholder="https://buy.stripe.com/... or https://paypal.me/yourname" />
                                                    </label>
                                                    <button type="submit" id="save-direct-payment-link-btn" disabled={isSavingDirectPaymentLink} style={{ width: '100%', border: 'none', borderRadius: '10px', background: '#581c87', color: '#ffffff', cursor: isSavingDirectPaymentLink ? 'wait' : 'pointer', fontWeight: 800, padding: '11px 16px' }}>{isSavingDirectPaymentLink ? 'Saving...' : 'Save payment link'}</button>
                                                </form>
                                            )}
                                        </details>
                                        {/* Escrow entry point — dormant while ESCROW_LEGACY_ENABLED is false; logic below is untouched and functional. */}
                                        {ESCROW_LEGACY_ENABLED && (
                                            <details style={{ overflow: 'hidden', border: '1px solid rgba(17, 78, 96, 0.16)', borderRadius: '12px', background: '#fffaf7' }}>
                                                <summary style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '18px', padding: '18px 20px', color: '#114e60', cursor: 'pointer' }}>
                                                    <span><strong>Seller Verification &amp; Payout Setup</strong><small>Verify your identity and choose how you receive seller payouts.</small></span>
                                                    <span style={{ flex: '0 0 auto', borderRadius: '999px', background: '#fff1d9', color: '#8a4c09', fontSize: '0.7rem', fontWeight: 800, padding: '6px 9px' }}>{isStripePayoutEnabled ? 'Stripe payouts enabled' : 'Pending Stripe Connect'}</span>
                                                </summary>
                                                {!isStripePayoutEnabled && <div style={{ display: 'grid', gap: '14px', padding: '20px' }}>
                                                    <button type="button" onClick={handleStartConnect} disabled={isStartingConnect} style={{ width: '100%', border: 'none', borderRadius: '10px', background: '#114e60', color: '#ffffff', cursor: isStartingConnect ? 'wait' : 'pointer', fontWeight: 800, padding: '11px 16px' }}>{isStartingConnect ? 'Opening Stripe Connect...' : 'Set up secure payouts with Stripe'}</button>
                                                    <button type="button" onClick={handleStartPayPalConnect} disabled={isStartingPayPalConnect} style={{ width: '100%', border: 'none', borderRadius: '10px', background: '#2563eb', color: '#ffffff', cursor: isStartingPayPalConnect ? 'wait' : 'pointer', fontWeight: 800, padding: '11px 16px' }}>{isStartingPayPalConnect ? 'Opening PayPal...' : 'Connect your PayPal Account'}</button>
                                                </div>}
                                            </details>
                                        )}
                                        {ESCROW_LEGACY_ENABLED && <BuyerOrdersPanel />}
                                        {ESCROW_LEGACY_ENABLED && <SellerOrdersPanel />}
                                    </div>
                                ) : (
                                    <div className="auth-flow-shell">
                                        <div className="account-tabs" role="tablist" aria-label="Account option">
                                            <button type="button" role="tab" aria-selected={accountMode === 'signin'} className={accountMode === 'signin' ? 'active' : ''} onClick={() => { setAccountMode('signin'); setAccountStatus(null); }}>Sign in</button>
                                            <button type="button" role="tab" aria-selected={accountMode === 'signup'} className={accountMode === 'signup' ? 'active' : ''} onClick={() => { setAccountMode('signup'); setAccountStatus(null); }}>Create account</button>
                                        </div>
                                        <div className="auth-primary-module auth-form-scroll-wrapper">
                                            {isEmailSent ? (
                                                <div className="email-verification-panel" role="status">
                                                    <div className="email-verification-icon" aria-hidden="true">✉</div>
                                                    <h3>Account created successfully!</h3>
                                                    <p>Account created successfully! Please check your email inbox to verify your account before logging in.</p>
                                                    {accountStatus && <p className="account-status">{accountStatus}</p>}
                                                    <button type="button" className="resend-verification-btn" onClick={handleResendVerification} disabled={isResendingVerification}>
                                                        {isResendingVerification ? 'Sending...' : "Didn't receive the email? Click here to resend."}
                                                    </button>
                                                    <button type="button" className="account-text-btn" onClick={() => { setIsEmailSent(false); setAccountMode('signin'); setAccountStatus(null); }}>Back to sign in</button>
                                                </div>
                                            ) : isResetView ? (
                                                isResetSent ? (
                                                    <div className="email-verification-panel" role="status">
                                                        <div className="email-verification-icon" aria-hidden="true">✉</div>
                                                        <h3>Reset link sent</h3>
                                                        <p>Check your inbox for a password reset link. Follow it to choose a new password, then sign in.</p>
                                                        <button type="button" className="account-text-btn" onClick={() => { setIsResetView(false); setIsResetSent(false); setAccountStatus(null); }}>Back to sign in</button>
                                                    </div>
                                                ) : (
                                                    <form className="account-form" onSubmit={handlePasswordReset} autoComplete="on">
                                                        <div className="password-reset-intro">
                                                            <h3>Reset your password</h3>
                                                            <p>Enter the email address on your account and we'll send you a secure reset link.</p>
                                                        </div>
                                                        <label htmlFor="reset-email">Email address <span className="text-red-500 font-bold ml-0.5">*</span><input id="reset-email" name="username" type="email" inputMode="email" value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} onInvalid={handleRequiredFieldInvalid} onInput={handleRequiredFieldInput} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required aria-required="true" maxLength={254} placeholder="you@example.com" /><span className="field-error-text">This space must be filled in.</span></label>
                                                        {accountStatus && <p className="account-status" role="status">{accountStatus}</p>}
                                                        <button type="submit" className="primary-btn" disabled={isResetSubmitting}>{isResetSubmitting ? 'Sending...' : 'Send reset link'}</button>
                                                        <button type="button" className="account-text-btn" onClick={() => { setIsResetView(false); setAccountStatus(null); }}>Back to sign in</button>
                                                    </form>
                                                )
                                            ) : (
                                                <form className="account-form" onSubmit={handleAccountSubmit} autoComplete="on">
                                                    <label htmlFor="account-email">Email address <span className="text-red-500 font-bold ml-0.5">*</span><input id="account-email" name="username" type="email" inputMode="email" value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} onInvalid={handleRequiredFieldInvalid} onInput={handleRequiredFieldInput} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required aria-required="true" maxLength={254} placeholder="you@example.com" /><span className="field-error-text">This space must be filled in.</span></label>
                                                    <label htmlFor="account-password">Password <span className="text-red-500 font-bold ml-0.5">*</span>
                                                        <span className="password-field-wrap">
                                                            <input id="account-password" name={accountMode === 'signin' ? 'password' : 'new-password'} type={showPassword ? 'text' : 'password'} value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} onInvalid={handleRequiredFieldInvalid} onInput={handleRequiredFieldInput} autoComplete={accountMode === 'signin' ? 'current-password' : 'new-password'} required aria-required="true" minLength={6} maxLength={128} placeholder="At least 6 characters" />
                                                            <button type="button" className="password-toggle-btn" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
                                                                {showPassword ? (
                                                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                                                ) : (
                                                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                                                                )}
                                                            </button>
                                                        </span>
                                                        <span className="field-error-text">This space must be filled in.</span>
                                                    </label>
                                                    {accountMode === 'signup' && (
                                                        <label htmlFor="account-confirm-password">Confirm Password <span className="text-red-500 font-bold ml-0.5">*</span>
                                                            <span className="password-field-wrap">
                                                                <input id="account-confirm-password" name="new-password-confirmation" type={showPassword ? 'text' : 'password'} value={accountConfirmPassword} onChange={(event) => setAccountConfirmPassword(event.target.value)} onInvalid={handleRequiredFieldInvalid} onInput={handleRequiredFieldInput} autoComplete="new-password" required aria-required="true" minLength={6} maxLength={128} placeholder="Re-enter your password" />
                                                            </span>
                                                            <span className="field-error-text">This space must be filled in.</span>
                                                        </label>
                                                    )}
                                                    {accountMode === 'signin' && (
                                                        <button type="button" className="forgot-password-link" onClick={() => { setIsResetView(true); setIsResetSent(false); setAccountStatus(null); setShowResetMessage(true); }}>Forgot Password?</button>
                                                    )}
                                                    {showResetMessage && (
                                                        <p style={{ color: '#ef4444', fontSize: '0.78rem', margin: '2px 0 0' }}>Check your email to renew your password</p>
                                                    )}
                                                    {accountStatus && <p className="account-status" role="status">{accountStatus}</p>}
                                                    <button type="submit" className="primary-btn" disabled={isAccountSubmitting}>{isAccountSubmitting ? 'Please wait...' : accountMode === 'signin' ? 'Sign in' : 'Create account'}</button>
                                                    {accountMode === 'signup' && <p className="signup-consent">By creating an account, you agree to Arkana's <a href="#terms" onClick={(event) => { event.preventDefault(); setActiveLegalPage('terms'); }}>Terms of Service</a>, <a href="#privacy" onClick={(event) => { event.preventDefault(); setActiveLegalPage('privacy'); }}>Privacy Policy</a>, and <a href="#guidelines" onClick={(event) => { event.preventDefault(); setActiveLegalPage('terms'); }}>Seller Guidelines</a>. We use essential cookies to keep you securely signed in.</p>}
                                                </form>
                                            )}
                                        </div>
                                        {isNativeApp && (
                                            <div className="ios-settings-group">
                                                <button type="button" className="settings-action-row" onClick={() => setActiveView('Help')}>Help &amp; Support FAQ</button>
                                                <button type="button" className="settings-action-row" onClick={() => setActiveLegalPage('terms')}>Terms &amp; Conditions</button>
                                                <button type="button" className="settings-action-row" onClick={() => setActiveLegalPage('privacy')}>Privacy Policy</button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </section>
                    )}

                    {/* 2. DASHBOARD VIEW */}
                    {activeView === 'Dashboard' && (
                        <section className="dashboard-section">
                            <div className="dashboard-header-block">
                                <h2>Seller Analytics Dashboard</h2>
                                <p>Monitor your tarot shop's earnings, inventory velocity, and order performance data.</p>
                            </div>
                            <div className="stats-placeholder-grid">
                                <div className="stat-card">
                                    <span className="stat-icon">🎴</span>
                                    <h3>{listings.length}</h3>
                                    <p>Active Listings</p>
                                </div>
                                <div className="stat-card revenue-highlight">
                                    <span className="stat-icon">💰</span>
                                    <h3>£{totalRevenue.toFixed(2)}</h3>
                                    <p>Total Gross Revenue</p>
                                </div>
                                <div className="stat-card">
                                    <span className="stat-icon">📊</span>
                                    <h3>
                                        £{listings.length > 0
                                            ? (listings.reduce((acc, item) => acc + item.price, 0) / listings.length).toFixed(2)
                                            : "0.00"
                                        }
                                    </h3>
                                    <p>Avg. Active Listing Value</p>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* 3. LISTINGS VIEW */}
                    {/* 3. LISTINGS VIEW */}
                    {activeView === 'Listings' && (
                        <section className="listings-section">
                            <div className="section-header-row">
                                <div>
                                    <h2>Marketplace Listings</h2>
                                    <p>Browse authentic tarot and oracle decks from the community.</p>
                                </div>
                                <div className="listing-search-controls">
                                    <input type="text" name="marketplaceListingQuery" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search listings..." aria-label="Search listings" />
                                    <div className="listing-summary-badge">{filteredListings.length} live decks</div>
                                </div>
                            </div>
                            {listings.length === 0 ? (
                                <div className="items-placeholder-grid empty-state-card">
                                    <p className="empty-message">No decks listed yet.</p>
                                    <button className="primary-btn" onClick={handleStartCreate}>
                                        Add your first deck
                                    </button>
                                </div>
                            ) : filteredListings.length === 0 ? (
                                <div className="items-placeholder-grid empty-state-card">
                                    <p className="empty-message">No listings match your search.</p>
                                </div>
                            ) : (
                                <>
                                    {filteredListings.some((item) => item.listingType !== 'free') && (
                                        <div className="listings-live-grid listings-live-grid--paid">
                                            {filteredListings.filter((item) => item.listingType !== 'free').map((item) => <ProductListingCard key={item.id} item={item} inBasket={basket.some((basketItem) => basketItem.id === item.id)} currentUserId={session?.user.id ?? null} canConfirmOrderAccepted={buyerSoldListingIds.has(item.id)} directPaymentLink={sellerDirectPaymentLinks[item.sellerId]} onView={setViewingListing} onAddToBasket={handleAddToBasket} onEdit={handleStartEdit} onDelete={handleDelete} onConfirmOrderAccepted={handleConfirmOrderAccepted} onFlashMessage={setFlashMessage} onRequireSignIn={handleRequireSignIn} />)}
                                        </div>
                                    )}
                                    {filteredListings.some((item) => item.listingType === 'free') && (
                                        <>
                                            <h3 className="listings-tier-heading">Free to a good home</h3>
                                            <div className="listings-live-grid listings-live-grid--free">
                                                {filteredListings.filter((item) => item.listingType === 'free').map((item) => <ProductListingCard key={item.id} item={item} inBasket={basket.some((basketItem) => basketItem.id === item.id)} currentUserId={session?.user.id ?? null} canConfirmOrderAccepted={buyerSoldListingIds.has(item.id)} directPaymentLink={sellerDirectPaymentLinks[item.sellerId]} onView={setViewingListing} onAddToBasket={handleAddToBasket} onEdit={handleStartEdit} onDelete={handleDelete} onConfirmOrderAccepted={handleConfirmOrderAccepted} onFlashMessage={setFlashMessage} onRequireSignIn={handleRequireSignIn} />)}
                                            </div>
                                        </>
                                    )}
                                </>
                            )}
                        </section>
                    )}
                    {viewingListing && (
                        <div className="modal-backdrop" onClick={() => setViewingListing(null)}>
                            <div className="checkout-modal-card listing-detail-modal-card" onClick={(event) => event.stopPropagation()}>
                                <div className="modal-header">
                                    <h3>{viewingListing.name}</h3>
                                    <button className="close-modal-btn" onClick={() => setViewingListing(null)}>✕</button>
                                </div>
                                {viewingListing.images.length > 0 ? (
                                    <div className="listing-image-row listing-detail-modal-images">
                                        {viewingListing.images.map((imageUrl, index) => (
                                            <a key={imageUrl} href={imageUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open full-resolution image ${index + 1} of ${viewingListing.name}`}>
                                                <img src={imageUrl} alt={`${viewingListing.name} photo ${index + 1}`} className="live-uploaded-img" />
                                            </a>
                                        ))}
                                    </div>
                                ) : (
                                    <span className="default-card-emoji">🎴</span>
                                )}
                                {viewingListing.status === 'sold'
                                    ? <div className="listing-sold-badge bg-red-600 text-white font-bold text-center px-4 py-2 rounded-md uppercase tracking-wider">SOLD</div>
                                    : <span className={`listing-type-badge listing-type-badge--${viewingListing.listingType}`}>{viewingListing.listingType === 'sale' ? `For sale - £${viewingListing.price.toFixed(2)}` : viewingListing.listingType === 'swap' ? 'Open to swap' : 'Free to a good home'}</span>}
                                <p>Condition: {viewingListing.condition}{viewingListing.freeDelivery ? ' · Free delivery' : ''}</p>
                                {viewingListing.description && <p className="listing-description">{viewingListing.description}</p>}
                                <a className="seller-profile-link" href={`/app/profile/${encodeURIComponent(viewingListing.sellerId)}`}>View seller profile</a>
                                {viewingListing.status === 'sold' && buyerSoldListingIds.has(viewingListing.id) && (
                                    <div className="buyer-order-acceptance">
                                        <span>Item marked as sold. Have you safely received your deck?</span>
                                        <button type="button" onClick={() => void handleConfirmOrderAccepted(viewingListing.id)}>Confirm Order Accepted</button>
                                    </div>
                                )}
                                {viewingListing.status === 'active' && <div className="product-footer">
                                    {viewingListing.listingType === 'sale' ? (
                                        <PayOrMessageButton listingId={viewingListing.id} sellerId={viewingListing.sellerId} listingTitle={viewingListing.name} directPaymentLink={sellerDirectPaymentLinks[viewingListing.sellerId]} onRequireSignIn={handleRequireSignIn} />
                                    ) : (
                                        <button
                                            className="buy-btn"
                                            onClick={() => setFlashMessage(viewingListing.listingType === 'swap' ? `Contact the seller to arrange a swap for ${viewingListing.name}.` : `Contact the seller to arrange collection for ${viewingListing.name}.`)}
                                        >
                                            {viewingListing.listingType === 'swap' ? 'Arrange swap' : 'Request deck'}
                                        </button>
                                    )}
                                </div>}
                            </div>
                        </div>
                    )}
                    {/* 4. SELL VIEW */}
                    {activeView === 'Sell' && (
                        <section className="sell-section">
                            <h2>Create New Listing</h2>
                            <form onSubmit={handlePublish} className="sell-form create-listing-scroll-container">
                                <div className="form-group">
                                    <label>Listing type</label>
                                    <div className="listing-type-controls">
                                        <button type="button" className={listingType === 'sale' ? 'active' : ''} onClick={() => setListingType('sale')}>Sell</button>
                                        <button type="button" className={listingType === 'swap' ? 'active' : ''} onClick={() => { setListingType('swap'); setDeckPrice('0.00'); }}>Swap</button>
                                        <button type="button" className={listingType === 'free' ? 'active' : ''} onClick={() => { setListingType('free'); setDeckPrice('0.00'); setFreeDelivery(false); }}>Free</button>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Deck Name <span className="text-red-500 font-bold ml-0.5">*</span></label>
                                    <input
                                        type="text"
                                        name="marketplaceDeckTitle"
                                        autoComplete="off"
                                        autoCapitalize="words"
                                        value={deckName}
                                        onChange={(e) => setDeckName(e.target.value)}
                                        onInvalid={handleRequiredFieldInvalid}
                                        onInput={handleRequiredFieldInput}
                                        required
                                        aria-required="true"
                                        maxLength={120}
                                        placeholder="e.g., Rider-Waite Tarot"
                                    />
                                    <span className="field-error-text">This space must be filled in.</span>
                                </div>
                                <div className="form-group">
                                    <label>Price (£){listingType === 'sale' && <span className="text-red-500 font-bold ml-0.5">*</span>}{listingType !== 'sale' && ' - not needed'}</label>
                                    <input
                                        type="number"
                                        value={deckPrice}
                                        onChange={(e) => setDeckPrice(e.target.value)}
                                        placeholder="0.00"
                                        step="0.01"
                                        required={listingType === 'sale'}
                                        aria-required={listingType === 'sale'}
                                        onInvalid={handleRequiredFieldInvalid}
                                        onInput={handleRequiredFieldInput}
                                        disabled={listingType !== 'sale'}
                                    />
                                    {listingType === 'sale' && <span className="field-error-text">This space must be filled in.</span>}
                                </div>
                                <div className="form-group">
                                    <label htmlFor="deck-condition">Deck Condition <span className="text-red-500 font-bold ml-0.5">*</span></label>
                                    <select id="deck-condition" value={condition} required aria-required="true" onInvalid={handleRequiredFieldInvalid} onInput={handleRequiredFieldInput} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                        const nextCondition = e.target.value;
                                        if (['new', 'like new', 'good', 'fair', 'poor'].includes(nextCondition)) setCondition(nextCondition as DeckCondition);
                                    }}>
                                        <option value="new">New</option>
                                        <option value="like new">Like New</option>
                                        <option value="good">Good Condition</option>
                                        <option value="fair">Fair Condition</option>
                                        <option value="poor">Poor Condition</option>
                                    </select>
                                    <span className="field-error-text">This space must be filled in.</span>
                                </div>
                                {listingType !== 'free' && <div className="flex items-start space-x-3 py-2 checkbox-group">
                                    <label className="checkbox-label" htmlFor="free-delivery">
                                        <input
                                            id="free-delivery"
                                            type="checkbox"
                                            checked={freeDelivery}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFreeDelivery(e.target.checked)}
                                        />
                                        <span>Offer Free Delivery. Include delivery charges in the listing price.</span>
                                    </label>
                                </div>}
                                <div className="flex items-start space-x-3 py-2 checkbox-group external-link-toggle">
                                    <label className="checkbox-label" htmlFor="ai-authentication-toggle">
                                        <input
                                            id="ai-authentication-toggle"
                                            type="checkbox"
                                            checked={wantsAuthentication}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWantsAuthentication(e.target.checked)}
                                        />
                                        <span>Verify Item Authenticity (Request an AI analysis badge to increase buyer trust)</span>
                                    </label>
                                </div>
                                <div className="flex items-start space-x-3 py-2 checkbox-group external-link-toggle">
                                    <label className="checkbox-label" htmlFor="external-store-link">
                                        <input
                                            id="external-store-link"
                                            type="checkbox"
                                            checked={wantsExternalLink}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setWantsExternalLink(e.target.checked); if (!e.target.checked) setExternalLinkUrlError(null); }}
                                        />
                                        <span>Drive traffic directly to your own web store? (+£2.00 for 30 Days)</span>
                                    </label>
                                </div>
                                {wantsExternalLink && (
                                    <div className={`form-group external-link-field${externalLinkUrlError ? ' external-link-field--error' : ''}`}>
                                        <label>Your web store link <span className="text-red-500 font-bold ml-0.5">*</span></label>
                                        <input
                                            type="text"
                                            name="marketplaceExternalUrl"
                                            inputMode="url"
                                            autoComplete="off"
                                            autoCorrect="off"
                                            autoCapitalize="none"
                                            spellCheck={false}
                                            value={externalStoreUrl}
                                            onChange={(e) => { setExternalStoreUrl(e.target.value); if (externalLinkUrlError) setExternalLinkUrlError(null); }}
                                            onBlur={(e) => setExternalLinkUrlError(e.target.value.trim() && !isValidExternalUrl(e.target.value) ? 'Enter a valid URL starting with http:// or https://.' : null)}
                                            onInvalid={handleRequiredFieldInvalid}
                                            onInput={handleRequiredFieldInput}
                                            required={wantsExternalLink}
                                            aria-required={wantsExternalLink}
                                            aria-invalid={Boolean(externalLinkUrlError)}
                                            placeholder="https://your-store.example.com"
                                        />
                                        <span className="field-error-text">This space must be filled in.</span>
                                        {externalLinkUrlError && <span className="external-link-error-text" role="alert">{externalLinkUrlError}</span>}
                                    </div>
                                )}
                                <div className="form-group">
                                    <label>Description</label>
                                    <textarea value={deckDescription} onChange={(e) => setDeckDescription(e.target.value)} maxLength={2000} placeholder={condition === 'poor' ? 'Please detail specific wear and tear, missing cards, or scuffed box outlines here...' : condition === 'new' || condition === 'like new' ? 'Mention any unopened packaging, pristine edges, or original inserts here...' : condition === 'fair' ? 'Please describe visible wear, marks, missing cards, or box damage here...' : 'Describe the deck condition, edition, missing cards, or what you would swap for.'} rows={4} />
                                </div>
                                <div className="form-group">
                                    <label>Deck Cover Image</label>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        onChange={handleImageChange}
                                    />
                                    {imagePreviews.length > 0 && <div className="image-status">{imagePreviews.length} image{imagePreviews.length === 1 ? '' : 's'} selected and ready to publish</div>}
                                    {imagePreviews.length > 0 && <div className="image-preview-list">
                                        {imagePreviews.map((previewUrl, index) => (
                                            <div key={previewUrl} className="image-preview-wrapper">
                                                <img src={previewUrl} alt={`Selected deck preview ${index + 1}`} className="image-preview-thumbnail" />
                                                <button type="button" className="image-delete-badge-btn" onClick={() => handleRemoveImage(index)} aria-label={`Remove image ${index + 1}`}>✕</button>
                                            </div>
                                        ))}
                                    </div>}
                                </div>
                                <button type="submit" className="primary-btn publish-listing-btn" disabled={isRentingExternalLink}>{isRentingExternalLink ? 'Opening payment...' : 'Publish Listing'}</button>
                            </form>
                        </section>
                    )}

                    {/* 5. CHECKOUT VIEW — escrow entry point, dormant while ESCROW_LEGACY_ENABLED is false. */}
                    {ESCROW_LEGACY_ENABLED && activeView === 'Checkout' && (
                        <CheckoutViewIntegrated basket={basket} onRemoveFromBasket={(listingId) => setBasket((currentBasket) => currentBasket.filter((item) => item.id !== listingId))} onSignIn={() => setActiveView('Account')} onOpenLegal={(page) => setActiveLegalPage(page)} onFlashMessage={setFlashMessage} />
                    )}

                    {activeView === 'Help' && (
                        <HelpView />
                    )}

                    {activeView === 'Production' && (
                        <ProductionChecklistView checklist={productionChecklist} />
                    )}
                </main>

                {!isNativeApp && (
                    <footer className="site-footer">
                        <div className="site-footer-inner">
                            <p className="footer-brand whitespace-nowrap">Arkana</p>
                            <div className="footer-links" aria-label="Legal information">
                                <button type="button" className="footer-link-btn" onClick={() => setActiveLegalPage('terms')}>Terms & Conditions</button>
                                <button type="button" className="footer-link-btn" onClick={() => setActiveLegalPage('privacy')}>Privacy Policy</button>
                                <button type="button" className="footer-link-btn" onClick={() => setActiveLegalPage('refunds')}>Refunds</button>
                                <button type="button" className="footer-link-btn" onClick={() => setActiveLegalPage('shipping')}>Shipping</button>
                            </div>
                        </div>
                    </footer>
                )}

                {isNativeApp && (
                    <nav className="bottom-tab-bar" aria-label="Primary">
                        <button
                            type="button"
                            className={`tab-item${activeView === 'Listings' || activeView === 'Home' ? ' is-active' : ''}`}
                            aria-current={activeView === 'Listings' || activeView === 'Home' ? 'page' : undefined}
                            onClick={() => setActiveView('Listings')}
                        >
                            <span className="tab-icon" aria-hidden="true">🛍</span>
                            <span className="tab-label">Marketplace</span>
                        </button>
                        <button
                            type="button"
                            className="tab-item"
                            onClick={() => {
                                setActiveView('Listings');
                                requestAnimationFrame(() => nativeSearchRef.current?.focus());
                            }}
                        >
                            <span className="tab-icon" aria-hidden="true">🔍</span>
                            <span className="tab-label">Search</span>
                        </button>
                        <button
                            type="button"
                            className={`tab-item tab-item--primary${activeView === 'Sell' ? ' is-active' : ''}`}
                            aria-current={activeView === 'Sell' ? 'page' : undefined}
                            onClick={handleStartCreate}
                        >
                            <span className="tab-icon tab-icon--primary" aria-hidden="true">+</span>
                            <span className="tab-label">Create</span>
                        </button>
                        <button
                            type="button"
                            className={`tab-item${activeView === 'Account' ? ' is-active' : ''}`}
                            aria-current={activeView === 'Account' ? 'page' : undefined}
                            onClick={() => { setIsMobileMenuOpen(false); setActiveView('Account'); }}
                        >
                            <span className="tab-icon" aria-hidden="true">👤</span>
                            <span className="tab-label">Account</span>
                        </button>
                    </nav>
                )}

                {/* OVERLAY CHECKOUT MODAL WINDOW — escrow entry point, dormant while ESCROW_LEGACY_ENABLED is false. */}
                {ESCROW_LEGACY_ENABLED && checkoutStep !== null && selectedItem && (
                    <div className="modal-backdrop">
                        <div className="checkout-modal-card">
                            <header className="modal-header">
                                <h3>Checkout: {selectedItem.name}</h3>
                                <button className="close-modal-btn" onClick={() => { setCheckoutStep(null); setSelectedItem(null); }}>✕</button>
                            </header>

                            {/* STEP A: AUTH PROMPT */}
                            {checkoutStep === 'auth' && (
                                <div className="modal-step-view">
                                    <p className="step-instruction-text">Sign in to your account or continue as a guest.</p>
                                    <div className="trust-inline-copy">Fast checkout • Secure payments • Clear shipping updates</div>
                                    <form onSubmit={handleLoginSubmit} className="modal-auth-form">
                                        <div className="form-group">
                                            <label>Email Address <span className="text-red-500 font-bold ml-0.5">*</span></label>
                                            <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} onInvalid={handleRequiredFieldInvalid} onInput={handleRequiredFieldInput} required aria-required="true" maxLength={254} />
                                            <span className="field-error-text">This space must be filled in.</span>
                                        </div>
                                        <div className="form-group">
                                            <label>Password <span className="text-red-500 font-bold ml-0.5">*</span></label>
                                            <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onInvalid={handleRequiredFieldInvalid} onInput={handleRequiredFieldInput} required aria-required="true" maxLength={128} />
                                            <span className="field-error-text">This space must be filled in.</span>
                                        </div>
                                        <button type="submit" className="buy-btn">Sign In & Continue</button>
                                    </form>
                                    <div className="divider-line-text"><span>or</span></div>
                                    <button className="secondary-btn guest-btn" onClick={handleGuestCheckout}>
                                        🏃 Checkout as Guest
                                    </button>
                                </div>
                            )}

                            {/* STEP B: DELIVERY SELECTION */}
                            {checkoutStep === 'delivery' && (
                                <div className="modal-step-view">
                                    <p className="step-instruction-text">Choose your preferred shipping method:</p>
                                    <div className="delivery-options-stack">
                                        <label className={`delivery-card-option ${deliveryMethod === 'standard' ? 'selected' : ''}`}>
                                            <input
                                                type="radio"
                                                name="delivery"
                                                checked={deliveryMethod === 'standard'}
                                                onChange={() => setDeliveryMethod('standard')}
                                            />
                                            <div className="delivery-card-details">
                                                <strong>Standard Shipping</strong>
                                                <span>Delivered within 3-5 working days</span>
                                            </div>
                                            <span className="delivery-price">£2.99</span>
                                        </label>

                                        <label className={`delivery-card-option ${deliveryMethod === 'express' ? 'selected' : ''}`}>
                                            <input
                                                type="radio"
                                                name="delivery"
                                                checked={deliveryMethod === 'express'}
                                                onChange={() => setDeliveryMethod('express')}
                                            />
                                            <div className="delivery-card-details">
                                                <strong>Express Delivery</strong>
                                                <span>Tracked next-day delivery dispatch</span>
                                            </div>
                                            <span className="delivery-price">£5.50</span>
                                        </label>

                                        <label className={`delivery-card-option ${deliveryMethod === 'collection' ? 'selected' : ''}`}>
                                            <input
                                                type="radio"
                                                name="delivery"
                                                checked={deliveryMethod === 'collection'}
                                                onChange={() => setDeliveryMethod('collection')}
                                            />
                                            <div className="delivery-card-details">
                                                <strong>Collect in person</strong>
                                                <span>Arrange a collection time with the seller after requesting the deck</span>
                                            </div>
                                            <span className="delivery-price">Free</span>
                                        </label>
                                    </div>
                                    <div className="order-inline-total">
                                        {deliveryMethod === 'collection' ? 'No delivery charge. Payment is arranged safely with the seller.' : <>Order total updates live: <strong>£{(selectedItem.price + deliveryFee).toFixed(2)}</strong></>}
                                    </div>
                                    <button className="buy-btn action-forward-btn" onClick={() => setCheckoutStep('payment')}>
                                        Proceed to Payment →
                                    </button>
                                </div>
                            )}

                            {/* STEP C: MULTI-GATEWAY PAYMENT OPTIONS */}
                            {checkoutStep === 'payment' && (
                                <div className="modal-step-view">
                                    <p className="step-instruction-text">Review your order total and select a payment method:</p>
                                    <div className="order-summary-box">
                                        <div className="summary-row"><span>Deck Subtotal</span><span>£{selectedItem.price.toFixed(2)}</span></div>
                                        <div className="summary-row"><span>{deliveryMethod === 'collection' ? 'Collection' : 'Shipping'}</span><span>{deliveryMethod === 'collection' ? 'Free' : `£${deliveryFee.toFixed(2)}`}</span></div>
                                        <div className="summary-row total-row"><strong>{deliveryMethod === 'collection' ? 'Pay on collection' : 'Final Total'}</strong><strong>£{orderTotal.toFixed(2)}</strong></div>
                                    </div>

                                    <div className="terms-row">
                                        <input
                                            id="terms-checkbox"
                                            type="checkbox"
                                            checked={termsAccepted}
                                            onChange={(e) => setTermsAccepted(e.target.checked)}
                                        />
                                        <label htmlFor="terms-checkbox">
                                            I agree to the Terms of Service, Privacy Policy, and Seller Guidelines.
                                        </label>
                                    </div>

                                    {deliveryMethod === 'collection' ? (
                                        <div className="collection-payment-panel">
                                            <p>Pay the seller in cash when you collect. The seller confirms the collection time and address after accepting your request.</p>
                                            <button className="buy-btn secure-payment-final-btn" onClick={() => handleFinalisePayment('Cash')} disabled={!termsAccepted}>Request collection and pay cash</button>
                                        </div>
                                    ) : (
                                        <div className="payment-gateway-buttons">
                                            <button className="buy-btn secure-payment-final-btn" onClick={() => handleFinalisePayment('Stripe')} disabled={!termsAccepted}>
                                                Pay with Stripe
                                            </button>
                                            <button className="paypal-btn" onClick={() => handleFinalisePayment('PayPal')} disabled={!termsAccepted}>
                                                Pay with PayPal
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {showTermsModal && (
                    <div className="modal-backdrop terms-modal-backdrop" onClick={() => setShowTermsModal(false)}>
                        <div className="terms-modal-panel" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header terms-modal-header">
                                <h3>Terms & Conditions</h3>
                                <button className="close-modal-btn" onClick={() => setShowTermsModal(false)}>✕</button>
                            </div>
                            <div className="terms-modal-body">
                                <p>By using ArkanaDeck, you agree to comply with our marketplace rules, shipping policies, and payment terms.</p>
                                <p>Payments are processed securely via Stripe. Sellers are responsible for accurate listings, safe packaging, and timely dispatch.</p>
                                <p>Buyers are responsible for providing correct shipping details and confirming their order before payment.</p>
                                <p>We are not liable for delays caused by couriers, incorrect address information, or circumstances beyond our reasonable control.</p>
                                <p>Refunds are subject to our returns and dispute policy. Accounts may be suspended if marketplace rules are violated.</p>
                                <p>By continuing, you confirm that you understand the platform terms and complete the purchase at your own risk.</p>
                            </div>
                            <button className="primary-btn terms-accept-btn" onClick={() => { setTermsAccepted(true); setShowTermsModal(false); }}>
                                I agree
                            </button>
                        </div>
                    </div>
                )}

                {activeLegalPage && (
                    <div className="modal-backdrop terms-modal-backdrop" onClick={() => setActiveLegalPage(null)}>
                        <div className="terms-modal-panel legal-modal-panel" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header terms-modal-header">
                                <h3>
                                    {activeLegalPage === 'terms' && 'Terms & Conditions'}
                                    {activeLegalPage === 'privacy' && 'Privacy Policy'}
                                    {activeLegalPage === 'refunds' && 'Refund Policy'}
                                    {activeLegalPage === 'shipping' && 'Shipping Policy'}
                                </h3>
                                <button className="close-modal-btn" onClick={() => setActiveLegalPage(null)}>✕</button>
                            </div>
                            <div className="terms-modal-body legal-modal-body">
                                {activeLegalPage === 'terms' && (
                                    <>
                                        <p>By using Arkana, you agree to comply with our marketplace rules, payment terms, and seller obligations.</p>
                                        <p>All listings must be accurate, lawful, and clearly described. Sellers are responsible for dispatching items in a safe and timely manner.</p>
                                        <p>Buyers are responsible for providing accurate delivery details and confirming the order before payment is processed.</p>
                                        <p>We are not liable for delays caused by courier services, incomplete address information, or circumstances outside of our reasonable control.</p>
                                    </>
                                )}

                                {activeLegalPage === 'privacy' && (
                                    <>
                                        <p>We collect your name, email address, order details, and delivery information to process purchases and maintain a secure marketplace account.</p>
                                        <p>Information is stored securely and used only for order fulfilment, customer support, and platform administration.</p>
                                        <p>We do not sell personal data to third parties. Payment processing is handled through our trusted gateway services.</p>
                                    </>
                                )}

                                {activeLegalPage === 'refunds' && (
                                    <>
                                        <p>Refunds may be issued when an item is damaged, incorrect, or not received within the stated service window.</p>
                                        <p>Claims must be raised within 48 hours of delivery and must include proof of issue such as a photograph or parcel description.</p>
                                        <p>Refunds are reviewed case by case. If a seller has fulfilled the order correctly, the refund may be denied.</p>
                                    </>
                                )}

                                {activeLegalPage === 'shipping' && (
                                    <>
                                        <p>Standard UK delivery is typically completed within 3 to 5 working days. Express delivery is available at checkout.</p>
                                        <p>Dispatch times may vary depending on the seller and stock availability. Orders are packed and shipped with care, but courier delays remain outside our control.</p>
                                        <p>Customers are responsible for ensuring their address is complete and accurate before final payment.</p>
                                    </>
                                )}
                            </div>
                            <button className="primary-btn terms-accept-btn" onClick={() => setActiveLegalPage(null)}>
                                Close
                            </button>
                        </div>
                    </div>
                )}
                <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000 }}>
                    <button type="button" aria-label="Open support chat" style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#0f172a', color: '#ffffff', fontSize: '24px', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} onClick={() => setIsChatOpen(!isChatOpen)}>🔮</button>
                </div>
                {isChatOpen && <SupportChatModal onClose={() => setIsChatOpen(false)} onRequireSignIn={(message) => { setIsChatOpen(false); handleRequireSignIn(message); }} />}
            </div>
        </div>
    );
};

type SupportMessage = { id: string; sender_id: string; text: string; created_at: string };

const SUPPORT_SIGN_IN_MESSAGE = 'Sign in to contact Arkana support.';

const SupportChatModal: React.FC<{ onClose: () => void; onRequireSignIn: (message: string) => void }> = ({ onClose, onRequireSignIn }) => {
    const [messages, setMessages] = useState<SupportMessage[]>([]);
    const [messageText, setMessageText] = useState('');
    const [needsSignIn, setNeedsSignIn] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [ticketId, setTicketId] = useState<string | null>(null);

    useEffect(() => {
        if (!supabase) return;
        const client = supabase;
        let isMounted = true;
        let channel: ReturnType<typeof client.channel> | undefined;

        void getSupabaseSession().then(async (session) => {
            if (!session?.user || !isMounted) {
                if (isMounted) {
                    setStatus(SUPPORT_SIGN_IN_MESSAGE);
                    setNeedsSignIn(true);
                }
                return;
            }
            const { data, error } = await client.from('support_messages').select('id, sender_id, text, created_at').eq('sender_id', session.user.id).order('created_at', { ascending: true });
            if (!isMounted) return;
            if (error) {
                setStatus(error.message || 'Unable to load support messages.');
                return;
            }
            setMessages((data || []) as SupportMessage[]);
            channel = client.channel(`support:${session.user.id}`)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `sender_id=eq.${session.user.id}` }, (payload) => {
                    setMessages((current) => current.some((message) => message.id === payload.new.id) ? current : [...current, payload.new as SupportMessage]);
                })
                .subscribe();
        }).catch(() => { if (isMounted) setStatus('Unable to start support chat.'); });

        return () => {
            isMounted = false;
            if (channel) void channel.unsubscribe();
        };
    }, []);

    const sendMessage = async () => {
        const content = messageText.trim();
        if (!supabase || !content) return;
        try {
            const session = await getSupabaseSession();
            if (!session?.user) throw new Error(SUPPORT_SIGN_IN_MESSAGE);
            let activeTicketId = ticketId;
            if (!activeTicketId) {
                const { data: ticket, error: ticketError } = await supabase
                    .from('support_tickets')
                    .insert({ user_id: session.user.id })
                    .select('id')
                    .single();
                if (ticketError || !ticket) throw new Error(ticketError?.message || 'Unable to create support ticket.');
                activeTicketId = ticket.id;
                setTicketId(activeTicketId);
            }
            const { data, error } = await supabase.from('support_messages').insert({ ticket_id: activeTicketId, chat_id: null, sender_id: session.user.id, text: content, content }).select('id, sender_id, text, created_at').single();
            if (error || !data) throw new Error(error?.message || 'Unable to send support message.');
            setMessages((current) => current.some((message) => message.id === data.id) ? current : [...current, data as SupportMessage]);
            setMessageText('');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to send support message.';
            if (message === SUPPORT_SIGN_IN_MESSAGE) setNeedsSignIn(true);
            setStatus(message);
        }
    };

    return <div className="modal-backdrop" onClick={onClose}>
        <section className="checkout-modal-card support-chat-modal" role="dialog" aria-modal="true" aria-labelledby="support-chat-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
                <h3 id="support-chat-title">Arkana support</h3>
                <button type="button" className="close-modal-btn" aria-label="Close support chat" onClick={onClose}>✕</button>
            </div>
            <div className="seller-chat-messages" aria-live="polite">{messages.length === 0 ? <p>How can we help with your marketplace order?</p> : messages.map((message) => <p key={message.id}>{message.text}</p>)}</div>
            {status && <p className="account-status" role="status">{status}</p>}
            {needsSignIn
                ? <button type="button" className="primary-btn" onClick={() => onRequireSignIn(SUPPORT_SIGN_IN_MESSAGE)}>Go to sign in</button>
                : <form className="seller-chat-panel" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}><input type="text" aria-label="Support message" value={messageText} onChange={(event) => setMessageText(event.target.value)} placeholder="Write a message" maxLength={2000} required /><button type="submit" className="secondary-btn">Send</button></form>}
        </section>
    </div>;
};

const ImageLightbox: React.FC<{ src: string; alt: string; onClose: () => void }> = ({ src, alt, onClose }) => createPortal(
    <div className="image-lightbox" role="dialog" aria-modal="true" aria-label="Enlarged listing image" onClick={onClose}>
        <button type="button" className="image-lightbox__close" aria-label="Close enlarged image" onClick={onClose}>×</button>
        <img src={src} alt={alt} onClick={(event) => event.stopPropagation()} />
    </div>,
    document.body,
);

// Thrown by openDashboardChat when there is no session; used to route the user to sign in.
const SIGN_IN_REQUIRED_MESSAGE = 'Sign in to message this seller.';

// Dynamic payment action. The seller profile owns the database-backed chat routine.
const PayOrMessageButton: React.FC<{ listingId: string; sellerId: string; listingTitle: string; directPaymentLink: string | null | undefined; onRequireSignIn: () => void }> = ({ listingId, sellerId, listingTitle, directPaymentLink, onRequireSignIn }) => {
    return <DirectPaymentAction listingTitle={listingTitle} directPaymentLink={directPaymentLink} onChat={async (initialMessage) => {
        try {
            const chatId = await openDashboardChat(listingId, sellerId, listingTitle, initialMessage);
            window.location.href = `/app/messages?chatId=${encodeURIComponent(chatId)}`;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to open chat.';
            if (message === SIGN_IN_REQUIRED_MESSAGE) {
                if (window.confirm(message)) onRequireSignIn();
                return;
            }
            window.alert(message);
        }
    }} />;
};

const ProductListingCard: React.FC<{ item: DeckListing; inBasket: boolean; currentUserId: string | null; canConfirmOrderAccepted: boolean; directPaymentLink?: string | null; onView: (item: DeckListing) => void; onAddToBasket: (item: DeckListing) => void; onEdit: (item: DeckListing) => void; onDelete: (id: string) => void; onConfirmOrderAccepted: (id: string) => Promise<void>; onFlashMessage: (message: string) => void; onRequireSignIn: () => void }> = ({ item, inBasket, currentUserId, canConfirmOrderAccepted, directPaymentLink, onView, onAddToBasket, onEdit, onDelete, onConfirmOrderAccepted, onFlashMessage, onRequireSignIn }) => {
    const [currentImgIdx, setCurrentImgIdx] = useState(0);
    const [isMagnified, setIsMagnified] = useState(false);
    const images = item.images;
    const isOwner = item.sellerId === currentUserId;

    const changeImage = (event: React.MouseEvent<HTMLButtonElement>, direction: number) => {
        event.preventDefault();
        event.stopPropagation();
        setCurrentImgIdx((index) => (index + direction + images.length) % images.length);
    };

    return <div className={`live-product-card flex flex-col ${item.listingType === 'free' ? 'card-free-tier' : 'card-paid-tier'}`} role="button" tabIndex={0} onClick={() => onView(item)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onView(item); } }}>
        <div className="product-image-box product-image-box--carousel relative w-full aspect-square overflow-hidden bg-slate-50 rounded-xl" style={{ maxWidth: '500px', marginInline: 'auto', aspectRatio: '1 / 1' }}>
            {images.length > 0 ? <button type="button" className="listing-carousel__image" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setIsMagnified(true); }} aria-label={`Magnify image ${currentImgIdx + 1} of ${item.name}`}><img src={images[currentImgIdx]} alt={`${item.name} photo ${currentImgIdx + 1}`} className="absolute inset-0 w-full h-full object-contain" style={{ objectFit: 'contain' }} /></button> : <span className="default-card-emoji">🎴</span>}
            {images.length > 1 && <><button type="button" className="listing-carousel__nav listing-carousel__nav--previous" aria-label="Previous image" onClick={(event) => changeImage(event, -1)}>‹</button><button type="button" className="listing-carousel__nav listing-carousel__nav--next" aria-label="Next image" onClick={(event) => changeImage(event, 1)}>›</button></>}
        </div>
        <div className="product-details flex flex-col min-h-[180px]">
            <h4 className="deck-title">{item.name}</h4>
            <a className="seller-profile-link" href={`/app/profile/${encodeURIComponent(item.sellerId)}`} onClick={(event) => event.stopPropagation()}>View seller profile</a>
            {item.status === 'sold'
                ? <div className="listing-sold-badge bg-red-600 text-white font-bold text-center px-4 py-2 rounded-md uppercase tracking-wider">SOLD</div>
                : <span className={`listing-type-badge listing-type-badge--${item.listingType}`}>{item.listingType === 'sale' ? `For sale - £${item.price.toFixed(2)}` : item.listingType === 'swap' ? 'Open to swap' : 'Free to a good home'}</span>}
            {item.reviewStatus === 'pending_review' && <span className="listing-type-badge listing-type-badge--pending">Pending review</span>}
            {item.description && <p className="listing-description deck-description">{item.description}</p>}
            {item.status === 'sold' && canConfirmOrderAccepted && (
                <div className="buyer-order-acceptance" onClick={(event) => event.stopPropagation()}>
                    <span>Item marked as sold. Have you safely received your deck?</span>
                    <button type="button" onClick={(event) => { event.stopPropagation(); void onConfirmOrderAccepted(item.id); }}>Confirm Order Accepted</button>
                </div>
            )}
            {item.status === 'active' && <div className="product-footer">
                {item.listingType === 'sale'
                    ? <PayOrMessageButton listingId={item.id} sellerId={item.sellerId} listingTitle={item.name} directPaymentLink={directPaymentLink} onRequireSignIn={onRequireSignIn} />
                    : <button className="buy-btn btn-basket" onClick={(event) => { event.stopPropagation(); onFlashMessage(item.listingType === 'swap' ? `Contact the seller to arrange a swap for ${item.name}.` : `Contact the seller to arrange collection for ${item.name}.`); }}>{item.listingType === 'swap' ? 'Arrange swap' : 'Request deck'}</button>}
                {isOwner && (
                    <div className="flex gap-2 w-full border-t border-gray-100 mt-3 pt-3">
                        <button className="edit-btn flex-1" onClick={(event) => { event.stopPropagation(); onEdit(item); }}>✏️ Edit</button>
                        <button className="delete-btn flex-1" onClick={(event) => { event.stopPropagation(); onDelete(item.id); }}>🗑️ Delete</button>
                    </div>
                )}
            </div>}
        </div>
        {isMagnified && images[currentImgIdx] && <ImageLightbox src={images[currentImgIdx]} alt={`${item.name} photo ${currentImgIdx + 1}`} onClose={() => setIsMagnified(false)} />}
    </div>;
};

// ========================================================
// 5. INTEGRATED CHECKOUT VIEW COMPONENT
// ========================================================
const CheckoutViewIntegrated: React.FC<{ basket: BasketItem[]; onRemoveFromBasket: (listingId: string) => void; onSignIn: () => void; onOpenLegal: (page: 'terms' | 'privacy') => void; onFlashMessage: (message: string) => void }> = ({ basket, onRemoveFromBasket, onSignIn, onOpenLegal, onFlashMessage }) => {
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
        const ukPostcodeRegex = /^[A-Z]{1, 2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$/;
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
            console.log('Checkout gateway selected', { gateway: selectedGateway });
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
                            <input type="text" value={postcode} onChange={handlePostcodeChange} onInvalid={handleRequiredFieldInvalid} onInput={handleRequiredFieldInput} autoComplete="postal-code" required aria-required="true" maxLength={10} placeholder="SW1A 1AA" aria-invalid={!isPostcodeValid} />
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
                                    onChange={() => {
                                        setSelectedGateway(gateway);
                                        console.log('Payment gateway toggled', { gateway });
                                    }}
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
            </div >
        </section >
    );
};

type BuyerOrder = {
    id: string;
    status: string;
    total: number;
    tracking_reference: string | null;
    listings: { name: string }[];
};

const BuyerOrdersPanel: React.FC = () => {
    const [orders, setOrders] = React.useState<BuyerOrder[]>([]);
    const [statusMessage, setStatusMessage] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!supabase) return;
        supabase.from('orders').select('id, status, total, tracking_reference, listings(name)').order('created_at', { ascending: false })
            .then(({ data, error }) => {
                if (error) setStatusMessage(error.message);
                else setOrders((data || []) as BuyerOrder[]);
            });

    }, []);

    const submitOrderAction = async (endpoint: string, orderId: string, reason?: string) => {
        setStatusMessage(null);
        try {
            const session = await getSupabaseSession();
            if (!session?.access_token) throw new Error('Sign in before updating an order.');
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({ orderId, reason }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload?.error || 'Unable to update this order.');
            setOrders((currentOrders) => currentOrders.map((order) => order.id === orderId ? { ...order, status: endpoint.includes('confirm') ? 'completed' : 'disputed' } : order));
            setStatusMessage(endpoint.includes('confirm') ? 'Receipt confirmed. The seller payout is being released.' : 'Problem reported. The seller payout is now on hold.');
        } catch (error) {
            setStatusMessage(error instanceof Error ? error.message : 'Unable to update this order.');
        }
    };

    const handleReportProblem = (orderId: string) => {
        const reason = window.prompt('Tell us what was wrong with the item or delivery.');
        if (reason?.trim()) submitOrderAction('/api/report-order-problem', orderId, reason);
    };

    return (
        <section className="buyer-orders-panel">
            <div className="buyer-orders-heading"><div><h3>Your purchases</h3><p>Confirm when an item arrives as described. Problems pause the seller payout for review.</p></div></div>
            {statusMessage && <p className="account-status" role="status">{statusMessage}</p>}
            {orders.length === 0 ? <p className="buyer-orders-empty">No purchases yet.</p> : (
                <div className="buyer-orders-list">
                    {orders.map((order) => (
                        <article className="buyer-order" key={order.id}>
                            <div><strong>{order.listings[0]?.name || 'Marketplace order'}</strong><span>{order.status.replace(/_/g, ' ')}{order.tracking_reference ? ` - Tracking: ${order.tracking_reference}` : ''}</span></div>
                            <div className="buyer-order-actions">
                                <strong>£{Number(order.total).toFixed(2)}</strong>
                                {order.status === 'dispatched' && <button type="button" onClick={() => submitOrderAction('/api/mark-order-delivered', order.id)}>Item has arrived</button>}
                                {order.status === 'delivered' && <><button type="button" onClick={() => submitOrderAction('/api/confirm-order-received', order.id)}>Received as described</button><button type="button" className="buyer-report-btn" onClick={() => handleReportProblem(order.id)}>Report a problem</button></>}
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </section>
    );
};

type SellerOrder = {
    id: string;
    delivery_service: string | null;
    delivery_name: string | null;
    delivery_address_line_1: string | null;
    delivery_address_line_2: string | null;
    delivery_city: string | null;
    delivery_postcode: string | null;
    listings: { name: string }[];
};

const SellerOrderDispatchCard: React.FC<{ order: SellerOrder; trackingValue: string; onTrackingChange: (value: string) => void; onDispatch: () => void }> = ({ order, trackingValue, onTrackingChange, onDispatch }) => {
    const evriQuickLink = useMemo(() => `https://evri.com?postcode=${encodeURIComponent(order.delivery_postcode || '')}`, [order.delivery_postcode]);
    const royalMailUrl = 'https://royalmail.com';

    return <article className="buyer-order" key={order.id}>
        <div><strong>{order.listings[0]?.name || 'Marketplace order'}</strong><span>{order.delivery_service} to {order.delivery_city}, {order.delivery_postcode}</span></div>
        <div className="address-box">
            <strong>Delivery address</strong>
            <span>{order.delivery_name || 'Buyer name unavailable'}</span>
            <span>{order.delivery_address_line_1 || 'Address unavailable'}</span>
            {order.delivery_address_line_2 && <span>{order.delivery_address_line_2}</span>}
            <span>{[order.delivery_city, order.delivery_postcode].filter(Boolean).join(', ') || 'Location unavailable'}</span>
            <span>United Kingdom</span>
        </div>
        <div className="seller-dispatch-actions">
            <a className="seller-label-link" href={evriQuickLink} target="_blank" rel="noopener noreferrer">Buy Evri Label (£2.99)</a>
            <a className="seller-label-link" href={royalMailUrl} target="_blank" rel="noopener noreferrer">Buy Label on Royal Mail</a>
            <label className="visually-hidden" htmlFor={`tracking-${order.id}`}>Tracking reference <span className="text-red-500 font-bold ml-0.5">*</span></label>
            <input id={`tracking-${order.id}`} value={trackingValue} onChange={(event) => onTrackingChange(event.target.value)} required aria-required="true" maxLength={100} placeholder="Tracking reference" />
            <button type="button" onClick={onDispatch}>Mark dispatched</button>
        </div>
    </article>;
};

const SellerOrdersPanel: React.FC = () => {
    const [orders, setOrders] = React.useState<SellerOrder[]>([]);
    const [trackingValues, setTrackingValues] = React.useState<Record<string, string>>({});
    const [statusMessage, setStatusMessage] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!supabase) return;
        supabase.from('orders').select('id, delivery_service, delivery_name, delivery_address_line_1, delivery_address_line_2, delivery_city, delivery_postcode, listings(name)').eq('status', 'paid').order('created_at', { ascending: false })
            .then(({ data, error }) => {
                if (error) setStatusMessage(error.message);
                else setOrders((data || []) as SellerOrder[]);
            });
    }, []);

    const dispatchOrder = async (orderId: string) => {
        const trackingReference = trackingValues[orderId]?.trim();
        if (!trackingReference) return;
        try {
            const session = await getSupabaseSession();
            if (!session?.access_token) throw new Error('Sign in before dispatching an order.');
            const response = await fetch('/api/dispatch-order', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ orderId, trackingReference }) });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload?.error || 'Unable to dispatch this order.');
            setOrders((currentOrders) => currentOrders.filter((order) => order.id !== orderId));
            setStatusMessage('Order dispatched. The buyer can now confirm receipt.');
        } catch (error) {
            setStatusMessage(error instanceof Error ? error.message : 'Unable to dispatch this order.');
        }
    };

    return <section className="seller-orders-panel">
        <div className="buyer-orders-heading"><div><h3>Orders to dispatch</h3><p>Buy postage through Parcel2Go or your preferred courier, then add the tracking reference.</p></div></div>
        {statusMessage && <p className="account-status" role="status">{statusMessage}</p>}
        {orders.length === 0 ? <p className="buyer-orders-empty">No paid orders waiting for dispatch.</p> : <div className="buyer-orders-list">{orders.map((order) => <SellerOrderDispatchCard key={order.id} order={order} trackingValue={trackingValues[order.id] || ''} onTrackingChange={(value) => setTrackingValues((current) => ({ ...current, [order.id]: value }))} onDispatch={() => dispatchOrder(order.id)} />)}</div>}
    </section>;
};

const HELP_FAQ_ITEMS = [
    {
        question: 'How does delivery work?',
        answer: 'Arkana is a direct peer-to-peer notice board. Buyers and sellers communicate directly via our contact methods to arrange mutually agreeable collection, local drop-off, or postage options.',
    },
    {
        question: 'How do payments work?',
        answer: 'As a commission-free notice board, Arkana does not process financial transactions directly on the app. All arrangements, payments, or deck swaps are handled completely independently between the buyer and seller.',
    },
    {
        question: 'What if there is a problem with a listing?',
        answer: 'Buyers can report fraudulent, inaccurate, or inappropriate notice board listings directly through the app interface. Our team will review flagged items and permanently remove listings or profiles violating community safety guidelines.',
    },
    {
        question: 'How do swaps and free decks work?',
        answer: "Sellers can mark their card listings as available for 'Swap' or 'Free'. Simply tap the contact method on the listing notice card to coordinate trading details directly with the owner.",
    },
    {
        question: "What is the 'Pay Direct to Seller' button?",
        answer: 'Anyone can attach a direct checkout link (like a custom Stripe or PayPal link) to their listing card. This allows buyers to purchase the deck directly from the owner securely off-platform. Arkana takes zero commission on these transactions.',
    },
    {
        question: 'Can I link to my own website storefront?',
        answer: "Yes! Premium profiles can add their personal web address link directly to their notice card listings. Tapping 'View seller profile' or their custom web link will open their independent shop canvas in a secure browser window.",
    },
];

const HelpView: React.FC = () => (
    <section className="help-page">
        <div className="help-page-heading">
            <p>Help & FAQ</p>
            <h2>Buying and selling on Arkana</h2>
        </div>
        <div className="help-grid">
            {HELP_FAQ_ITEMS.map((item) => (
                <article className="help-card" key={item.question}>
                    <h3>{item.question}</h3>
                    <p>{item.answer}</p>
                </article>
            ))}
        </div>
    </section>
);

// ========================================================
// 6. INTEGRATED SELLER DASHBOARD COMPONENT
// ========================================================
const ProductionChecklistView: React.FC<{ checklist: ReturnType<typeof getProductionChecklist> }> = ({ checklist }) => {
    const pendingItems = checklist.filter((item) => item.status === 'pending');
    const warningItems = checklist.filter((item) => item.status === 'warning');

    return (
        <div className="production-checklist-panel">
            <div className="production-header">
                <div>
                    <p className="eyebrow">Launch readiness</p>
                    <h2>Production checklist for ArkanaDeck</h2>
                </div>
                <span className="production-badge">Secure launch gates</span>
            </div>

            <div className="checklist-status-grid">
                <div className="status-card status-card--ok">
                    <strong>{pendingItems.length === 0 ? 'Configuration complete' : 'Configuration required'}</strong>
                    <span>{pendingItems.length === 0 ? 'Required runtime configuration is present.' : `${pendingItems.length} configuration gate${pendingItems.length === 1 ? '' : 's'} still need attention.`}</span>
                </div>
                <div className="status-card status-card--warn">
                    <strong>{warningItems.length === 0 ? 'Launch checks complete' : 'Deployment verification'}</strong>
                    <span>{warningItems.length === 0 ? 'No deployment verification warnings remain.' : `${warningItems.length} deployment check${warningItems.length === 1 ? '' : 's'} still need verification.`}</span>
                </div>
            </div>

            <div className="checklist-list">
                {checklist.map((item) => (
                    <div key={item.title} className={`checklist-item checklist-item--${item.status}`}>
                        <div className="checklist-marker" aria-label={item.status}>{item.status === 'complete' ? '✓' : item.status === 'warning' ? '!' : '•'}</div>
                        <div>
                            <h3>{item.title}</h3>
                            <p>{item.detail}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="production-actions">
                <div className="production-action-block">
                    <h4>Required before public launch</h4>
                    <ul>
                        <li>Supabase Auth + protected sessions</li>
                        <li>Stripe or PayPal server confirmations</li>
                        <li>Listings, orders, and payments tables with RLS</li>
                        <li>HTTPS + secure headers + env secrets</li>
                    </ul>
                </div>
                <div className="production-action-block">
                    <h4>Release gate</h4>
                    <ul>
                        <li>QA payment test flow</li>
                        <li>Seller payout review</li>
                        <li>Incident logging and monitoring</li>
                        <li>Launch approval sign-off</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

const SellerDashboardIntegrated: React.FC = () => {
    const [trackingReference, setTrackingReference] = React.useState('');
    const [savedTrackingReference, setSavedTrackingReference] = React.useState('');
    const [isDispatched, setIsDispatched] = React.useState(false);

    const handleSaveTracking = () => {
        if (!trackingReference.trim()) return;
        setSavedTrackingReference(trackingReference.trim());
        setIsDispatched(true);
    };

    return (
        <div className="fulfillment-shell">
            <div className="fulfillment-header">
                <div>
                    <p className="fulfillment-kicker">Fulfillment</p>
                    <h2>Seller dispatch workflow</h2>
                </div>
                <span className="fulfillment-badge">UK locked</span>
            </div>

            <div className="fulfillment-brief">
                Fulfillment is the post-sale step where the seller packs, ships, and tracks the order until it reaches the buyer.
            </div>

            <div className="fulfillment-grid">
                <div className="fulfillment-card">
                    <h3>1. Pack</h3>
                    <p>Wrap the deck securely and protect the card box corners before sealing the parcel.</p>
                </div>
                <div className="fulfillment-card">
                    <h3>2. Customer address</h3>
                    <div className="address-box">
                        <span>Arkana Customer</span>
                        <span>18 Oak Row</span>
                        <span>Leeds, LS1 4AA</span>
                        <span>United Kingdom</span>
                    </div>
                </div>
                <div className="fulfillment-card">
                    <h3>3. Courier</h3>
                    <ul className="fulfillment-links">
                        <li><a href="https://www.evri.com/send" target="_blank" rel="noreferrer">Evri Send</a></li>
                        <li><a href="https://send.royalmail.com" target="_blank" rel="noreferrer">Royal Mail Click & Drop</a></li>
                        <li><a href="https://inpost.co.uk/send-a-parcel" target="_blank" rel="noreferrer">InPost lockers</a></li>
                        <li><a href="https://www.parcel2go.com" target="_blank" rel="noreferrer">Parcel2Go</a></li>
                        <li><a href="https://www.yodel.co.uk/send" target="_blank" rel="noreferrer">Yodel Direct</a></li>
                    </ul>
                </div>
                <div className="fulfillment-card">
                    <h3>4. Tracking</h3>
                    <p className="tracking-helper">Buy the label with your chosen courier, then add its tracking reference here.</p>
                    <label className="tracking-label">Tracking reference <span className="text-red-500 font-bold ml-0.5">*</span></label>
                    <div className="tracking-row">
                        <input type="text" value={trackingReference} onChange={(event) => setTrackingReference(event.target.value)} required aria-required="true" maxLength={100} placeholder="e.g. 123456789012345" />
                        <button type="button" onClick={handleSaveTracking} disabled={!trackingReference.trim()}>Mark dispatched</button>
                    </div>
                    {isDispatched && <p className="dispatch-confirmation" role="status">Dispatched. Buyer tracking: {savedTrackingReference}</p>}
                </div>
            </div>
        </div>
    );
};
