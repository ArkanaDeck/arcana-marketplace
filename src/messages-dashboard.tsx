import React from 'react';
import { getSupabaseSession, supabase } from './lib/supabase';
import { formatChatMessage, isListingOpeningMessage } from './lib/dashboard-chat';
import { CommunitySafetyActions } from './community-safety-actions';

type DashboardMessage = { id: string; chat_id: string; sender_id: string; text: string | null; created_at: string };

export const MessagesDashboard: React.FC<{ chatId: string; onBack: () => void; isNativeApp: boolean }> = ({ chatId, onBack, isNativeApp }) => {
    const [messages, setMessages] = React.useState<DashboardMessage[]>([]);
    const draftStorageKey = `arkana-message-draft:${chatId}`;
    const [messageText, setMessageText] = React.useState(() => {
        try { return window.sessionStorage.getItem(draftStorageKey) || ''; } catch { return ''; }
    });
    const [isSending, setIsSending] = React.useState(false);
    const [status, setStatus] = React.useState<string | null>(null);
    const [otherUserId, setOtherUserId] = React.useState<string | null>(null);
    const messagesEndRef = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
        try {
            if (messageText) window.sessionStorage.setItem(draftStorageKey, messageText);
            else window.sessionStorage.removeItem(draftStorageKey);
        } catch {
            // Keep the in-memory draft when browser storage is unavailable.
        }
    }, [draftStorageKey, messageText]);

    React.useEffect(() => {
        if (!supabase || !chatId) return;
        let mounted = true;
        void (async () => {
            const session = await getSupabaseSession().catch(() => null);
            if (!session?.user) return;
            const { data } = await supabase!.from('chats').select('buyer_id, seller_id').eq('id', chatId).maybeSingle();
            if (!mounted || !data) return;
            setOtherUserId(data.buyer_id === session.user.id ? data.seller_id : data.buyer_id);
        })();
        const channel = supabase.channel(`public:messages:${chatId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, (payload) => {
                if (!mounted) return;
                setMessages((current) => current.some((message) => message.id === payload.new.id) ? current : [...current, payload.new as DashboardMessage]);
            })
            .subscribe();

        (async () => {
            const { data, error } = await supabase.from('messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true });
            if (!mounted) return;
            if (error) setStatus(error.message || 'Unable to load messages.');
            else {
                const loadedMessages = (data || []) as DashboardMessage[];
                setMessages((current) => {
                    const byId = new Map(loadedMessages.map((message) => [message.id, message]));
                    current.forEach((message) => { if (!byId.has(message.id)) byId.set(message.id, message); });
                    return [...byId.values()].sort((left, right) => left.created_at.localeCompare(right.created_at));
                });
            }
        })();

        return () => { mounted = false; void channel.unsubscribe(); };
    }, [chatId]);

    React.useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages.length]);

    const sendMessage = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const text = messageText.trim();
        if (!supabase || !text || isSending) return;
        setIsSending(true);
        setStatus(null);
        try {
            const session = await getSupabaseSession();
            if (!session?.user) throw new Error('Sign in to send a message.');
            const { data, error } = await supabase.from('messages').insert({ chat_id: chatId, sender_id: session.user.id, text }).select('id, chat_id, sender_id, text, created_at').single();
            if (error || !data) throw new Error(error?.message || 'Unable to send message.');
            setMessages((current) => current.some((message) => message.id === data.id)
                ? current
                : [...current, data as DashboardMessage].sort((left, right) => left.created_at.localeCompare(right.created_at)));
            setMessageText('');
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Unable to send message.');
        } finally {
            setIsSending(false);
        }
    };

    return <section className="messages-dashboard" aria-label="Chat messages">
        {!isNativeApp && <header className="messages-dashboard__toolbar">
            <button type="button" className="messages-dashboard__back-button" onClick={onBack} aria-label="Back to Marketplace">
                <span aria-hidden="true">&lt;</span>
                <span>Back</span>
            </button>
            <h1>Messages</h1>
            <span aria-hidden="true" />
        </header>}
        <CommunitySafetyActions targetType="chat" targetId={chatId} targetLabel="this user" blockedUserId={otherUserId || undefined} reportContext={`Conversation ID: ${chatId}`} onBlocked={() => setMessages([])} />
        <div className="seller-chat-messages" aria-live="polite">
            {messages.filter((message, index, allMessages) => !isListingOpeningMessage(message.text || '') || allMessages.findIndex((candidate) => isListingOpeningMessage(candidate.text || '')) === index).map((message) => <p key={message.id} style={{ whiteSpace: 'pre-line' }}>{formatChatMessage(message.text || '')}</p>)}
            <div ref={messagesEndRef} aria-hidden="true" />
        </div>
        {status && <p className="account-status" role="alert">{status}</p>}
        <form className="seller-chat-panel" onSubmit={sendMessage}>
            <input value={messageText} onChange={(event) => setMessageText(event.target.value)} placeholder="Write a message" maxLength={2000} required />
            <button type="submit" disabled={isSending}>{isSending ? 'Sending...' : 'Send'}</button>
        </form>
    </section>;
};
