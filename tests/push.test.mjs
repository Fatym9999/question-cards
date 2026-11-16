import test from 'node:test';
import assert from 'node:assert/strict';
import { createPushController } from '../js/push.js';
import { decodeApplicationKey, supportedPushEndpoint } from '../js/push-utils.js';
import { VAPID_PUBLIC_KEY } from '../js/push-config.js';
import { BASE_PATH } from '../js/config.js';

function fixture({ permission = 'default', ios = false } = {}) {
  const records = new Map(), storage = new Map();
  const counters = { permissions: 0, subscribe: 0, get: 0, unsubscribe: 0 };
  let subscription = null;
  const worker = { scope: `http://localhost:8000${BASE_PATH}`, pushManager: {
    async getSubscription() { counters.get += 1; return subscription; },
    async subscribe(options) {
      counters.subscribe += 1;
      const value = {
        endpoint: `https://fcm.googleapis.com/fcm/send/test-${counters.subscribe}`, options,
        toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'test-key', auth: 'test-auth' } }; },
        async unsubscribe() { counters.unsubscribe += 1; if (subscription === value) subscription = null; return true; },
      };
      subscription = value;
      return value;
    },
  } };
  const win = { isSecureContext: true, PushManager: {},
    Notification: { permission, requestPermission() { counters.permissions += 1; this.permission = 'granted'; return Promise.resolve('granted'); } },
    matchMedia: () => ({ matches: false }),
    navigator: { userAgent: ios ? 'iPhone Safari' : 'Chrome', serviceWorker: {
      ready: Promise.resolve(worker), getRegistration: async () => worker,
    } },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  };
  const api = {
    async saveSubscription(row) { records.set(`${row.user_id}:${row.endpoint}`, row); },
    async deleteSubscription(uid, endpoint) { records.delete(`${uid}:${endpoint}`); },
  };
  const controller = createPushController(api, win);
  controller.setContext('user-a', 3, true);
  return { controller, win, counters, records, worker, storage };
}

test('VAPID public key — uncompressed P-256, endpoint проверяется по точному домену', () => {
  const key = decodeApplicationKey(VAPID_PUBLIC_KEY);
  assert.equal(key.length, 65); assert.equal(key[0], 4);
  assert(supportedPushEndpoint('https://web.push.apple.com/token'));
  assert(supportedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/token'));
  assert(!supportedPushEndpoint('https://fcm.googleapis.com.evil.invalid/'));
  assert(!supportedPushEndpoint('https://127.0.0.1/'));
  assert(!supportedPushEndpoint('https://user:password@fcm.googleapis.com/'));
});

test('менее трёх карточек: запрос разрешения не вызывается', async () => {
  const f = fixture(); f.controller.setContext('user-a', 2, false);
  await assert.rejects(f.controller.enable(), error => error.code === 'not_enough_cards');
  assert.equal(f.counters.permissions, 0);
});

test('iPhone в браузере сначала требует установку', async () => {
  const f = fixture({ ios: true });
  await assert.rejects(f.controller.enable(), error => error.code === 'install_first');
  assert.equal(f.counters.permissions, 0);
});

test('открытие приложения не вызывает разрешение, но проверяет подписку', async () => {
  const f = fixture();
  await f.controller.restore();
  assert.equal(f.counters.get, 1);
  assert.equal(f.counters.permissions, 0);
  assert.equal(f.counters.subscribe, 0);
});

test('разрешение вызывается до первого await, подписка сохраняется владельцу', async () => {
  const f = fixture();
  const enabling = f.controller.enable();
  assert.equal(f.counters.permissions, 1);
  await enabling;
  assert(f.controller.snapshot().subscribed);
  assert.equal([...f.records.values()][0].user_id, 'user-a');
});

test('потерянная подписка восстанавливается при уже выданном разрешении', async () => {
  const f = fixture({ permission: 'granted' });
  await f.controller.restore();
  await f.controller.restore();
  assert.equal(f.counters.permissions, 0);
  assert.equal(f.counters.subscribe, 1);
  assert.equal(f.records.size, 1);
});

test('смена аккаунта не привязывает прежний endpoint к новому пользователю', async () => {
  const f = fixture({ permission: 'granted' });
  await f.controller.restore();
  const previous = [...f.records.values()][0].endpoint;
  f.controller.setContext('user-b', 3, true);
  await f.controller.restore();
  const next = [...f.records.values()].find(row => row.user_id === 'user-b');
  assert.notEqual(next.endpoint, previous);
  assert.equal(f.counters.unsubscribe, 1);
  await f.controller.detach();
  assert(![...f.records.values()].some(row => row.user_id === 'user-b'));
});

test('запрещённое разрешение не запрашивается повторно', async () => {
  const f = fixture({ permission: 'denied' });
  await assert.rejects(f.controller.enable(), error => error.code === 'permission_denied');
  assert.equal(f.counters.permissions, 0);
});

test('запоздавшая ошибка restore не сбрасывает успешное ручное подключение', async () => {
  const f = fixture({ permission: 'granted' });
  const originalGet = f.worker.pushManager.getSubscription;
  let failRestore;
  const waiting = new Promise((_, reject) => { failRestore = reject; });
  let calls = 0;
  f.worker.pushManager.getSubscription = () => calls++ === 0 ? waiting : originalGet();
  const restoring = f.controller.restore();
  await new Promise(setImmediate);
  const enabling = f.controller.enable();
  await new Promise(setImmediate);
  failRestore(new Error('old restore failed'));
  await Promise.all([restoring, enabling]);
  assert.equal(f.controller.snapshot().subscribed, true);
  assert.equal(f.controller.snapshot().error, null);
});

test('параллельные restore и enable создают только одну действующую подписку', async () => {
  const f = fixture({ permission: 'granted' });
  await Promise.all([f.controller.restore(), f.controller.enable(), f.controller.restore()]);
  assert.equal(f.counters.subscribe, 1);
  assert.equal(f.counters.unsubscribe, 0);
  assert.equal(f.records.size, 1);
  assert.equal(f.controller.snapshot().subscribed, true);
});
