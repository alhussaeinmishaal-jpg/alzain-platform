const CACHE = 'alzain-pwa-v2'
const SCOPE_URL = new URL('./', self.location.href)
const INDEX_URL = new URL('index.html', SCOPE_URL).href
const SHELL = [
  SCOPE_URL.href,
  INDEX_URL,
  new URL('manifest.webmanifest', SCOPE_URL).href,
  new URL('icons/icon-192.png', SCOPE_URL).href,
  new URL('icons/icon-512.png', SCOPE_URL).href,
  new URL('icons/icon-maskable-192.png', SCOPE_URL).href,
  new URL('icons/icon-maskable-512.png', SCOPE_URL).href,
  new URL('icons/apple-touch-icon.png', SCOPE_URL).href,
  new URL('icons/favicon-32.png', SCOPE_URL).href,
]

const OFFLINE_HTML = `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#17568d" />
    <title>غير متصل - منصة د. محمود الزين</title>
    <style>
      *{box-sizing:border-box}
      body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f7fb;color:#102a43;font-family:Tajawal,Arial,sans-serif;padding:24px;text-align:center}
      .card{max-width:420px;background:#fff;border:1px solid #dde3ed;border-radius:22px;padding:34px 26px;box-shadow:0 18px 50px -30px rgba(11,51,86,.45)}
      .mark{width:70px;height:70px;margin:0 auto 18px;border-radius:22px;display:grid;place-items:center;background:linear-gradient(135deg,#0b3356,#3d8bc7);color:#fff;font-size:32px;font-weight:800}
      h1{font-size:20px;margin:0 0 10px}
      p{font-size:14px;line-height:1.8;color:#627d98;margin:0 0 20px}
      button{border:0;border-radius:12px;padding:11px 22px;background:#17568d;color:#fff;font:inherit;font-weight:700;cursor:pointer}
    </style>
  </head>
  <body>
    <main class="card">
      <div class="mark">ز</div>
      <h1>لا يوجد اتصال بالإنترنت</h1>
      <p>افتح المنصة مرة واحدة وأنت متصل حتى تعمل صفحاتها المحفوظة دون اتصال.</p>
      <button onclick="location.reload()">إعادة المحاولة</button>
    </main>
  </body>
</html>`

function offlineResponse() {
  return new Response(OFFLINE_HTML, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

async function precache() {
  const cache = await caches.open(CACHE)

  try {
    const indexRequest = new Request(INDEX_URL, { cache: 'reload' })
    const indexResponse = await fetch(indexRequest)
    if (indexResponse.ok) {
      await cache.put(INDEX_URL, indexResponse.clone())
      const html = await indexResponse.text()
      const paths = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1])
      const assets = [
        ...new Set(
          paths
            .map((path) => new URL(path, SCOPE_URL))
            .filter(
              (url) =>
                url.origin === self.location.origin &&
                url.pathname.includes('/assets/'),
            )
            .map((url) => url.href),
        ),
      ]
      await Promise.allSettled(
        assets.map((url) => cache.add(new Request(url, { cache: 'reload' }))),
      )
    }
  } catch (error) {
    console.warn('PWA precache skipped', error)
  }

  await Promise.allSettled(
    SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' }))),
  )
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((key) => key.startsWith('alzain-pwa-') && key !== CACHE)
          .map((key) => caches.delete(key)),
      )
      await self.clients.claim()
    })(),
  )
})

async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (response.ok) await cache.put(request, response.clone())
    return response
  } catch {
    return Response.error()
  }
}

async function networkFirst(request, appShellFallback = false) {
  const cache = await caches.open(CACHE)

  try {
    const response = await fetch(request)
    if (response.ok) {
      await cache.put(request, response.clone())
      if (appShellFallback) await cache.put(INDEX_URL, response.clone())
    }
    return response
  } catch {
    const cached =
      (await cache.match(request)) ||
      (appShellFallback ? await cache.match(INDEX_URL) : undefined) ||
      (appShellFallback ? await cache.match(SCOPE_URL.href) : undefined)

    if (cached) return cached
    return appShellFallback ? offlineResponse() : Response.error()
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.endsWith('/sw.js')) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, true))
    return
  }

  if (url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(request))
    return
  }

  event.respondWith(networkFirst(request))
})
