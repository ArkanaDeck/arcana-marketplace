export function createListingStatusUpdater(supabase) {
    async function markAsSold(listingId) {
        const { error } = await supabase
            .from('listings')
            .update({ status: 'sold' })
            .eq('id', listingId)
            .eq('status', 'active');
        if (error) throw error;
    }

    async function confirmOrderAccepted(listingId) {
        const { error } = await supabase
            .from('listings')
            .update({ status: 'completed', is_active: false })
            .eq('id', listingId)
            .eq('status', 'sold');
        if (error) throw error;
    }

    return { markAsSold, confirmOrderAccepted };
}