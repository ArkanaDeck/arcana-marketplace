import React from 'react';
import { getSupabaseSession, supabase } from './lib/supabase';
import { formatChatMessage, isListingOpeningMessage } from './lib/dashboard-chat';

type DashboardMessage = { id: string; chat_id: string; sender_id: string; text: string | null; created_at: string };

export const MessagesDashboard: React.FC<{ chatId: string }> = ({ chatId }) => {
    const [messages, setMessages] = React.useState<DashboardMessage[]>([]);
    const [messageText, setMessageText] = React.useState('');
    const [isSending, setIsSending] = React.useState(false);
    const [status, setStatus] = React.useState<string | null>(null);
    const messagesEndRef = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
        if (!supabase || !chatId) return;
        let mounted = true;
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
            else setMessages((data || []) as DashboardMessage[]);
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
            const { error } = await supabase.from('messages').insert({ chat_id: chatId, sender_id: session.user.id, text });
            if (error) throw new Error(error.message || 'Unable to send message.');
            setMessageText('');
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Unable to send message.');
        } finally {
            setIsSending(false);
        }
    };

    return <section className="messages-dashboard" aria-label="Chat messages">
        <a href="/app" className="auth-link-btn">← Back to Marketplace</a>
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
