import { BASE_PATH, appUrl } from './config.js';
import { VAPID_PUBLIC_KEY, MIN_PUSH_CARDS } from './push-config.js';
import { installationEnvironment } from './pwa.js';
import { decodeApplicationKey, sameApplicationKey, supportedPushEndpoint } from './push-utils.js';

function pushError(code) { return Object.assign(new Error(code), { code }); }

export function createPushController(api, win = globalThis.window) {
  const ownerKey = `question-cards-push-owner:${BASE_PATH}`;
  let context = { userId: null, cardCount: 0, enabled: false };
  let generation = 0;
  let subscribed = false;
  let lastError = null;
  let operations = Promise.resolve();
  const listeners = new Set();
  const changed = () => listeners.forEach(listener => listener());
  const owner = () => { try { return win.localStorage.getItem(ownerKey); } catch { return null; } };
  const setOwner = value => { try { value ? win.localStorage.setItem(ownerKey, value) : win.localStorage.removeItem(ownerKey); } catch { /* Подписку всё равно проверяем через PushManager. */ } };
  const supported = () => Boolean(win.isSecureContext && 'serviceWorker' in win.navigator && 'PushManager' in win && 'Notification' in win);
  const current = (version, userId) => generation === version && context.userId === userId;
  // restore, ручное подключение и выход не меняют одну подписку одновременно.
  function exclusive(callback) {
    const operation = operations.then(callback, callback);
    operations = operation.catch(() => {});
    return operation;
  }

  async function registration() {
    let timer;
    try {
      const ready = await Promise.race([win.navigator.serviceWorker.ready,
        new Promise((_, reject) => { timer = setTimeout(() => reject(pushError('pwa_not_ready')), 10_000); })]);
      if (ready.scope !== appUrl()) throw pushError('pwa_not_ready');
      return ready;
    } finally { clearTimeout(timer); }
  }

  async function synchronize(create, version, userId) {
    const worker = await registration();
    if (!current(version, userId)) return;
    let subscription = await worker.pushManager.getSubscription();
    if (!current(version, userId)) return;
    const key = decodeApplicationKey(VAPID_PUBLIC_KEY);
    if (subscription && (owner() !== userId || !sameApplicationKey(subscription, key))) {
      const previousEndpoint = subscription.endpoint;
      await subscription.unsubscribe();
      if (owner() === userId) await api.deleteSubscription(userId, previousEndpoint);
      subscription = null;
      setOwner(null);
    }
    if (!current(version, userId)) return;
    if (!subscription && create) subscription = await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    if (!current(version, userId)) { await subscription?.unsubscribe(); return; }
    subscribed = false;
    if (subscription) {
      if (!supportedPushEndpoint(subscription.endpoint)) throw pushError('unsupported_push_service');
      const json = subscription.toJSON();
      if (!json.keys?.p256dh || !json.keys?.auth) throw pushError('subscription_error');
      await api.saveSubscription({ user_id: userId, endpoint: subscription.endpoint,
        p256dh: json.keys.p256dh, auth: json.keys.auth, user_agent: win.navigator.userAgent });
      if (!current(version, userId)) return;
      setOwner(userId);
      subscribed = true;
    }
  }

  return {
    setContext(userId, cardCount, enabled) {
      if (context.userId !== userId) { generation += 1; subscribed = false; lastError = null; }
      context = { userId, cardCount, enabled };
    },
    snapshot() {
      const environment = installationEnvironment(win.navigator, query => win.matchMedia(query));
      const installFirst = environment.ios && !environment.standalone;
      return { supported: supported(), installFirst, subscribed,
        permission: 'Notification' in win ? win.Notification.permission : 'unsupported',
        enoughCards: context.cardCount >= MIN_PUSH_CARDS || ('Notification' in win && win.Notification.permission === 'granted'), requiredCards: MIN_PUSH_CARDS,
        configured: Boolean(VAPID_PUBLIC_KEY), error: lastError };
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async restore() {
      const version = generation, userId = context.userId;
      if (!userId || !supported() || this.snapshot().installFirst) return;
      return exclusive(async () => {
        if (!current(version, userId)) return;
        try {
          // После уже выданного разрешения восстановление не показывает системный запрос.
          await synchronize(win.Notification.permission === 'granted' && context.enabled, version, userId);
          if (current(version, userId)) lastError = null;
        } catch { if (current(version, userId)) { subscribed = false; lastError = 'restore_failed'; } }
        if (current(version, userId)) changed();
      });
    },
    async enable() {
      const status = this.snapshot();
      if (!status.supported) throw pushError('push_unsupported');
      if (status.installFirst) throw pushError('install_first');
      if (!status.enoughCards) throw pushError('not_enough_cards');
      if (!context.userId) throw pushError('unauthorized');
      if (win.Notification.permission === 'denied') throw pushError('permission_denied');
      // ВАЖНО для iOS: requestPermission вызывается до первого await, в цепочке нажатия.
      const permission = win.Notification.permission === 'default'
        ? win.Notification.requestPermission() : Promise.resolve(win.Notification.permission);
      const version = generation, userId = context.userId;
      if (await permission !== 'granted') throw pushError('permission_denied');
      await exclusive(async () => {
        if (!current(version, userId)) throw pushError('subscription_error');
        await synchronize(true, version, userId);
        if (!current(version, userId) || !subscribed) throw pushError('subscription_error');
        lastError = null;
        changed();
      });
    },
    async detach(userId = context.userId) {
      const version = ++generation;
      if (!supported()) { setOwner(null); return; }
      return exclusive(async () => {
        if (generation !== version) return;
        try {
          const worker = await win.navigator.serviceWorker.getRegistration(appUrl());
          const subscription = await worker?.pushManager.getSubscription();
          if (generation !== version) return;
          if (subscription && userId) {
            try { await api.deleteSubscription(userId, subscription.endpoint); } catch { /* unsubscribe всё равно нужен при выходе. */ }
          }
          if (generation !== version) return;
          await subscription?.unsubscribe();
        } finally {
          if (generation === version) { subscribed = false; setOwner(null); changed(); }
        }
      });
    },
  };
}
