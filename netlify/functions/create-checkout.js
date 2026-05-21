
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const { priceId, userId, userEmail, planType, successUrl, cancelUrl } = JSON.parse(event.body);

        if (!priceId || !userId || !userEmail || !planType) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Missing required fields' })
            };
        }

        if (!['basic', 'premium'].includes(planType)) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Invalid plan type' })
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

        // Find or create customer
        let customerId;
        const listUrl = new URL('https://api.stripe.com/v1/customers');
        listUrl.searchParams.append('email', userEmail);
        listUrl.searchParams.append('limit', '1');

        const listResponse = await fetch(listUrl.toString(), {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${stripeSecretKey}` }
        });

        const listData = await listResponse.json();

        if (listData.data && listData.data.length > 0) {
            customerId = listData.data[0].id;
        } else {
            const createResponse = await fetch('https://api.stripe.com/v1/customers', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${stripeSecretKey}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    email: userEmail,
                    'metadata[supabase_user_id]': userId
                }).toString()
            });

            const customerData = await createResponse.json();
            if (customerData.error) throw new Error(customerData.error.message);
            customerId = customerData.id;
        }

        // Create checkout session
        const sessionResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${stripeSecretKey}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                customer: customerId,
                'payment_method_types[0]': 'card',
                'line_items[0][price]': priceId,
                'line_items[0][quantity]': '1',
                mode: 'subscription',
                success_url: `${successUrl || event.headers.origin}/profile.html?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: cancelUrl || `${event.headers.origin}/plans.html`,
                'metadata[supabase_user_id]': userId,
                'metadata[plan_type]': planType
            }).toString()
        });

        const sessionData = await sessionResponse.json();
        if (sessionData.error) throw new Error(sessionData.error.message);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: sessionData.id, url: sessionData.url })
        };

    } catch (error) {
        console.error('Checkout error:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: error.message })
        };
    }
};