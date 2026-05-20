// netlify/functions/create-checkout.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const { priceId, userId, userEmail, planType, successUrl, cancelUrl } = JSON.parse(event.body);

        // Find or create customer
        let customers = await stripe.customers.list({
            email: userEmail,
            limit: 1
        });

        let customerId = customers.data[0]?.id;

        if (!customerId) {
            const customer = await stripe.customers.create({
                email: userEmail,
                metadata: {
                    supabase_user_id: userId
                }
            });
            customerId = customer.id;
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
            body: JSON.stringify({ sessionId: session.id, url: session.url })
        };
    } catch (error) {
        console.error('Stripe error:', error);
        return {
            statusCode: 400,
            body: JSON.stringify({ error: error.message })
        };
    }
};