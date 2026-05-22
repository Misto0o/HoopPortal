// Add this to ensure all resources are fresh
(function () {
    // Add timestamp to all stylesheet and script tags
    const timestamp = Date.now();

    document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
        const href = link.getAttribute('href');
        if (href && !href.includes('cache-buster')) {
            const separator = href.includes('?') ? '&' : '?';
            link.setAttribute('href', href + separator + 'v=' + timestamp);
        }
    });

    document.querySelectorAll('script[src]').forEach(script => {
        const src = script.getAttribute('src');
        if (src && !src.includes('cache-buster') && !src.includes('supabase')) {
            const separator = src.includes('?') ? '&' : '?';
            script.setAttribute('src', src + separator + 'v=' + timestamp);
        }
    });

    // Override pushState and replaceState to add cache busting
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function () {
        originalPushState.apply(this, arguments);
        window.dispatchEvent(new Event('pushstate'));
    };

    history.replaceState = function () {
        originalReplaceState.apply(this, arguments);
        window.dispatchEvent(new Event('replacestate'));
    };

    window.addEventListener('pushstate', checkAuthOnNavigation);
    window.addEventListener('replacestate', checkAuthOnNavigation);
    window.addEventListener('popstate', checkAuthOnNavigation);

    function checkAuthOnNavigation() {
        const storedUser = localStorage.getItem('hoopportal_user');
        if (storedUser && !window.app?.currentUser) {
            console.log('[CacheBuster] Auth lost on navigation, reloading...');
            window.location.reload();
        }
    }
})();