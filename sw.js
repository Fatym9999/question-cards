// Путь берётся из зарегистрированного scope, заданного через BASE_PATH.
// Кеша и обработчика fetch намеренно нет: приложение работает через сеть.
const APP_URL = new URL(self.registration.scope);
const CARD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notificationUrl(raw) {
  try {
    const candidate = new URL(typeof raw === 'string' ? raw : '', APP_URL);
    if (candidate.origin !== APP_URL.origin || candidate.pathname !== APP_URL.pathname) return APP_URL.href;
    const card = candidate.searchParams.get('card');
    if (!card || !CARD_ID.test(card)) return APP_URL.href;
    const target = new URL(APP_URL);
    target.searchParams.set('card', card);
    target.searchParams.set('src', 'push');
    return target.href;
  } catch {
    return APP_URL.href;
  }
}

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// Эти обработчики готовы к этапу push. Подписка и запрос разрешения здесь не создаются.
self.addEventListener('push', event => {
  let payload = {};
  try {
    const parsed = event.data?.json();
    if (parsed && typeof parsed === 'object') payload = parsed;
  } catch { /* Некорректный payload: обычное напоминание. */ }
  const title = typeof payload.title === 'string' && payload.title.trim() ? payload.title : 'Карточки';
  const body = typeof payload.body === 'string' ? payload.body : 'Время повторить карточку.';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: new URL('assets/icons/icon-192.png', APP_URL).href,
    data: { url: notificationUrl(payload.url) },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = notificationUrl(event.notification.data?.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      const address = new URL(client.url);
      if (address.origin !== APP_URL.origin || !address.pathname.startsWith(APP_URL.pathname)) continue;
      try {
        const navigated = await client.navigate(target);
        await (navigated ?? client).focus();
        return;
      } catch { /* Окно могло закрыться между matchAll и navigate. */ }
    }
    await self.clients.openWindow(target);
  })());
});
