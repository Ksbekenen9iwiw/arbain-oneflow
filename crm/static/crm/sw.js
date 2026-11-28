// OneFlow service worker. PRECACHE and VERSION are prepended by the server.
// Pages are fetched from the network first; the last copy answers when the
// network does not. Writes are never handled here: the app queues them.
const STATIC = `oneflow-static-${VERSION}`;
const PAGES = "oneflow-pages";
const SKIP = /^\/(login|logout|assistant|sync|sw\.js|manifest\.webmanifest)/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("oneflow-static-") && key !== STATIC)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  // Signing out, or another person signing in, must not leave pages behind.
  if (event.data === "clear-pages") event.waitUntil(caches.delete(PAGES));
});

// The same URL answers with HTML or with JSON, so the two are stored apart.
const pageKey = (request, url) =>
  url.origin +
  url.pathname +
  url.search +
  (url.search ? "&" : "?") +
  (request.headers.get("X-OneFlow-Page") === "1" ? "__json" : "__html");

async function fromNetwork(request, url) {
  const cache = await caches.open(PAGES);
  const key = pageKey(request, url);
  try {
    const response = await fetch(request);
    // A redirect to the login page is not this page; do not keep it.
    if (response.ok && !response.redirected) {
      const copy = response.clone();
      const headers = new Headers(copy.headers);
      headers.set("X-OneFlow-Saved", new Date().toISOString());
      cache.put(key, new Response(await copy.blob(), { status: 200, headers }));
    }
    return response;
  } catch (error) {
    const saved = await cache.match(key);
    if (saved) return saved;
    // Opened cold on a page only kept as data: start the app from the home
    // copy; it then loads the page asked for from its saved data.
    if (request.mode === "navigate") {
      const home = await cache.match(url.origin + "/?__html");
      if (home) return home;
    }
    throw error;
  }
}

async function fromStatic(request) {
  const cache = await caches.open(STATIC);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/static/")) event.respondWith(fromStatic(request));
  else if (!SKIP.test(url.pathname) && !url.searchParams.has("format"))
    event.respondWith(fromNetwork(request, url));
});
