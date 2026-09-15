import React from 'react';
import { getSupabaseSession, supabase } from './lib/supabase';

type SupportTicket = { id: string; user_id: string | null; status: string; created_at: string };
type TicketMessage = { id: string; ticket_id: string; sender_id: string | null; text: string | null; content: string; created_at: string };
type TicketUser = { id: string; email: string; display_name: string | null; full_name: string | null };

const labelForUser = (user: TicketUser | undefined, ticket: SupportTicket) =>
    user?.display_name || user?.full_name || user?.email || ticket.user_id || 'Guest';

export const AdminSupportDashboard: React.FC = () => {
    const [accessState, setAccessState] = React.useState<'checking' | 'denied' | 'allowed'>('checking');
    const [tickets, setTickets] = React.useState<SupportTicket[]>([]);
    const [usersById, setUsersById] = React.useState<Record<string, TicketUser>>({});
    const [selectedTicketId, setSelectedTicketId] = React.useState<string | null>(null);
    const [messages, setMessages] = React.useState<TicketMessage[]>([]);
    const [replyText, setReplyText] = React.useState('');
    const [isSending, setIsSending] = React.useState(false);
    const [status, setStatus] = React.useState<string | null>(null);
    const messagesEndRef = React.useRef<HTMLDivElement | null>(null);

    // Verify the signed-in user is an admin before loading any support data.
    React.useEffect(() => {
        if (!supabase) { setAccessState('denied'); return; }
        const client = supabase;
        let isMounted = true;
        (async () => {
            try {
                const session = await getSupabaseSession();
                if (!session?.user) { if (isMounted) setAccessState('denied'); return; }
                const { data, error } = await client.from('profiles').select('is_admin').eq('id', session.user.id).single();
                if (!isMounted) return;
                if (error || !data?.is_admin) { setAccessState('denied'); return; }
                setAccessState('allowed');
            } catch {
                if (isMounted) setAccessState('denied');
            }
        })();
        return () => { isMounted = false; };
    }, []);

    React.useEffect(() => {
        if (accessState !== 'allowed' || !supabase) return;
        const client = supabase;
        let isMounted = true;

        (async () => {
            const { data: openTickets, error } = await client
                .from('support_tickets')
                .select('id, user_id, status, created_at')
                .eq('status', 'open')
                .order('created_at', { ascending: false });
            if (!isMounted) return;
            if (error) { setStatus(error.message || 'Unable to load support tickets.'); return; }
            const ticketList = (openTickets || []) as SupportTicket[];
            setTickets(ticketList);

            const userIds = Array.from(new Set(ticketList.map((ticket) => ticket.user_id).filter((id): id is string => Boolean(id))));
            if (userIds.length > 0) {
                const { data: profiles } = await client.from('profiles').select('id, email, display_name, full_name').in('id', userIds);
                if (isMounted && profiles) {
                    setUsersById(Object.fromEntries((profiles as TicketUser[]).map((user) => [user.id, user])));
                }
            }
        })();

        return () => { isMounted = false; };
    }, [accessState]);

    React.useEffect(() => {
        if (accessState !== 'allowed' || !supabase || !selectedTicketId) { setMessages([]); return; }
        const client = supabase;
        let isMounted = true;

        (async () => {
            const { data, error } = await client
                .from('support_messages')
                .select('id, ticket_id, sender_id, text, content, created_at')
                .eq('ticket_id', selectedTicketId)
                .order('created_at', { ascending: true });
            if (!isMounted) return;
            if (error) { setStatus(error.message || 'Unable to load messages.'); return; }
            setMessages((data || []) as TicketMessage[]);
        })();

        const channel = client.channel(`admin-support:${selectedTicketId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `ticket_id=eq.${selectedTicketId}` }, (payload) => {
                if (!isMounted) return;
                setMessages((current) => current.some((message) => message.id === payload.new.id) ? current : [...current, payload.new as TicketMessage]);
            })
            .subscribe();

        return () => { isMounted = false; void channel.unsubscribe(); };
    }, [accessState, selectedTicketId]);

    React.useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages.length]);

    const sendReply = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const content = replyText.trim();
        if (!supabase || !selectedTicketId || !content || isSending) return;
        setIsSending(true);
        setStatus(null);
        try {
            const session = await getSupabaseSession();
            if (!session?.user) throw new Error('Sign in as an admin to reply.');
            const { error } = await supabase.from('support_messages').insert({
                ticket_id: selectedTicketId,
                sender_id: session.user.id,
                text: content,
                content,
            });
            if (error) throw new Error(error.message || 'Unable to send reply.');
            setReplyText('');
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Unable to send reply.');
        } finally {
            setIsSending(false);
        }
    };

    if (accessState === 'checking') return <p role="status">Checking access…</p>;
    if (accessState === 'denied') return <p role="alert">You do not have access to this page.</p>;

    const selectedTicket = tickets.find((ticket) => ticket.id === selectedTicketId);

    return (
        <section className="admin-support-dashboard" aria-label="Arkana support dashboard" style={{ display: 'flex', height: '100vh' }}>
            <aside style={{ width: '280px', borderRight: '1px solid #ddd', overflowY: 'auto' }}>
                <h2 style={{ padding: '12px 16px' }}>Open tickets</h2>
                {tickets.length === 0 && <p style={{ padding: '0 16px' }}>No open tickets.</p>}
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {tickets.map((ticket) => (
                        <li key={ticket.id}>
                            <button
                                type="button"
                                onClick={() => setSelectedTicketId(ticket.id)}
                                aria-current={ticket.id === selectedTicketId}
                                style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    padding: '12px 16px',
                                    border: 'none',
                                    background: ticket.id === selectedTicketId ? '#eef2ff' : 'transparent',
                                    cursor: 'pointer',
                                }}
                            >
                                <strong>{labelForUser(ticket.user_id ? usersById[ticket.user_id] : undefined, ticket)}</strong>
                                <br />
                                <small>{new Date(ticket.created_at).toLocaleString()}</small>
                            </button>
                        </li>
                    ))}
                </ul>
            </aside>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {!selectedTicket && <p style={{ padding: '16px' }}>Select a user from the list to view their chat.</p>}
                {selectedTicket && (
                    <>
                        <header style={{ padding: '12px 16px', borderBottom: '1px solid #ddd' }}>
                            <h3>{labelForUser(selectedTicket.user_id ? usersById[selectedTicket.user_id] : undefined, selectedTicket)}</h3>
                        </header>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }} aria-live="polite">
                            {messages.map((message) => (
                                <p key={message.id} style={{ whiteSpace: 'pre-line' }}>{message.text || message.content}</p>
                            ))}
                            <div ref={messagesEndRef} aria-hidden="true" />
                        </div>
                        {status && <p role="alert">{status}</p>}
                        <form onSubmit={sendReply} style={{ display: 'flex', gap: '8px', padding: '12px 16px', borderTop: '1px solid #ddd' }}>
                            <input
                                type="text"
                                aria-label="Reply to user"
                                value={replyText}
                                onChange={(event) => setReplyText(event.target.value)}
                                placeholder="Type your reply…"
                                maxLength={2000}
                                required
                                style={{ flex: 1 }}
                            />
                            <button type="submit" disabled={isSending || !replyText.trim()}>{isSending ? 'Sending…' : 'Reply'}</button>
                        </form>
                    </>
                )}
            </div>
        </section>
    );
};
