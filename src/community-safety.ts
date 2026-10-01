import { getSupabaseSession, supabase } from './lib/supabase';

export type CommunityReportTargetType = 'listing' | 'seller' | 'chat';

export async function submitCommunityReport(targetType: CommunityReportTargetType, targetId: string, details: string) {
    const session = await getSupabaseSession();
    if (!session?.user) throw new Error('Sign in to report content.');
    if (!supabase) throw new Error('Supabase is not configured.');

    const { error } = await supabase.rpc('submit_content_report', {
        p_target_type: targetType,
        p_target_id: targetId,
        p_details: details.trim(),
    });
    if (error) throw new Error(error.message || 'Unable to submit this report.');
}

export async function getUserBlockState(blockedUserId: string) {
    const session = await getSupabaseSession();
    if (!session?.user) return { viewerId: null, isBlocked: false };
    if (!supabase) throw new Error('Supabase is not configured.');

    const { data, error } = await supabase
        .from('user_blocks')
        .select('blocked_id')
        .eq('blocker_id', session.user.id)
        .eq('blocked_id', blockedUserId)
        .maybeSingle();
    if (error) throw new Error(error.message || 'Unable to check block status.');
    return { viewerId: session.user.id, isBlocked: Boolean(data) };
}

export async function setUserBlocked(blockedUserId: string, shouldBlock: boolean) {
    const session = await getSupabaseSession();
    if (!session?.user) throw new Error('Sign in to block or unblock a user.');
    if (!supabase) throw new Error('Supabase is not configured.');
    if (session.user.id === blockedUserId) throw new Error('You cannot block your own account.');

    const query = supabase.from('user_blocks');
    const result = shouldBlock
        ? await query.insert({ blocker_id: session.user.id, blocked_id: blockedUserId })
        : await query.delete().eq('blocker_id', session.user.id).eq('blocked_id', blockedUserId);
    if (result.error) throw new Error(result.error.message || 'Unable to update the block list.');
}