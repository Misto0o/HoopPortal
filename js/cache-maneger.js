// js/cache-manager.js
// Enhanced Cache Manager for HoopPortal

class CacheBusterNuker {
  constructor() {
    this.version = '5.0.0';
    this.swRegistration = null;
    this.init();
  }

  async init() {
    await this.getServiceWorker();
    await this.nukeAllCaches();
    this.setupCacheBusting();
    this.setupAuthStateMonitoring();
    this.setupPeriodicCleanup();
    this.monitorNetworkStatus();
  }

  async getServiceWorker() {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        this.swRegistration = registration;
        console.log('[CacheBuster] Connected to service worker');
      }
    }
  }

  // Complete cache nuke
  async nukeAllCaches() {
    try {
      console.log('[CacheBuster] Starting full cache nuke...');

      // Clear all caches via Cache API
      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(
          cacheKeys.map(key => {
            console.log(`[CacheBuster] Deleting cache: ${key}`);
            return caches.delete(key);
          })
        );
        console.log('[CacheBuster] All caches cleared');
      }

      // Tell service worker to clear its caches
      if (this.swRegistration && this.swRegistration.active) {
        const messageChannel = new MessageChannel();
        messageChannel.port1.onmessage = (event) => {
          console.log('[CacheBuster] SW response:', event.data);
        };
        this.swRegistration.active.postMessage(
          { type: 'CLEAR_CACHES' },
          [messageChannel.port2]
        );
      }

      // Clear localStorage but preserve auth
      const authToken = localStorage.getItem('hoopportal_user');
      const pendingUserType = localStorage.getItem('pending_user_type');

      // Clear everything except essential items
      const keysToKeep = ['hoopportal_user', 'pending_user_type'];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!keysToKeep.includes(key)) {
          localStorage.removeItem(key);
        }
      }

      // Restore auth if it was cleared
      if (authToken && !localStorage.getItem('hoopportal_user')) {
        localStorage.setItem('hoopportal_user', authToken);
      }
      if (pendingUserType && !localStorage.getItem('pending_user_type')) {
        localStorage.setItem('pending_user_type', pendingUserType);
      }

      // Clear sessionStorage completely
      sessionStorage.clear();

      // Clear IndexedDB
      if (window.indexedDB) {
        if (window.indexedDB.databases) {
          const databases = await window.indexedDB.databases();
          databases.forEach(db => {
            if (db.name) {
              console.log(`[CacheBuster] Deleting database: ${db.name}`);
              window.indexedDB.deleteDatabase(db.name);
            }
          });
        }
      }

      console.log('[CacheBuster] ✅ Complete cache nuke executed');
      return true;

    } catch (error) {
      console.error('[CacheBuster] ❌ Nuke error:', error);
      return false;
    }
  }

  // Soft nuke - clear only caches, keep localStorage
  async softNuke() {
    try {
      console.log('[CacheBuster] Starting soft nuke...');

      // Clear browser caches only
      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map(key => caches.delete(key)));
        console.log('[CacheBuster] Browser caches cleared');
      }

      // Clear sessionStorage
      sessionStorage.clear();

      // Clear memory caches by reloading resources
      this.refreshAllResources();

      console.log('[CacheBuster] ✅ Soft nuke completed');
      return true;

    } catch (error) {
      console.error('[CacheBuster] ❌ Soft nuke error:', error);
      return false;
    }
  }

  // Refresh all dynamic resources
  refreshAllResources() {
    // Refresh images with cache busting
    document.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('data:')) {
        const separator = src.includes('?') ? '&' : '?';
        img.src = src + separator + '_cb=' + Date.now();
      }
    });

    // Refresh background images
    document.querySelectorAll('[style*="background-image"]').forEach(el => {
      const style = el.getAttribute('style');
      if (style) {
        const newStyle = style.replace(/url\(([^)]+)\)/g, (match, url) => {
          const cleanUrl = url.replace(/['"]/g, '');
          const separator = cleanUrl.includes('?') ? '&' : '?';
          return `url('${cleanUrl}${separator}_cb=${Date.now()}')`;
        });
        el.setAttribute('style', newStyle);
      }
    });
  }

  // Setup cache busting for all fetch requests
  setupCacheBusting() {
    // Override fetch to add cache busting headers
    const originalFetch = window.fetch;
    const self = this;

    window.fetch = function (...args) {
      const request = args[0];
      const options = args[1] || {};

      // Add cache busting headers
      options.headers = {
        ...options.headers,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Cache-Buster': Date.now().toString()
      };

      // Add timestamp to URLs for GET requests
      if (typeof request === 'string' && (!options.method || options.method === 'GET')) {
        const url = new URL(request, window.location.origin);
        // Don't add to supabase or external APIs
        if (!url.hostname.includes('supabase') && !url.hostname.includes('stripe')) {
          url.searchParams.set('_cb', Date.now().toString());
        }
        args[0] = url.toString();
      }

      return originalFetch.apply(this, args);
    };
  }

  // Monitor auth state changes
  setupAuthStateMonitoring() {
    let lastAuthState = this.getCurrentAuthState();

    // Check auth state on visibility change
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.checkAuthConsistency();
      }
    });

    // Check on page show (for bfcache)
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        console.log('[CacheBuster] Page restored from bfcache, checking auth...');
        this.checkAuthConsistency();
      }
    });

    // Periodic check
    setInterval(() => {
      const currentAuthState = this.getCurrentAuthState();
      if (currentAuthState !== lastAuthState) {
        console.log('[CacheBuster] Auth state changed');
        lastAuthState = currentAuthState;
        this.onAuthStateChange();
      }
    }, 2000);
  }

  getCurrentAuthState() {
    const user = localStorage.getItem('hoopportal_user');
    return user ? JSON.parse(user)?.id || 'authenticated' : 'null';
  }

  async checkAuthConsistency() {
    const storedUser = localStorage.getItem('hoopportal_user');
    const currentUser = window.app?.currentUser;

    if (storedUser && !currentUser) {
      console.log('[CacheBuster] Auth mismatch: logged in storage but not in app');
      await this.softNuke();
      window.location.reload();
    } else if (!storedUser && currentUser) {
      console.log('[CacheBuster] Auth mismatch: logged in app but not in storage');
      await this.softNuke();
      window.location.reload();
    }
  }

  onAuthStateChange() {
    // Refresh dynamic content
    if (window.app && window.app.loadPageContent) {
      window.app.loadPageContent();
    }
    this.refreshAllResources();
  }

  // Periodic cleanup
  setupPeriodicCleanup() {
    // Soft nuke every 30 minutes
    setInterval(() => {
      this.softNuke();
    }, 30 * 60 * 1000);

    // Full nuke daily at 3 AM
    const scheduleDailyNuke = () => {
      const now = new Date();
      const night = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        3, 0, 0
      );
      const timeToNight = night.getTime() - now.getTime();

      setTimeout(() => {
        this.nukeAllCaches();
        // Schedule next
        scheduleDailyNuke();
      }, timeToNight);
    };

    scheduleDailyNuke();
  }

  // Monitor network status
  monitorNetworkStatus() {
    window.addEventListener('online', () => {
      console.log('[CacheBuster] Network online, refreshing...');
      this.softNuke();
      window.location.reload();
    });

    window.addEventListener('offline', () => {
      console.log('[CacheBuster] Network offline');
    });
  }

  // Manual force refresh for all tabs
  async broadcastRefresh() {
    if (this.swRegistration && this.swRegistration.active) {
      this.swRegistration.active.postMessage({
        type: 'REFRESH_ALL_TABS',
        timestamp: Date.now()
      });
    }
  }
}

// Initialize when DOM is ready
let cacheBuster;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    cacheBuster = new CacheBusterNuker();
  });
} else {
  cacheBuster = new CacheBusterNuker();
}