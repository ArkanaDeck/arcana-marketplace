import { getSupabaseSession, supabase } from './supabase';

export const initialListingMessage = (listingTitle: string) => `Hi!
Is "${listingTitle}" still available?
I have a question about it and wanted to discuss delivery options.`;

export function isListingOpeningMessage(text: string): boolean {
    return /^Hi!\s*Is "[\s\S]+" still available\?\s*I have a question about it and wanted to discuss delivery options\.$/.test(text);
}

export function formatChatMessage(text: string): string {
    const legacyMatch = text.match(/^Hi!\s*Is "([\s\S]+)" still available\?\s*I have a question about it and wanted to discuss delivery options\.$/);
    return legacyMatch
        ? `Hi!\nIs "${legacyMatch[1]}" still available?\nI have a question about it and wanted to discuss delivery options.`
        : text;
}

export async function openDashboardChat(listingId: string, sellerId: string, listingTitle: string, openingMessage?: string) {
    if (!supabase) throw new Error('Supabase is not configured.');
    const session = await getSupabaseSession();
    if (!session?.user) throw new Error('Sign in to message this seller.');
    if (session.user.id === sellerId) throw new Error('You cannot message yourself.');

    const { data: existing, error: lookupError } = await supabase
        .from('chats')
        .select('id')
        .eq('listing_id', listingId)
        .eq('buyer_id', session.user.id)
        .eq('seller_id', sellerId)
        .maybeSingle();
    if (lookupError) throw new Error(lookupError.message || 'Unable to find this conversation.');

    let chatId = existing?.id;
    if (!chatId) {
        const { data: created, error: createError } = await supabase
            .from('chats')
            .insert({ listing_id: listingId, buyer_id: session.user.id, seller_id: sellerId })
            .select('id')
            .single();
        if (createError || !created) throw new Error(createError?.message || 'Unable to create this conversation.');
        chatId = created.id;
    }

    const messageText = openingMessage?.trim() || initialListingMessage(listingTitle);
    const { data: priorMessages } = await supabase
        .from('messages')
        .select('id, text')
        .eq('chat_id', chatId)
        .eq('sender_id', session.user.id);
    const hasOpeningMessage = (priorMessages || []).some((message) => isListingOpeningMessage(message.text || ''));
    if (!hasOpeningMessage) {
        const { error: messageError } = await supabase.from('messages').insert({
            chat_id: chatId,
            sender_id: session.user.id,
            text: messageText,
        });
        if (messageError) throw new Error(messageError.message || 'Unable to seed the conversation.');
    }

    return chatId;
}
