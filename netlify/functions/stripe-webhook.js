// ============================================
// netlify/functions/stripe-webhook.js
// NO NPM REQUIRED - Uses Stripe API directly
// ============================================

const crypto = require('crypto');

// Helper to call Supabase REST API directly
async function updateSupabaseSubscription(userId, status, planType, customerId) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
        console.error('Missing Supabase credentials');
        return false;
    }
    
    const updateData = {
        subscription_status: status,
        subscription_plan: planType,
        subscription_date: new Date().toISOString(),
        stripe_customer_id: customerId
    };
    
    try {
        const response = await fetch(`${supabaseUrl}/rest/v1/user_profiles?id=eq.${userId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify(updateData)
        });
        
        if (!response.ok) {
            const error = await response.text();
            console.error('Supabase update error:', error);
            return false;
        }
        
        console.log(`✅ Updated user ${userId} to ${status}`);
        return true;
    } catch (error) {
        console.error('Supabase update error:', error);
        return false;
    }
}

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
        // Parse the webhook body
        const stripeEvent = JSON.parse(event.body);
        
        console.log('📨 Webhook event:', stripeEvent.type);

        switch (stripeEvent.type) {
            case 'checkout.session.completed': {
                const session = stripeEvent.data.object;
                const userId = session.metadata?.supabase_user_id;
                const planType = session.metadata?.plan_type;
                const customerId = session.customer;

                if (userId && planType && session.payment_status === 'paid') {
                    console.log(`✅ Checkout completed for user ${userId}, plan: ${planType}`);
                    
                    // Update Supabase to activate subscription
                    const updated = await updateSupabaseSubscription(
                        userId, 
                        'active', 
                        planType, 
                        customerId
                    );
                    
                    if (updated) {
                        console.log(`🎉 Subscription activated for ${userId}`);
                    }
                } else {
                    console.log('Missing metadata or payment not completed');
                }
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = stripeEvent.data.object;
                const customerId = subscription.customer;
                console.log(`🔴 Subscription deleted for customer ${customerId}`);
                
                // Find user by stripe_customer_id and deactivate
                // This would require a lookup query first
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