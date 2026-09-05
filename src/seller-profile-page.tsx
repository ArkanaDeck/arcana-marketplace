import React from 'react';
import { createChatRoom, loadSellerProfile } from './lib/seller-profile';
import type { MarketplaceListing } from './lib/listings';
import { getSupabaseSession, supabase } from './lib/supabase';

type SellerProfilePageProps = { sellerId: string; onBack: () => void };

type Message = { id: string; sender_id: string; text_content: string; created_at: string };

export const SellerProfilePage: React.FC<SellerProfilePageProps> = ({ sellerId, onBack }) => {
    const [profile, setProfile] = React.useState<{ id: string; full_name: string | null; avatar_url: string | null; bio: string | null } | null>(null);
    const [listings, setListings] = React.useState<MarketplaceListing[]>([]);
    const [roomId, setRoomId] = React.useState<string | null>(null);
    const [messages, setMessages] = React.useState<Message[]>([]);
    const [messageText, setMessageText] = React.useState('');
    const [status, setStatus] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        loadSellerProfile(sellerId)
            .then(({ profile: seller, listings: sellerListings }) => { setProfile(seller); setListings(sellerListings); })
            .catch((error) => setStatus(error instanceof Error ? error.message : 'Unable to load this profile.'))
            .finally(() => setLoading(false));
    }, [sellerId]);

    React.useEffect(() => {
        if (!roomId) return;
        if (!supabase) return;
        const channel = supabase.channel(`chat:${roomId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, (payload) => {
                setMessages((current) => current.some((message) => message.id === payload.new.id) ? current : [...current, payload.new as Message]);
            })
            .subscribe();
        return () => { void channel?.unsubscribe(); };
    }, [roomId]);

    const startChat = async () => {
        try {
            const id = await createChatRoom(listings[0]?.id || null, sellerId);
            setRoomId(id);
            if (supabase) {
                const { data, error } = await supabase.from('messages').select('id, sender_id, text_content, created_at').eq('room_id', id).order('created_at', { ascending: true });
                if (error) throw new Error(error.message || 'Unable to load chat history.');
                setMessages((data || []) as Message[]);
            }
            setStatus('Chat ready. Send a message to the seller.');
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Unable to start chat.');
        }
    };

    const sendMessage = async () => {
        const text = messageText.trim();
        if (!supabase || !roomId || !text) return;
        try {
            const session = await getSupabaseSession();
            if (!session?.user) throw new Error('Sign in to send a message.');
            const { data, error } = await supabase.from('messages').insert({ room_id: roomId, sender_id: session.user.id, text_content: text }).select('id, sender_id, text_content, created_at').single();
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
            {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="seller-profile-avatar" /> : <div className="seller-profile-avatar seller-profile-avatar--fallback">{(profile.full_name || 'A').slice(0, 1).toUpperCase()}</div>}
            <div><p className="eyebrow">Public seller profile</p><h1>{profile.full_name || 'Arkana seller'}</h1><p>{profile.bio || 'Browse this seller\'s current marketplace listings.'}</p></div>
            <button type="button" className="primary-btn seller-profile-chat-btn" onClick={startChat}>Message Seller</button>
        </header>
        {status && <p className="account-status" role="status">{status}</p>}
        {roomId && <div className="seller-chat-panel"><h2>Chat with {profile.full_name || 'seller'}</h2><div className="seller-chat-messages">{messages.length === 0 ? <p>No messages yet.</p> : messages.map((message) => <p key={message.id}>{message.text_content}</p>)}</div><form onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}><input value={messageText} onChange={(event) => setMessageText(event.target.value)} maxLength={2000} placeholder="Write a message" required /><button type="submit" className="secondary-btn">Send</button></form></div>}
        <div className="seller-profile-section-heading"><div><p className="eyebrow">Storefront</p><h2>Listings from {profile.full_name || 'this seller'}</h2></div><span>{listings.length} listings</span></div>
        <div className="seller-profile-grid">{listings.map((listing) => <article className="live-product-card" key={listing.id}><div className="product-image-box">{listing.image ? <img src={listing.image} alt={listing.name} className="live-uploaded-img" /> : <span className="default-card-emoji">🎴</span>}</div><div className="product-details"><h3>{listing.name}</h3><span className={`listing-type-badge listing-type-badge--${listing.listingType}`}>{listing.listingType === 'sale' ? `For sale - £${listing.price.toFixed(2)}` : listing.listingType === 'swap' ? 'Open to swap' : 'Free to a good home'}</span>{listing.description && <p>{listing.description}</p>}</div></article>)}</div>
    </section>;
};
