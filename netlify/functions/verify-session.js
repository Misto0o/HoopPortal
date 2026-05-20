const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const { sessionId, userId } = JSON.parse(event.body);

        if (!sessionId || !userId) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Missing sessionId or userId' })
            };
        }

        // Retrieve the session
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (!session) {
            return {
                statusCode: 404,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Session not found' })
            };
        }

        // Verify user matches
        if (session.metadata.supabase_user_id !== userId) {
            return {
                statusCode: 403,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Session does not match user' })
            };
        }

        // If payment succeeded, update database
        if (session.payment_status === 'paid') {
            const { data: existingUser } = await supabase
                .from('user_profiles')
                .select('subscription')
                .eq('id', userId)
                .single();

            if (existingUser && existingUser.subscription !== session.metadata.plan_type) {
                await supabase
                    .from('user_profiles')
                    .update({
                        subscription: session.metadata.plan_type,
                        subscription_status: 'active',
                        stripe_customer_id: session.customer,
                        subscription_id: session.subscription,
                        updated_at: new Date()
                    })
                    .eq('id', userId);

                if (session.metadata.plan_type === 'premium') {
                    await supabase
                        .from('player_profiles')
                        .update({ is_premium: true })
                        .eq('id', userId);
                }
            }

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: true,
                    plan: session.metadata.plan_type
                })
            };
        }

        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Payment not completed' })
        };

    } catch (error) {
        console.error('Verify session error:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: error.message })
        };
    }
};
