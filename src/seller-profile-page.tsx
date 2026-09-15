import React from 'react';
import { loadSellerProfile } from './lib/seller-profile';
import { formatChatMessage, isListingOpeningMessage, openDashboardChat } from './lib/dashboard-chat';
import { saveDirectPaymentLink } from './lib/direct-payment';
import type { MarketplaceListing } from './lib/listings';
import { getSupabaseSession, supabase } from './lib/supabase';
import { DirectPaymentAction } from './direct-payment-action';

type SellerProfilePageProps = { sellerId: string; onBack: () => void; onEditProfile: () => void; onSignIn: () => void };

type Message = { id: string; sender_id: string; chat_id: string; text: string; created_at: string };

export const SellerProfilePage: React.FC<SellerProfilePageProps> = ({ sellerId, onBack, onEditProfile, onSignIn }) => {
    const [profile, setProfile] = React.useState<{ id: string; full_name: string | null; avatar_url: string | null; bio: string | null; website_url: string | null; direct_payment_link: string | null } | null>(null);
    const [listings, setListings] = React.useState<MarketplaceListing[]>([]);
    const [roomId, setRoomId] = React.useState<string | null>(null);
    const [messages, setMessages] = React.useState<Message[]>([]);
    const [messageText, setMessageText] = React.useState('');
    const [status, setStatus] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [viewerId, setViewerId] = React.useState<string | null>(null);
    const [directPaymentLinkInput, setDirectPaymentLinkInput] = React.useState('');
    const [isEditingDirectPaymentLink, setIsEditingDirectPaymentLink] = React.useState(false);
    const [isSavingDirectPaymentLink, setIsSavingDirectPaymentLink] = React.useState(false);
    const [pendingInitialMessage, setPendingInitialMessage] = React.useState<string | null>(() => new URLSearchParams(window.location.search).get('initialMessage'));
    const [hasOpenedPendingChat, setHasOpenedPendingChat] = React.useState(false);
    const [isStartingChat, setIsStartingChat] = React.useState(false);

    React.useEffect(() => {
        loadSellerProfile(sellerId)
            .then(({ profile: seller, listings: sellerListings }) => {
                setProfile(seller);
                setListings(sellerListings);
                setDirectPaymentLinkInput(seller.direct_payment_link || '');
                setIsEditingDirectPaymentLink(false);
            })
            .catch((error) => setStatus(error instanceof Error ? error.message : 'Unable to load this profile.'))
            .finally(() => setLoading(false));
    }, [sellerId]);

    React.useEffect(() => {
        getSupabaseSession().then((session) => setViewerId(session?.user?.id || null)).catch(() => setViewerId(null));
    }, []);

    // Requirement 1 & 2: the seller viewing their own profile can edit and save direct_payment_link inline.
    const handleSaveDirectPaymentLink = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSavingDirectPaymentLink(true);
        setStatus(null);
        try {
            await saveDirectPaymentLink(directPaymentLinkInput);
            setProfile((current) => current ? { ...current, direct_payment_link: directPaymentLinkInput.trim() || null } : current);
            setIsEditingDirectPaymentLink(false);
            setStatus('Payment link saved.');
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Unable to save your payment link.');
        } finally {
            setIsSavingDirectPaymentLink(false);
        }
    };


    React.useEffect(() => {
        if (!roomId) return;
        if (!supabase) return;
        const channel = supabase.channel(`chat:${roomId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${roomId}` }, (payload) => {
                setMessages((current) => current.some((message) => message.id === payload.new.id) ? current : [...current, payload.new as Message]);
            })
            .subscribe();
        return () => { void channel?.unsubscribe(); };
    }, [roomId]);

    const startChat = async (initialMessage?: string) => {
        if (isStartingChat) return;
        setIsStartingChat(true);
        setStatus(null);
        try {
            const listing = listings[0];
            if (!listing) throw new Error('This seller has no active listing to discuss.');
            const session = await getSupabaseSession();
            if (!session?.user) {
                setStatus('Sign in to message this seller.');
                onSignIn();
                return;
            }
            const id = await openDashboardChat(listing.id, sellerId, listing.name, initialMessage);
            setRoomId(id);
            if (supabase) {
                const { data, error } = await supabase.from('messages').select('id, sender_id, chat_id, text, created_at').eq('chat_id', id).order('created_at', { ascending: true });
                if (error) throw new Error(error.message || 'Unable to load chat history.');
                setMessages((data || []) as Message[]);
            }
            setStatus('Chat ready. Send a message to the seller.');
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Unable to start chat.');
        } finally {
            setIsStartingChat(false);
        }
    };

    React.useEffect(() => {
        if (hasOpenedPendingChat || loading || !pendingInitialMessage || viewerId === sellerId || !listings.length) return;
        setHasOpenedPendingChat(true);
        void startChat(pendingInitialMessage);
        window.history.replaceState({}, '', window.location.pathname);
    }, [hasOpenedPendingChat, loading, listings.length, pendingInitialMessage, sellerId, viewerId]);

    const sendMessage = async () => {
        const text = messageText.trim();
        if (!supabase || !roomId || !text) return;
        try {
            const session = await getSupabaseSession();
            if (!session?.user) throw new Error('Sign in to send a message.');
            const { data, error } = await supabase.from('messages').insert({ chat_id: roomId, sender_id: session.user.id, text }).select('id, sender_id, chat_id, text, created_at').single();
            if (error || !data) throw new Error(error?.message || 'Unable to send message.');
            setMessages((current) => current.some((message) => message.id === data.id) ? current : [...current, data as Message]);
            setMessageText('');
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Unable to send message.');
        }
    };

    if (loading) return <section className="seller-profile-page"><p>Loading seller profile...</p></section>;
    if (!profile) return <section className="seller-profile-page"><p className="account-status" role="alert">{status || 'Seller profile not found.'}</p><button type="button" className="secondary-btn" onClick={onBack}>Back to marketplace</button></section>;

    return <section className="seller-profile-page">
        <button type="button" className="account-text-btn" onClick={onBack}>Back to marketplace</button>
        <header className="seller-profile-header">
            {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="seller-profile-avatar" /> : <div className="seller-profile-avatar seller-profile-avatar--fallback">ARK</div>}
            <div><p className="eyebrow">Public seller profile</p><h1>{profile.full_name || 'Arkana seller'}</h1>{(profile.bio || viewerId !== sellerId) && <p>{profile.bio || 'Browse this seller\'s current marketplace listings.'}</p>}
                {profile.website_url && <a className="seller-website-link" href={profile.website_url} target="_blank" rel="noopener noreferrer nofollow">Visit their website</a>}
            </div>
            {viewerId === sellerId && <button type="button" className="secondary-btn" onClick={onEditProfile}>Edit profile</button>}
            {viewerId !== sellerId && listings.length > 0 && <div className="seller-profile-action"><DirectPaymentAction listingTitle={listings[0].name} directPaymentLink={profile.direct_payment_link} onChat={(initialMessage) => { void startChat(initialMessage); }} isStartingChat={isStartingChat} /></div>}
        </header>
        {status && <p className="account-status" role="status">{status}</p>}
        {viewerId === sellerId && (
            <section className="seller-direct-payment-panel">
                <div><p className="eyebrow">Your storefront</p><h2>Direct payment link</h2><p>Paste your own Stripe Payment Link, PayPal.me, or Revolut link. Buyers pay you directly — Arkana never touches the money.</p></div>
                {directPaymentLinkInput && !isEditingDirectPaymentLink ? (
                    <div className="seller-direct-payment-panel__saved">
                        <p>Your active payment link: <a href={directPaymentLinkInput} target="_blank" rel="noopener noreferrer nofollow">{directPaymentLinkInput}</a></p>
                        <button type="button" className="seller-direct-payment-panel__edit-btn" onClick={() => setIsEditingDirectPaymentLink(true)}>Edit link</button>
                    </div>
                ) : (
                    <form onSubmit={handleSaveDirectPaymentLink}>
                        <label className="seller-direct-payment-panel__field">Checkout link
                            <input type="url" value={directPaymentLinkInput} onChange={(event) => setDirectPaymentLinkInput(event.target.value)} placeholder="https://buy.stripe.com/... or https://paypal.me/yourname" />
                        </label>
                        <button type="submit" className="seller-direct-payment-panel__save-btn" disabled={isSavingDirectPaymentLink}>{isSavingDirectPaymentLink ? 'Saving...' : 'Save payment link'}</button>
                    </form>
                )}
            </section>
        )}
        {roomId && <div className="seller-chat-panel"><h2>Chat with {profile.full_name || 'seller'}</h2><div className="seller-chat-messages">{messages.length === 0 ? <p>No messages yet.</p> : messages.filter((message, index, allMessages) => !isListingOpeningMessage(message.text) || allMessages.findIndex((candidate) => isListingOpeningMessage(candidate.text)) === index).map((message) => <p key={message.id} style={{ whiteSpace: 'pre-line' }}>{formatChatMessage(message.text)}</p>)}</div><form onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}><input value={messageText} onChange={(event) => setMessageText(event.target.value)} maxLength={2000} placeholder="Write a message" required /><button type="submit" className="secondary-btn">Send</button></form></div>}
        <div className="seller-profile-section-heading"><div><p className="eyebrow">Storefront</p><h2>Listings from {profile.full_name || 'this seller'}</h2></div><span>{listings.length} listings</span></div>
        <div className="seller-profile-grid">{listings.map((listing) => <article className="live-product-card" key={listing.id}><div className="product-image-box">{listing.images.length > 0 ? <div className="listing-image-row">{listing.images.map((imageUrl, index) => <a key={imageUrl} href={imageUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${listing.name} photo ${index + 1}`}><img src={imageUrl} alt={`${listing.name} photo ${index + 1}`} className="live-uploaded-img" /></a>)}</div> : <span className="default-card-emoji">🎴</span>}</div><div className="product-details"><h3>{listing.name}</h3><span className={`listing-type-badge listing-type-badge--${listing.listingType}`}>{listing.listingType === 'sale' ? `For sale - £${listing.price.toFixed(2)}` : listing.listingType === 'swap' ? 'Open to swap' : 'Free to a good home'}</span>{listing.description && <p>{listing.description}</p>}</div></article>)}</div>
    </section>;
};
