const CACHE_NAME = 'shiftpay-v2';
const APP_SHELL_URL = new URL('./', self.registration.scope).href;
const MANIFEST_URL = new URL('manifest.webmanifest', self.registration.scope).href;
const ICON_URL = new URL('icon.svg', self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll([APP_SHELL_URL, MANIFEST_URL, ICON_URL]);
      await self.skipWaiting();
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(event.request);

      try {
        const networkResponse = await fetch(event.request);

        if (networkResponse.ok) {
          cache.put(event.request, networkResponse.clone());
        }

        return networkResponse;
      } catch (error) {
        if (cachedResponse) {
          return cachedResponse;
        }

        if (event.request.mode === 'navigate') {
          return cache.match(APP_SHELL_URL);
        }

        throw error;
      }
    }),
  );
});
