/* CommunitySafe service worker — handles incoming Web Push notifications.
 * Intentionally minimal: shows a single notification per push, with the
 * notification body as-supplied by the server (server-side rate limiting
 * and digest policy live in apps/api). */

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "CommunitySafe", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "CommunitySafe";
  const options = {
    body: payload.body || "",
    tag: payload.tag || "travelsafe",
    data: payload.data || {},
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((cs) => {
      for (const c of cs) {
        if (c.url.includes(url) && "focus" in c) return c.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
