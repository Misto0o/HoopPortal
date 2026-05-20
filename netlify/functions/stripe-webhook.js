const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
    const signature = event.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!signature || !webhookSecret) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing signature or webhook secret' })
        };
    }

    try {
        const stripeEvent = stripe.webhooks.constructEvent(
            event.body,
            signature,
            webhookSecret
        );

        switch (stripeEvent.type) {
            case 'checkout.session.completed': {
                const session = stripeEvent.data.object;
                const { supabase_user_id, plan_type } = session.metadata;

                console.log(`Checkout completed for user ${supabase_user_id}, plan: ${plan_type}`);

                // Update user subscription
                const { error: updateError } = await supabase
                    .from('user_profiles')
                    .update({
                        subscription: plan_type,
                        subscription_status: 'active',
                        stripe_customer_id: session.customer,
                        subscription_id: session.subscription,
                        updated_at: new Date()
                    })
                    .eq('id', supabase_user_id);

                if (updateError) throw updateError;

                // Update premium flag
                if (plan_type === 'premium') {
                    const { error: premiumError } = await supabase
                        .from('player_profiles')
                        .update({ is_premium: true })
                        .eq('id', supabase_user_id);

                    if (premiumError) throw premiumError;
                }

                break;
            }

            case 'customer.subscription.updated': {
                const subscription = stripeEvent.data.object;
                const customerId = subscription.customer;

                console.log(`Subscription updated for customer ${customerId}`);

                const { data: userProfile, error: fetchError } = await supabase
                    .from('user_profiles')
                    .select('id')
                    .eq('stripe_customer_id', customerId)
                    .single();

                if (!fetchError && userProfile) {
                    await supabase
                        .from('user_profiles')
                        .update({
                            subscription_status: subscription.status,
                            updated_at: new Date()
                        })
                        .eq('id', userProfile.id);
                }

                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = stripeEvent.data.object;
                const customerId = subscription.customer;

                console.log(`Subscription deleted for customer ${customerId}`);

                const { data: userProfile, error: fetchError } = await supabase
                    .from('user_profiles')
                    .select('id')
                    .eq('stripe_customer_id', customerId)
                    .single();

                if (!fetchError && userProfile) {
                    // Downgrade to basic
                    await supabase
                        .from('user_profiles')
                        .update({
                            subscription: 'basic',
                            subscription_status: 'canceled',
                            updated_at: new Date()
                        })
                        .eq('id', userProfile.id);

                    // Remove premium flag
                    await supabase
                        .from('player_profiles')
                        .update({ is_premium: false })
                        .eq('id', userProfile.id);
                }

                break;
            }

            case 'invoice.payment_failed': {
                const invoice = stripeEvent.data.object;
                console.error(`Payment failed for customer ${invoice.customer}`);
                // You could send an email notification here
                break;
            }

            default:
                console.log(`Unhandled event type: ${stripeEvent.type}`);
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
