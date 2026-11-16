self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { body: event.data.text() };
  }

  const title = typeof payload.title === 'string' && payload.title.trim()
    ? payload.title.trim()
    : 'ObraTrack';
  const body = typeof payload.body === 'string' ? payload.body : '';
  const icon = payload.icon || '/app-icons/obratrack-mobile-v3-192.png?v=4';
  const badge = payload.badge || '/app-icons/obratrack-mobile-v3-192.png?v=4';
  const url = typeof payload.url === 'string' && payload.url.startsWith('/')
    ? payload.url
    : '/dashboard';
  const tag = typeof payload.tag === 'string' && payload.tag ? payload.tag : 'obratrack-aviso';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag,
      renotify: true,
      requireInteraction: Boolean(payload.requireInteraction),
      vibrate: [120, 60, 120],
      data: {
        url,
        categoria: payload.categoria || 'general',
      },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = event.notification?.data?.url;
  const targetUrl = typeof rawUrl === 'string' && rawUrl.startsWith('/') ? rawUrl : '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const origin = self.location.origin;
      const fullTarget = new URL(targetUrl, origin).href;
      for (const client of clients) {
        if (client.url.startsWith(origin)) {
          if ('navigate' in client && typeof client.navigate === 'function') {
            return client.navigate(fullTarget).then((navigated) => (navigated || client).focus());
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(fullTarget);
    })
  );
});
