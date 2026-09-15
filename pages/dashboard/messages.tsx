import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseSession, supabase } from '../../src/lib/supabase';

type ChatMessage = {
    id: string;
    room_id: string;
    sender_id: string;
    text_content: string;
    created_at: string;
};

export default function MessagesDashboardPage() {
    const router = useRouter();
    const { chatId } = router.query;
    const activeChatId = typeof chatId === 'string' ? chatId : null;
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [messageText, setMessageText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!router.isReady || !activeChatId || !supabase) {
            setMessages([]);
            return;
        }

        const client = supabase;
        let channel: RealtimeChannel | undefined;
        let isMounted = true;
        setIsLoading(true);
        setErrorMessage(null);

        const loadMessages = async () => {
            const { data, error } = await client
                .from('messages')
                .select('*')
                .eq('room_id', activeChatId)
                .order('created_at', { ascending: true });
            if (error) throw error;
            if (isMounted) setMessages((data || []) as ChatMessage[]);
        };

        void loadMessages()
            .catch((error: unknown) => {
                if (isMounted) setErrorMessage(error instanceof Error ? error.message : 'Unable to load messages.');
            })
            .finally(() => {
                if (isMounted) setIsLoading(false);
            });

        channel = client
            .channel(`public:messages:${activeChatId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${activeChatId}` }, (payload) => {
                if (!isMounted) return;
                setMessages((current) => current.some((message) => message.id === payload.new.id)
                    ? current
                    : [...current, payload.new as ChatMessage]);
            })
            .subscribe();

        return () => {
            isMounted = false;
            if (channel) void channel.unsubscribe();
        };
    }, [activeChatId, router.isReady]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [messages.length]);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const content = messageText.trim();
        if (!supabase || !activeChatId || !content || isSending) return;

        setIsSending(true);
        setErrorMessage(null);
        try {
            const session = await getSupabaseSession();
            if (!session?.user) throw new Error('Sign in to send a message.');
            const { data, error } = await supabase
                .from('messages')
                .insert({ room_id: activeChatId, sender_id: session.user.id, text_content: content })
                .select('*')
                .single();
            if (error || !data) throw new Error(error?.message || 'Unable to send message.');
            setMessages((current) => current.some((message) => message.id === data.id) ? current : [...current, data as ChatMessage]);
            setMessageText('');
        } catch (error: unknown) {
            setErrorMessage(error instanceof Error ? error.message : 'Unable to send message.');
        } finally {
            setIsSending(false);
        }
    };

    return (
        <main className="messages-dashboard">
            <h1>Messages</h1>
            {!activeChatId && <p>Select a conversation to begin.</p>}
            {isLoading && <p role="status">Loading conversation...</p>}
            {errorMessage && <p role="alert">{errorMessage}</p>}
            {activeChatId && (
                <>
                    <section className="message-viewport" aria-live="polite" aria-label="Conversation messages">
                        {messages.map((message) => (
                            <article key={message.id} className="message-row">
                                <p style={{ whiteSpace: 'pre-line' }}>{message.text_content}</p>
                                <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}</time>
                            </article>
                        ))}
                        <div ref={messagesEndRef} aria-hidden="true" />
                    </section>
                    <form className="message-composer" onSubmit={handleSubmit}>
                        <label htmlFor="message-content">Message</label>
                        <textarea id="message-content" value={messageText} onChange={(event) => setMessageText(event.target.value)} rows={3} maxLength={2000} placeholder="Write a message..." required />
                        <button type="submit" disabled={isSending || !messageText.trim()}>{isSending ? 'Sending...' : 'Send message'}</button>
                    </form>
                </>
            )}
        </main>
    );
}
