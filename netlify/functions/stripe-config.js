// stripe-config.js
const STRIPE_PUBLISHABLE_KEY = 'pk_live_51TXqwzPv1yKOz6gvVbf62GLt3Zj706BBWcs1uGoNcvOLtDlxSjp6f4yZvG8yGMZkEa3tja7nAhXL2D63qKlQ0uis00qHVttf1n';

// Price IDs from Stripe (you need to create these in Stripe Dashboard first)
const STRIPE_PRICES = {
    basic: 'price_1TZHdpPv1yKOz6gv9mvr8OPS',  
    premium: 'price_1TZHeNPv1yKOz6gvZ7hotmwm' 
};

// Load Stripe.js
async function loadStripe() {
    if (!window.Stripe) {
        const script = document.createElement('script');
        script.src = 'https://js.stripe.com/v3/';
        await new Promise((resolve) => {
            script.onload = resolve;
            document.head.appendChild(script);
        });
    }
    return window.Stripe(STRIPE_PUBLISHABLE_KEY);
}