const CACHE_NAME = "lumadrop-shell-v4";
const APP_SHELL = [
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  // One release of compatibility assets lets devices with the v1 offline shell
  // boot successfully, update this worker, and migrate to the current cache.
  "/assets/index-DF-V2nH3.js",
  "/assets/index-Bq9ElJAB.css",
  "/assets/SenderPanel-CaMJcx8t.js",
  "/assets/ReceiverPanel-Bwj6dVxp.js",
  "/assets/format-DnoHwmwy.js",
];

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(APP_SHELL);

  const indexResponse = await fetch("/index.html", { cache: "no-store" });
  if (!indexResponse.ok) {
    throw new Error("Could not cache the LumaDrop app shell.");
  }

  await cache.put("/", indexResponse.clone());
  await cache.put("/index.html", indexResponse.clone());
  const html = await indexResponse.text();
  const currentAssets = Array.from(
    new Set(Array.from(html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g), (match) => match[1]))
  );
  await cache.addAll(currentAssets);
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", copy));
          }
          return response;
        })
        .catch(async () => (await caches.match("/index.html")) || Response.error())
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(async (cached) => {
      if (cached) return cached;

      const response = await fetch(event.request);
      if (response.ok) {
        const copy = response.clone();
        void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    })
  );
});
