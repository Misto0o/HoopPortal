// ============================================
// netlify/functions/verify-session.js
// NO NPM REQUIRED - Uses Stripe API directly
// ============================================

// NOTE: This function requires Supabase module
// BUT you can skip this function entirely if you want
// The webhook handles the payment verification

// For now, we'll make it simpler - just verify with Stripe API
// You'll need to handle Supabase separately or skip this

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

        const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
        if (!stripeSecretKey) {
            return {
                statusCode: 500,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Stripe key not configured' })
            };
        }

        // Retrieve the session from Stripe
        const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${stripeSecretKey}`
            }
        });

        const session = await response.json();

        if (session.error) {
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

        // If payment succeeded
        if (session.payment_status === 'paid') {
            // NOTE: Updating Supabase requires the module
            // The webhook will handle the DB update instead
            // This function just confirms payment status

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: true,
                    plan: session.metadata.plan_type,
                    status: session.payment_status
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