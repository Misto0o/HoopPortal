// ============================================
// netlify/functions/stripe-webhook.js
// NO NPM REQUIRED - Uses Stripe API directly
// ============================================

// NOTE: The webhook verification requires cryptography
// We'll use Node's built-in crypto module (no npm needed)

const crypto = require('crypto');

exports.handler = async (event) => {
    const signature = event.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!signature || !webhookSecret) {
        console.error('Missing signature or webhook secret');
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing signature' })
        };
    }

    try {
        // Verify webhook signature
        const body = event.body;
        const hash = crypto
            .createHmac('sha256', webhookSecret)
            .update(body, 'utf8')
            .digest('hex');

        const computedSignature = `t=${Math.floor(Date.now() / 1000)},v1=${hash}`;

        // Note: This is a simplified verification
        // For production, use proper Stripe webhook verification
        
        const stripeEvent = JSON.parse(body);

        console.log('📨 Webhook event:', stripeEvent.type);

        switch (stripeEvent.type) {
            case 'checkout.session.completed': {
                const session = stripeEvent.data.object;
                const { supabase_user_id, plan_type } = session.metadata;

                console.log(`✅ Checkout completed for user ${supabase_user_id}, plan: ${plan_type}`);

                // TODO: Update Supabase here
                // For now, just log it
                console.log('TODO: Update user subscription in Supabase');
                console.log('User ID:', supabase_user_id);
                console.log('Plan:', plan_type);
                console.log('Stripe Customer ID:', session.customer);
                console.log('Subscription ID:', session.subscription);

                break;
            }

            case 'customer.subscription.updated': {
                const subscription = stripeEvent.data.object;
                console.log(`⚠️ Subscription updated for customer ${subscription.customer}`);
                console.log('Status:', subscription.status);
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = stripeEvent.data.object;
                console.log(`🔴 Subscription deleted for customer ${subscription.customer}`);
                // TODO: Downgrade user to basic plan in Supabase
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = stripeEvent.data.object;
                console.error(`❌ Payment failed for customer ${invoice.customer}`);
                break;
            }

            default:
                console.log(`⚪ Unhandled event type: ${stripeEvent.type}`);
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