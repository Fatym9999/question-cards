import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createPwaController, installationEnvironment } from '../js/pwa.js';
import { installationDialog } from '../js/view.js';

const manifest = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));

test('manifest и иконки сохраняют scope при переносе в другой base path', () => {
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.lang, 'ru');
  // Отсутствующий id получает значение start_url: приложение не присваивает себе корень origin.
  assert(!Object.hasOwn(manifest, 'id'));
  for (const path of ['/question-cards/', '/study/cards/', '/']) {
    const root = `https://example.com${path}`;
    const file = new URL('manifest.webmanifest', root);
    assert.equal(new URL(manifest.start_url, file).href, root);
    assert.equal(new URL(manifest.scope, file).href, root);
    for (const icon of manifest.icons) {
      assert(new URL(icon.src, file).pathname.startsWith(path));
    }
  }
});

test('PNG-иконки имеют нужные размеры', () => {
  for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable-512.png', 512], ['apple-touch-icon.png', 180]]) {
    const png = readFileSync(new URL(`../assets/icons/${name}`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
});

test('определение iPhone, iPadOS с настольным UA и standalone', () => {
  assert(installationEnvironment({ userAgent: 'iPhone Safari', standalone: false }, () => ({ matches: false })).ios);
  assert(installationEnvironment({ userAgent: 'Macintosh Safari', platform: 'MacIntel', maxTouchPoints: 5 }, () => ({ matches: false })).ios);
  assert(!installationEnvironment({ userAgent: 'Macintosh Safari', platform: 'MacIntel', maxTouchPoints: 0 }, () => ({ matches: false })).ios);
  assert(installationEnvironment({ standalone: true }, () => ({ matches: false })).standalone);
  assert(installationEnvironment({}, () => ({ matches: true })).standalone);
});

function fakeWindow({ secure = true, fail = false } = {}) {
  const win = new EventTarget();
  win.location = { origin: 'https://example.com' };
  win.isSecureContext = secure;
  win.matchMedia = () => ({ matches: false, addEventListener() {} });
  win.registrations = [];
  win.navigator = {
    userAgent: 'Chrome',
    serviceWorker: { async register(url, options) {
      win.registrations.push({ url, options });
      if (fail) throw new Error('test registration error');
      return { active: {} };
    } },
  };
  return win;
}

test('регистрация worker ограничена base path и не запрашивает разрешения', async () => {
  const win = fakeWindow();
  const controller = createPwaController(win);
  await controller.start();
  assert.equal(win.registrations[0].url, 'https://example.com/question-cards/sw.js');
  assert.equal(win.registrations[0].options.scope, 'https://example.com/question-cards/');
  assert.equal(win.registrations[0].options.updateViaCache, 'none');
  assert(controller.snapshot().ready);
});

test('prompt вызывается только явным install и используется один раз', async () => {
  const win = fakeWindow();
  const controller = createPwaController(win);
  let calls = 0;
  const event = new Event('beforeinstallprompt', { cancelable: true });
  event.prompt = async () => { calls += 1; };
  event.userChoice = Promise.resolve({ outcome: 'accepted' });
  win.dispatchEvent(event);
  assert(event.defaultPrevented);
  assert(controller.snapshot().canPrompt);
  assert.equal(calls, 0);
  assert.equal(await controller.install(), 'accepted');
  assert.equal(await controller.install(), 'unavailable');
  assert.equal(calls, 1);
  win.dispatchEvent(new Event('appinstalled'));
  assert(controller.snapshot().installedInBrowser);
});

test('незащищённый контекст и ошибка регистрации не ломают обычное приложение', async () => {
  const insecure = fakeWindow({ secure: false });
  await createPwaController(insecure).start();
  assert.equal(insecure.registrations.length, 0);
  const controller = createPwaController(fakeWindow({ fail: true }));
  await controller.start();
  assert(controller.snapshot().error);
});

test('инструкция iPhone не обещает программную установку, standalone показывает результат', () => {
  const ios = installationDialog({ ios: true, secure: true, standalone: false });
  assert(ios.includes('Safari'));
  assert(ios.includes('Поделиться'));
  assert(!ios.includes('data-action="install-pwa"'));
  assert(installationDialog({ secure: true, standalone: true }).includes('уже установлено'));
});

function workerHarness(windows = []) {
  const handlers = new Map();
  const notifications = [];
  const opened = [];
  const scope = 'https://example.com/question-cards/';
  const self = {
    registration: { scope, showNotification: async (title, options) => notifications.push({ title, ...options }) },
    clients: { claim: async () => {}, matchAll: async () => windows, openWindow: async url => opened.push(url) },
    skipWaiting: async () => {},
    addEventListener: (name, handler) => handlers.set(name, handler),
  };
  vm.runInNewContext(readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), { self, URL });
  return {
    handlers, notifications, opened,
    async dispatch(type, data = {}) {
      const pending = [];
      handlers.get(type)({ ...data, waitUntil: promise => pending.push(promise) });
      await Promise.all(pending);
    },
  };
}
const card = '22222222-2222-4222-8222-222222222222';

test('push не кеширует приложение и отклоняет адрес за пределами scope', async () => {
  const worker = workerHarness();
  assert(!worker.handlers.has('fetch'));
  await worker.dispatch('push', { data: { json: () => ({ title: 'Колода', body: 'Вопрос', url: `?card=${card}` }) } });
  assert.equal(worker.notifications[0].data.url, `https://example.com/question-cards/?card=${card}&src=push`);
  assert.equal(worker.notifications[0].icon, 'https://example.com/question-cards/assets/icons/icon-192.png');
  await worker.dispatch('push', { data: { json: () => ({ url: `https://other.example/?card=${card}` }) } });
  assert.equal(worker.notifications[1].data.url, 'https://example.com/question-cards/');
  await worker.dispatch('push', { data: { json: () => null } });
  assert.equal(worker.notifications[2].title, 'Карточки');
});

test('нажатие уведомления открывает точную карточку в существующем окне приложения', async () => {
  let focused = 0;
  let navigated;
  const window = { url: 'https://example.com/question-cards/?view=settings',
    async navigate(url) { navigated = url; return this; }, async focus() { focused += 1; } };
  const worker = workerHarness([{ url: 'https://example.com/another-app/' }, window]);
  await worker.dispatch('notificationclick', { notification: { close() {}, data: { url: `?card=${card}` } } });
  assert.equal(navigated, `https://example.com/question-cards/?card=${card}&src=push`);
  assert.equal(focused, 1);
  assert.equal(worker.opened.length, 0);
});

test('без окна приложения нажатие открывает новое окно только внутри scope', async () => {
  const worker = workerHarness();
  await worker.dispatch('notificationclick', { notification: { close() {}, data: { url: `https://example.com/another-app/?card=${card}` } } });
  assert.equal(worker.opened[0], 'https://example.com/question-cards/');
});
