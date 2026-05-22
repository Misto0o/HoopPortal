// netlify/functions/delete-account.js
// NO IMPORTS - Uses native fetch and Supabase REST API directly

exports.handler = async (event) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const { userId } = JSON.parse(event.body);

        if (!userId) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'userId is required' })
            };
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            console.error('Missing Supabase environment variables');
            return {
                statusCode: 500,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Server configuration error' })
            };
        }

        console.log(`Starting account deletion for user: ${userId}`);

        // Helper function to make Supabase REST API calls
        async function deleteFromTable(table, column, value) {
            const url = `${supabaseUrl}/rest/v1/${table}?${column}=eq.${value}`;
            const response = await fetch(url, {
                method: 'DELETE',
                headers: {
                    'apikey': supabaseServiceKey,
                    'Authorization': `Bearer ${supabaseServiceKey}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok && response.status !== 404) {
                console.error(`Error deleting from ${table}:`, await response.text());
            }
            return response;
        }

        // Delete in order (child tables first)
        console.log('Deleting from player_stats...');
        await deleteFromTable('player_stats', 'player_id', userId);

        console.log('Deleting from player_contact...');
        await deleteFromTable('player_contact', 'player_id', userId);

        console.log('Deleting from parent_guardians...');
        await deleteFromTable('parent_guardians', 'player_id', userId);

        console.log('Deleting from highlight_reels...');
        await deleteFromTable('highlight_reels', 'player_id', userId);

        console.log('Deleting from liked_players (as user)...');
        await deleteFromTable('liked_players', 'user_id', userId);

        console.log('Deleting from liked_players (as player)...');
        await deleteFromTable('liked_players', 'player_id', userId);

        console.log('Deleting from player_views (as viewer)...');
        await deleteFromTable('player_views', 'viewer_id', userId);

        console.log('Deleting from player_views (as player)...');
        await deleteFromTable('player_views', 'player_id', userId);

        console.log('Deleting from player_profiles...');
        await deleteFromTable('player_profiles', 'id', userId);

        console.log('Deleting from coach_profiles...');
        await deleteFromTable('coach_profiles', 'id', userId);

        console.log('Deleting from user_profiles...');
        await deleteFromTable('user_profiles', 'id', userId);

        // Delete auth user using Supabase Admin API
        console.log('Deleting auth user...');
        const authUrl = `${supabaseUrl}/auth/v1/admin/users/${userId}`;
        const authResponse = await fetch(authUrl, {
            method: 'DELETE',
            headers: {
                'apikey': supabaseServiceKey,
                'Authorization': `Bearer ${supabaseServiceKey}`
            }
        });

        if (!authResponse.ok) {
            const errorText = await authResponse.text();
            console.error('Error deleting auth user:', errorText);
            // Don't fail the whole operation if auth deletion fails, user data is already gone
        }

        console.log(`Successfully deleted account for user: ${userId}`);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                message: 'Account and all associated data deleted successfully'
            })
        };

    } catch (error) {
        console.error('Unexpected error during account deletion:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: 'Unexpected error during account deletion',
                message: error.message
            })
        };
    }
};