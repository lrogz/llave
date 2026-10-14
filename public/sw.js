// Black Key · service worker: notificaciones push y abrir la pantalla correcta al tocarlas.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { cuerpo: event.data ? event.data.text() : "" };
  }
  const url = d.url || "/hoy";
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(d.titulo || "Black Key", {
        body: d.cuerpo || "",
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        tag: d.tag,
        renotify: !!d.tag,
        data: { url },
      }),
      self.navigator && "setAppBadge" in self.navigator ? self.navigator.setAppBadge().catch(() => {}) : null,
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL(event.notification.data?.url || "/hoy", self.location.origin).href;
  event.waitUntil(
    (async () => {
      if (self.navigator && "clearAppBadge" in self.navigator) self.navigator.clearAppBadge().catch(() => {});
      const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const v of ventanas) {
        if (new URL(v.url).origin === self.location.origin && "focus" in v) {
          await v.focus();
          return v.navigate(destino);
        }
      }
      return self.clients.openWindow(destino);
    })(),
  );
});
