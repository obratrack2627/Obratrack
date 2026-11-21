self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sin conexión | ObraTrack</title>
  <style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,-apple-system,sans-serif;background:#FAF8F5;color:#1E1E1E}
    .card{max-width:420px;width:100%;background:#fff;border:1px solid #E1D5CB;border-radius:16px;padding:28px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.06)}
    .tag{display:inline-block;padding:4px 10px;border-radius:999px;background:rgba(255,106,0,.12);color:#FF6A00;font-size:12px;font-weight:700;margin-bottom:12px}
    h1{margin:0 0 10px;font-size:20px}
    p{margin:0 0 20px;font-size:14px;line-height:1.5;color:#555}
    button{background:#FF6A00;color:#fff;border:0;border-radius:12px;padding:12px 20px;font-weight:700;font-size:14px;cursor:pointer}
    @media(prefers-color-scheme:dark){body{background:#0B121B;color:#F8FAFC}.card{background:#141A23;border-color:#263040}p{color:#94A3B8}}
  </style>
</head>
<body>
  <div class="card">
    <span class="tag">ObraTrack · Terreno</span>
    <h1>Sin conexión a Internet</h1>
    <p>Tus cambios locales guardados permanecen en este dispositivo. Reconéctate a la red para sincronizar y recargar esta vista.</p>
    <button type="button" onclick="window.location.reload()">Reintentar conexión</button>
  </div>
</body>
</html>`;

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode !== 'navigate' || req.method !== 'GET') return;
  try {
    const url = new URL(req.url);
    if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  } catch {
    return;
  }
  event.respondWith(
    fetch(req).catch(
      () =>
        new Response(OFFLINE_HTML, {
          status: 503,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        }),
    ),
  );
});

function safePushPath(raw) {
  if (typeof raw !== 'string') return '/dashboard';
  if (!raw.startsWith('/') || raw.startsWith('//') || /[\x00-\x1f\x7f\\]/.test(raw)) {
    return '/dashboard';
  }
  return raw;
}

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
  const url = safePushPath(payload.url);
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
  const targetUrl = safePushPath(event.notification?.data?.url);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const origin = self.location.origin;
      const parsedTarget = new URL(targetUrl, origin);
      const fullTarget = parsedTarget.origin === origin ? parsedTarget.href : `${origin}/dashboard`;
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
