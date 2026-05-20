const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
    // Only allow POST
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const { priceId, userId, userEmail, planType, successUrl, cancelUrl } = JSON.parse(event.body);

        // Validate required fields
        if (!priceId || !userId || !userEmail || !planType) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Missing required fields' })
            };
        }

        // Validate plan type
        if (!['basic', 'premium'].includes(planType)) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Invalid plan type' })
            };
        }

        // Find or create Stripe customer
        let customerId;
        try {
            const customers = await stripe.customers.list({
                email: userEmail,
                limit: 1
            });

            if (customers.data.length > 0) {
                customerId = customers.data[0].id;
            } else {
                const customer = await stripe.customers.create({
                    email: userEmail,
                    metadata: {
                        supabase_user_id: userId
                    }
                });
                customerId = customer.id;
            }
        } catch (error) {
            console.error('Customer creation error:', error);
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Failed to create customer' })
            };
        }

        // Create checkout session
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1
                }
            ],
            mode: 'subscription',
            success_url: successUrl || `${event.headers.origin}/profile.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancelUrl || `${event.headers.origin}/plans.html`,
            metadata: {
                supabase_user_id: userId,
                plan_type: planType
            }
        });

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: session.id,
                url: session.url
            })
        };

    } catch (error) {
        console.error('Checkout error:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: error.message || 'Checkout failed' })
        };
    }
};
