// sw.js - Place this in your root directory
// Service Worker for HoopPortal Cache Management

const CACHE_VERSION = 'v6.0';
const CACHE_NAME = `hoopportal-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `hoopportal-dynamic-${CACHE_VERSION}`;

// Assets to precache (optional - core assets)
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/coach-dashboard.html',
  '/profile.html',
  '/search.html',
  '/plans.html',
  '/subscription.html',
  '/auth-callback.html',
  '/css/main.css',
  '/css/variables.css',
  '/css/dashboard.css',
  '/css/profile.css',
  '/css/search.css',
  '/css/plans.css',
  '/css/sections.css',
  '/css/components.css',
  '/css/modals.css',
  '/css/extras/navbar.css',
  '/js/app.js',
  '/js/cache-manager.js',
  '/js/cache-buster-helpers.js',
  '/js/extras/navbar.js',
  '/css/extra/footer.css',
  '/js/extra/footer.js'
];

// Install event - cache core assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing new version:', CACHE_VERSION);

  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE_ASSETS);
      await self.skipWaiting();
    })()
  );
});

// Activate event - clean up old caches and take control
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating new version:', CACHE_VERSION);

  event.waitUntil(
    (async () => {
      // Delete old caches
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );

      // Claim all clients immediately
      await self.clients.claim();
    })()
  );
});

// Helper to check if request should bypass cache
function shouldBypassCache(url) {
  const noCachePatterns = [
    '/api/',
    '/supabase/',
    '/auth',
    '/.netlify/functions/',
    'supabase.co',
    'checkout',
    '/create-checkout',
    '/verify-session',
    '/stripe-webhook'
  ];

  return noCachePatterns.some(pattern => url.includes(pattern));
}

// Helper to add no-cache headers to response
function addNoCacheHeaders(response) {
  const newHeaders = new Headers(response.headers);
  newHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  newHeaders.set('Pragma', 'no-cache');
  newHeaders.set('Expires', '0');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}

// Fetch event - main request handler
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Handle auth and API requests - always go to network with no cache
  if (shouldBypassCache(url.href)) {
    event.respondWith(
      fetch(event.request, {
        cache: 'no-store',
        headers: {
          ...event.request.headers,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      }).then(response => addNoCacheHeaders(response))
        .catch(error => {
          console.error('[SW] Network request failed:', url.href, error);
          return new Response('Network error', { status: 500 });
        })
    );
    return;
  }

  // For HTML navigation requests - network first, then cache fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // Always try network first for HTML
          const networkResponse = await fetch(event.request, {
            cache: 'no-store',
            headers: {
              ...event.request.headers,
              'Cache-Control': 'no-cache'
            }
          });

          // Cache the fresh response for offline fallback
          const cache = await caches.open(DYNAMIC_CACHE);
          cache.put(event.request, networkResponse.clone());

          return addNoCacheHeaders(networkResponse);
        } catch (error) {
          // Offline fallback - serve cached version
          console.log('[SW] Network failed, serving cached:', url.pathname);
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) {
            return cachedResponse;
          }

          // Return offline page
          return new Response(`
            <!DOCTYPE html>
            <html>
              <head><title>Offline - HoopPortal</title></head>
              <body style="text-align:center; padding:50px;">
                <h1>🔌 You're Offline</h1>
                <p>Please check your internet connection</p>
                <button onclick="location.reload()">Retry</button>
              </body>
            </html>
          `, { headers: { 'Content-Type': 'text/html' } });
        }
      })()
    );
    return;
  }

  // For static assets (CSS, JS, images) - cache first with versioning
  if (event.request.destination === 'style' ||
    event.request.destination === 'script' ||
    event.request.destination === 'image') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(event.request);

        if (cachedResponse) {
          // Return cached, but update in background
          fetch(event.request).then(response => {
            if (response.status === 200) {
              cache.put(event.request, response.clone());
            }
          }).catch(() => { });
          return cachedResponse;
        }

        const networkResponse = await fetch(event.request);
        if (networkResponse.status === 200) {
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      })()
    );
    return;
  }

  // Default: network first with cache fallback
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cachedResponse = await caches.match(event.request);
      return cachedResponse || new Response('Not found', { status: 404 });
    })
  );
});

// Handle messages from clients
self.addEventListener('message', (event) => {
  const { type } = event.data;

  switch (type) {
    case 'CLEAR_CACHES':
      (async () => {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        console.log('[SW] All caches cleared by client request');
        event.ports[0]?.postMessage({ success: true });
      })();
      break;

    case 'REFRESH_ALL_TABS':
      (async () => {
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
          client.postMessage({ type: 'FORCE_REFRESH', timestamp: event.data.timestamp });
        });
      })();
      break;

    case 'GET_VERSION':
      event.ports[0]?.postMessage({ version: CACHE_VERSION });
      break;

    default:
      console.log('[SW] Unknown message type:', type);
  }
});