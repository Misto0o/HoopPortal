// netlify/functions/stripe-webhook.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
    const signature = event.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    try {
        const body = event.body;
        const stripeEvent = stripe.webhooks.constructEvent(body, signature, webhookSecret);

        switch (stripeEvent.type) {
            case 'checkout.session.completed': {
                const session = stripeEvent.data.object;
                const { supabase_user_id, plan_type } = session.metadata;

                // Update user subscription
                await supabase
                    .from('user_profiles')
                    .update({
                        subscription: plan_type,
                        subscription_status: 'active',
                        stripe_customer_id: session.customer,
                        subscription_id: session.subscription,
                        updated_at: new Date()
                    })
                    .eq('id', supabase_user_id);

                // Update premium flag for players
                if (plan_type === 'premium') {
                    await supabase
                        .from('player_profiles')
                        .update({ is_premium: true })
                        .eq('id', supabase_user_id);
                }
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = stripeEvent.data.object;
                const customerId = subscription.customer;

                const { data: userProfile } = await supabase
                    .from('user_profiles')
                    .select('id')
                    .eq('stripe_customer_id', customerId)
                    .single();

                if (userProfile) {
                    await supabase
                        .from('user_profiles')
                        .update({
                            subscription: 'basic',
                            subscription_status: 'canceled',
                            updated_at: new Date()
                        })
                        .eq('id', userProfile.id);

                    await supabase
                        .from('player_profiles')
                        .update({ is_premium: false })
                        .eq('id', userProfile.id);
                }
                break;
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ received: true })
        };
    } catch (error) {
        console.error('Webhook error:', error);
        return {
            statusCode: 400,
            body: JSON.stringify({ error: error.message })
        };
    }
};