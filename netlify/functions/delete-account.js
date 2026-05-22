const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
    try {
        // Only allow POST requests
        if (event.httpMethod !== 'POST') {
            return {
                statusCode: 405,
                body: JSON.stringify({ error: 'Method not allowed' })
            };
        }

        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        const { userId } = JSON.parse(event.body);

        if (!userId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'userId is required' })
            };
        }

        console.log(`Starting account deletion for user: ${userId}`);

        // ============================================
        // DELETE ALL USER DATA (CASCADE)
        // ============================================

        // 1. Delete player_stats
        const { error: statsError } = await supabase
            .from('player_stats')
            .delete()
            .eq('player_id', userId);
        if (statsError) console.error('Error deleting player_stats:', statsError);

        // 2. Delete player_contact
        const { error: contactError } = await supabase
            .from('player_contact')
            .delete()
            .eq('player_id', userId);
        if (contactError) console.error('Error deleting player_contact:', contactError);

        // 3. Delete parent_guardians
        const { error: parentsError } = await supabase
            .from('parent_guardians')
            .delete()
            .eq('player_id', userId);
        if (parentsError) console.error('Error deleting parent_guardians:', parentsError);

        // 4. Delete highlight_reels
        const { error: reelsError } = await supabase
            .from('highlight_reels')
            .delete()
            .eq('player_id', userId);
        if (reelsError) console.error('Error deleting highlight_reels:', reelsError);

        // 5. Delete liked_players (user who liked OR player who was liked)
        const { error: likesUserError } = await supabase
            .from('liked_players')
            .delete()
            .eq('user_id', userId);
        if (likesUserError) console.error('Error deleting liked_players (user_id):', likesUserError);

        const { error: likesPlayerError } = await supabase
            .from('liked_players')
            .delete()
            .eq('player_id', userId);
        if (likesPlayerError) console.error('Error deleting liked_players (player_id):', likesPlayerError);

        // 6. Delete player_views (viewer OR player being viewed)
        const { error: viewsViewerError } = await supabase
            .from('player_views')
            .delete()
            .eq('viewer_id', userId);
        if (viewsViewerError) console.error('Error deleting player_views (viewer_id):', viewsViewerError);

        const { error: viewsPlayerError } = await supabase
            .from('player_views')
            .delete()
            .eq('player_id', userId);
        if (viewsPlayerError) console.error('Error deleting player_views (player_id):', viewsPlayerError);

        // 7. Delete from player_profiles
        const { error: playerProfileError } = await supabase
            .from('player_profiles')
            .delete()
            .eq('id', userId);
        if (playerProfileError) console.error('Error deleting player_profiles:', playerProfileError);

        // 8. Delete from coach_profiles
        const { error: coachProfileError } = await supabase
            .from('coach_profiles')
            .delete()
            .eq('id', userId);
        if (coachProfileError) console.error('Error deleting coach_profiles:', coachProfileError);

        // 9. Delete from user_profiles
        const { error: userProfileError } = await supabase
            .from('user_profiles')
            .delete()
            .eq('id', userId);
        if (userProfileError) console.error('Error deleting user_profiles:', userProfileError);

        // ============================================
        // DELETE AUTH USER (LAST)
        // ============================================
        const { error: authError } = await supabase.auth.admin.deleteUser(userId);

        if (authError) {
            console.error('Error deleting auth user:', authError);
            return {
                statusCode: 500,
                body: JSON.stringify({
                    error: 'Failed to delete auth user',
                    message: authError.message
                })
            };
        }

        console.log(`Successfully deleted account for user: ${userId}`);

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                message: 'Account and all associated data deleted successfully'
            })
        };

    } catch (error) {
        console.error('Unexpected error during account deletion:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Unexpected error during account deletion',
                message: error.message
            })
        };
    }
};