# Полный код этапа 3

Все файлы ниже приведены целиком. Корень: `/Users/roman/Documents/Codex/test/question-cards`.

Готовые PNG-иконки находятся в `assets/icons/`: icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png. Они уже созданы из приведённого SVG. Остальные модули из этапа 2 продолжают использоваться.

## /Users/roman/Documents/Codex/test/question-cards/index.html

```html
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="light">
  <meta name="theme-color" content="#F1EEE9">
  <meta name="description" content="Карточки для спокойного, регулярного повторения.">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="Карточки">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <link id="app-manifest" rel="manifest" href="./manifest.webmanifest">
  <link id="apple-icon" rel="apple-touch-icon" sizes="180x180" href="./assets/icons/apple-touch-icon.png">
  <link id="app-icon" rel="icon" type="image/svg+xml" href="./assets/icons/icon.svg">
  <title>Карточки</title>
</head>
<body>
  <div class="app-shell">
    <div class="background-spot spot-one" aria-hidden="true"></div>
    <div class="background-spot spot-two" aria-hidden="true"></div>
    <main id="app" tabindex="-1" aria-label="Карточки"><p class="boot" role="status">Загружаем карточки…</p></main>
    <nav id="navigation" aria-label="Основная навигация" hidden></nav>
  </div>
  <div id="notice" class="notice" role="status" aria-live="polite" hidden></div>
  <dialog id="editor" aria-labelledby="dialog-title"></dialog>
  <noscript><p class="boot">Для работы приложения включи JavaScript в браузере.</p></noscript>
  <!-- Относительный входной модуль загружает остальные ресурсы через BASE_PATH. -->
  <script type="module" src="./js/bootstrap.js"></script>
</body>
</html>

```

## /Users/roman/Documents/Codex/test/question-cards/manifest.webmanifest

```json
{
  "name": "Карточки",
  "short_name": "Карточки",
  "description": "Карточки для спокойного, регулярного повторения.",
  "lang": "ru",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#F1EEE9",
  "theme_color": "#F1EEE9",
  "prefer_related_applications": false,
  "icons": [
    { "src": "assets/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "assets/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "assets/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}

```

## /Users/roman/Documents/Codex/test/question-cards/sw.js

```javascript
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

```

## /Users/roman/Documents/Codex/test/question-cards/js/pwa.js

```javascript
import { appUrl } from './config.js';

export function installationEnvironment(nav = globalThis.navigator, media = globalThis.matchMedia) {
  const standalone = Boolean(nav?.standalone)
    || Boolean(typeof media === 'function' && media('(display-mode: standalone)').matches);
  const ios = /iPad|iPhone|iPod/.test(nav?.userAgent ?? '')
    || (nav?.platform === 'MacIntel' && nav?.maxTouchPoints > 1);
  const android = /Android/i.test(nav?.userAgent ?? '');
  const safari = /Safari/i.test(nav?.userAgent ?? '') && !/Chrome|Chromium|Edg|OPR|CriOS|FxiOS/i.test(nav?.userAgent ?? '');
  return { standalone, ios, android, safari };
}

export function createPwaController(win = globalThis.window) {
  let promptEvent = null;
  let registration = null;
  let error = false;
  let installedInBrowser = false;
  const listeners = new Set();
  const changed = () => listeners.forEach(listener => listener());

  win.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    promptEvent = event;
    changed();
  });
  win.addEventListener('appinstalled', () => {
    promptEvent = null;
    installedInBrowser = true;
    changed();
  });
  const displayMode = win.matchMedia('(display-mode: standalone)');
  displayMode.addEventListener?.('change', changed);

  return {
    snapshot() {
      return {
        ...installationEnvironment(win.navigator, query => win.matchMedia(query)),
        canPrompt: promptEvent !== null,
        secure: win.isSecureContext,
        supported: 'serviceWorker' in win.navigator,
        ready: Boolean(registration?.active),
        installedInBrowser,
        error,
      };
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async start() {
      if (!win.isSecureContext || !('serviceWorker' in win.navigator)) return;
      try {
        registration = await win.navigator.serviceWorker.register(appUrl('sw.js', win.location.origin), {
          scope: appUrl('', win.location.origin), updateViaCache: 'none',
        });
        // Ошибки регистрации не мешают обычному изучению карточек.
        error = false;
        changed();
      } catch {
        error = true;
        changed();
      }
    },
    async install() {
      const available = promptEvent;
      if (!available) return 'unavailable';
      promptEvent = null;
      try {
        // prompt() вызывается непосредственно по нажатию пользователя.
        await available.prompt();
        const choice = await available.userChoice;
        return choice.outcome;
      } finally {
        changed();
      }
    },
  };
}

export const pwa = typeof window === 'undefined' ? null : createPwaController(window);

```

## /Users/roman/Documents/Codex/test/question-cards/js/bootstrap.js

```javascript
import { appUrl } from './config.js';
import { pwa } from './pwa.js';

document.querySelector('#app-manifest').href = appUrl('manifest.webmanifest');
document.querySelector('#apple-icon').href = appUrl('assets/icons/apple-touch-icon.png');
document.querySelector('#app-icon').href = appUrl('assets/icons/icon.svg');
// Регистрация запускается независимо от входа и не запрашивает разрешение на push.
void pwa.start();

try {
  await Promise.all(['assets/fonts/fonts.css', 'css/styles.css'].map(path => new Promise((resolve, reject) => {
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = appUrl(path);
    style.onload = resolve;
    style.onerror = () => reject(new Error('Не удалось загрузить оформление.'));
    document.head.append(style);
  })));
  // Официальный браузерный SDK поставляется как обычный script, приложение — ES-модули.
  await new Promise((resolve, reject) => {
    const sdk = document.createElement('script');
    sdk.src = appUrl('vendor/supabase-2.119.0.js');
    sdk.onload = resolve;
    sdk.onerror = () => reject(new Error('Не удалось загрузить подключение.'));
    document.head.append(sdk);
  });
  await import(appUrl('js/app.js'));
} catch {
  const root = document.querySelector('#app');
  root.replaceChildren();
  const message = document.createElement('p');
  message.className = 'boot';
  message.textContent = 'Не удалось открыть приложение. Проверь подключение к интернету и обнови страницу.';
  root.append(message);
}

```

## /Users/roman/Documents/Codex/test/question-cards/js/config.js

```javascript
// Единственное место, где задаётся путь приложения. Всегда с / в начале и конце.
export const BASE_PATH = '/question-cards/';

export const SUPABASE_URL = 'https://nvirttjdirfzsormbcun.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_sdQyzcfHKhLuIgNFx-y_ag_riA9TYbS';

export function appUrl(relativePath = '', origin = globalThis.location?.origin ?? 'http://localhost:8000') {
  return new URL(relativePath, new URL(BASE_PATH, origin)).href;
}

export function routeUrl(parameters = {}) {
  const url = new URL(appUrl());
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== null && value !== undefined) url.searchParams.set(key, value);
  }
  return url.href;
}

```

## /Users/roman/Documents/Codex/test/question-cards/js/app.js

```javascript
import { supabase, authReturnType, authReturnError } from './supabase-client.js';
import { api } from './api.js';
import { routeUrl } from './config.js';
import { MODES, buildQueue } from './study.js';
import { icon } from './icons.js';
import { pwa } from './pwa.js';
import {
  authView, decksView, deckView, studyView, settingsView, notificationsView,
  navigation, deckDialog, cardDialog, deleteDialog, installationDialog, loadingView,
  PRESETS,
} from './view.js';

const root = document.querySelector('#app');
const nav = document.querySelector('#navigation');
const dialog = document.querySelector('#editor');
const notice = document.querySelector('#notice');
const state = {
  user: null, decks: [], cards: [], settings: null, ready: false, failed: false,
  busy: false, route: readRoute(), filter: 'all', study: null,
  authMode: authReturnType === 'recovery' ? 'reset' : 'login', authMessage: '',
};
let loadVersion = 0;
let loadingUserId = null;
let lastLoaded = 0;
let lastFocus = null;
let noticeTimer;

function readRoute() {
  const query = new URLSearchParams(location.search);
  const candidate = query.get('view') ?? 'study';
  return {
    view: ['study', 'decks', 'deck', 'settings', 'notifications'].includes(candidate) ? candidate : 'study',
    deck: query.get('deck'), card: query.get('card'),
  };
}

function showNotice(message, isError = false) {
  clearTimeout(noticeTimer);
  notice.replaceChildren();
  notice.setAttribute('role', isError ? 'alert' : 'status');
  const text = document.createElement('span');
  text.textContent = message;
  const close = document.createElement('button');
  close.className = 'notice-close icon-button';
  close.setAttribute('aria-label', 'Закрыть сообщение');
  close.innerHTML = icon('close', 18);
  close.addEventListener('click', () => { notice.hidden = true; });
  notice.append(text, close);
  notice.hidden = false;
  if (!isError) noticeTimer = setTimeout(() => { notice.hidden = true; }, 7000);
}

function friendlyError(error) {
  const code = error?.code;
  if (code === 'invalid_credentials') return 'Неверная почта или пароль.';
  if (code === 'email_not_confirmed') return 'Сначала подтверди почту по ссылке из письма.';
  if (code === 'email_address_not_authorized') return 'На этот адрес пока нельзя отправить письмо. Для первого теста используй почту своего аккаунта Supabase.';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || error?.status === 429) return 'Слишком много попыток. Подожди и попробуй позже.';
  if (code === 'user_already_exists') return 'Такой аккаунт уже существует. Попробуй войти.';
  if (code === 'weak_password') return 'Придумай более надёжный пароль, не менее 8 символов.';
  if (code === 'signup_disabled') return 'Регистрация сейчас выключена.';
  if (code === 'same_password') return 'Новый пароль должен отличаться от прежнего.';
  if (code === 'otp_expired' || code === 'flow_state_expired') return 'Ссылка устарела. Запроси новое письмо.';
  if (code === '40001') return 'На другом устройстве уже ответили на эту карточку. Данные обновлены; проверь вопрос перед новой оценкой.';
  if (code === 'P0002' || code === 'PGRST116') return 'Запись удалена или недоступна. Обнови список.';
  if (code === '42501' || code === 'PGRST301' || code === 'refresh_token_not_found') return 'Сессия закончилась или нет доступа. Выйди и войди снова.';
  if (code === '23503') return 'Колода уже удалена или недоступна. Обнови список.';
  if (code === '23514' || code === '22023') return 'Проверь заполненные поля и границы времени.';
  if (error instanceof TypeError || /fetch|network|load failed|timeout/i.test(error?.message ?? '')) return 'Нет связи с сервером. Ответ не подтверждён; проверь интернет и попробуй снова.';
  return 'Не получилось сохранить изменения. Попробуй ещё раз.';
}

function updateBusy() {
  root.inert = state.busy;
  nav.inert = state.busy;
  dialog.inert = state.busy;
  root.setAttribute('aria-busy', String(state.busy));
}

async function work(callback) {
  if (state.busy) return;
  const startingUserId = state.user?.id;
  state.busy = true;
  updateBusy();
  try {
    await callback();
  } catch (error) {
    if (startingUserId && state.user?.id !== startingUserId) return;
    if (error?.code === '40001' || error?.code === 'P0002' || error?.code === 'PGRST116') {
      await refreshData();
    }
    showNotice(friendlyError(error), true);
  } finally {
    state.busy = false;
    updateBusy();
  }
}

function currentCard() {
  if (!state.study) return null;
  while (state.study.position < state.study.queue.length) {
    const card = state.cards.find(item => item.id === state.study.queue[state.study.position]);
    if (card) return card;
    state.study.position += 1;
  }
  return null;
}

function setStudy(mode = 'due', deckId = null, cardId = null) {
  const candidates = deckId ? state.cards.filter(card => card.deck_id === deckId) : state.cards;
  state.study = {
    queue: cardId ? [cardId] : buildQueue(candidates, mode),
    position: 0, revealed: false, mode, deckId,
  };
}

function render() {
  nav.hidden = !state.user || !state.ready || state.authMode === 'reset';
  if (!state.user || state.authMode === 'reset') {
    root.innerHTML = authView(state.authMode, state.authMessage, pwa.snapshot());
    updateBusy();
    return;
  }
  if (!state.ready) {
    root.innerHTML = loadingView(state.failed);
    updateBusy();
    return;
  }
  const { view } = state.route;
  const active = view === 'deck' ? 'decks' : view === 'notifications' ? 'settings' : view;
  nav.innerHTML = navigation(active);
  if (view === 'decks') root.innerHTML = decksView(state.decks, state.cards);
  else if (view === 'deck') {
    const deck = state.decks.find(item => item.id === state.route.deck);
    root.innerHTML = deck ? deckView(deck, state.cards, state.filter) : decksView(state.decks, state.cards);
  } else if (view === 'settings') root.innerHTML = settingsView(state.user.email, pwa.snapshot());
  else if (view === 'notifications') root.innerHTML = notificationsView(state.settings, state.decks);
  else {
    if (!state.study) setStudy();
    const card = currentCard();
    root.innerHTML = studyView(card, state.decks.find(item => item.id === card?.deck_id),
      state.study.position + 1, state.study.queue.length, state.study.revealed,
      { hasCards: state.cards.length > 0, enabled: false });
  }
  updateBusy();
}

function navigate(view, values = {}, replace = false) {
  const previousView = state.route.view;
  state.route = { view, deck: values.deck ?? null, card: values.card ?? null };
  if (view === 'deck' && previousView !== 'deck') state.filter = 'all';
  if (view === 'study' && (!state.study || (!currentCard() && previousView !== 'study'))) setStudy();
  history[replace ? 'replaceState' : 'pushState']({}, '', routeUrl({ view, ...values }));
  render();
  window.scrollTo({ top: 0 });
  root.focus({ preventScroll: true });
}

async function refreshData() {
  const userId = state.user?.id;
  if (!userId) return;
  const version = ++loadVersion;
  try {
    const loaded = await api.load(userId);
    if (version !== loadVersion || state.user?.id !== userId) return;
    Object.assign(state, loaded, { ready: true, failed: false });
    lastLoaded = Date.now();
    if (!state.study && state.route.card) {
      if (state.cards.some(card => card.id === state.route.card)) {
        state.route.view = 'study';
        setStudy('all', null, state.route.card);
      } else showNotice('Карточка удалена или недоступна.', true);
    }
    render();
  } catch (error) {
    if (version !== loadVersion || state.user?.id !== userId) return;
    state.failed = true;
    render();
    showNotice(friendlyError(error), true);
  }
}

async function acceptSession(session, event = '') {
  const user = session?.user ?? null;
  if (!user) {
    loadVersion += 1;
    loadingUserId = null;
    state.user = null;
    state.ready = false;
    state.study = null;
    state.decks = [];
    state.cards = [];
    state.settings = null;
    if (state.authMode === 'reset') state.authMode = 'login';
    if (dialog.open) dialog.close();
    render();
    return;
  }
  if (event === 'PASSWORD_RECOVERY') state.authMode = 'reset';
  const changedUser = state.user?.id !== user.id;
  state.user = user;
  if (changedUser) {
    state.ready = false;
    state.decks = [];
    state.cards = [];
    state.study = null;
    if (dialog.open) dialog.close();
  }
  if (state.authMode === 'reset') { render(); return; }
  if ((state.ready && !changedUser) || loadingUserId === user.id) return;
  loadingUserId = user.id;
  render();
  try { await refreshData(); } finally {
    if (loadingUserId === user.id) loadingUserId = null;
  }
}

function openDialog(html) {
  delete dialog.dataset.kind;
  lastFocus = document.activeElement;
  dialog.innerHTML = html;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  dialog.querySelector('[autofocus], input, button')?.focus();
}

function closeDialog() {
  dialog.close();
}

dialog.addEventListener('close', () => {
  delete dialog.dataset.kind;
  if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
  else root.focus({ preventScroll: true });
});
dialog.addEventListener('cancel', event => { if (state.busy) event.preventDefault(); });

function replaceCard(card) {
  if (card.user_id !== state.user?.id) return false;
  const index = state.cards.findIndex(item => item.id === card.id);
  if (index === -1) state.cards.push(card);
  else state.cards[index] = card;
  return true;
}

function replaceDeck(deck) {
  if (deck.user_id !== state.user?.id) return false;
  const index = state.decks.findIndex(item => item.id === deck.id);
  if (index === -1) state.decks.push(deck);
  else state.decks[index] = deck;
  return true;
}

async function saveNotificationValues(values) {
  const next = { ...state.settings, ...values };
  if (!next.start_time || !next.end_time || next.start_time.slice(0, 5) === next.end_time.slice(0, 5)) {
    showNotice('Начало и конец окна должны отличаться.', true);
    render(); return;
  }
  if (next.quiet_start !== null && (!next.quiet_end || next.quiet_start.slice(0, 5) === next.quiet_end.slice(0, 5))) {
    showNotice('Начало и конец режима «Не беспокоить» должны отличаться.', true);
    render(); return;
  }
  await work(async () => {
    const updated = await api.saveSettings(state.user.id, values);
    if (updated.user_id !== state.user?.id) return;
    state.settings = updated;
    render();
  });
  // При ошибке возвращаем поля к последнему подтверждённому состоянию.
  render();
}

document.addEventListener('click', async event => {
  const link = event.target.closest('a[data-route]');
  if (link) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    if (!state.busy) navigate(link.dataset.route, link.dataset.deck ? { deck: link.dataset.deck } : {});
    return;
  }
  const button = event.target.closest('button[data-action]');
  if (!button || state.busy || button.disabled) return;
  const { action, id } = button.dataset;
  if (action === 'close-dialog') return closeDialog();
  if (action === 'auth-mode') {
    state.authMode = button.dataset.mode;
    state.authMessage = '';
    render();
    return;
  }
  if (action === 'installation') {
    openDialog(installationDialog(pwa.snapshot()));
    dialog.dataset.kind = 'installation';
    return;
  }
  if (action === 'install-pwa') {
    try {
      const outcome = await pwa.install();
      if (outcome === 'accepted') showNotice('Установка подтверждена. Открой иконку «Карточки».');
    } catch {
      showNotice('Не удалось открыть установку. Используй меню браузера.', true);
    }
    return;
  }
  if (!state.user) return;
  if (action === 'reload') return refreshData();
  if (action === 'new-deck') return openDialog(deckDialog());
  if (action === 'edit-deck') return openDialog(deckDialog(state.decks.find(deck => deck.id === id)));
  if (action === 'new-card') return openDialog(cardDialog(state.decks, button.dataset.deck));
  if (action === 'edit-card') return openDialog(cardDialog(state.decks, null, state.cards.find(card => card.id === id)));
  if (action === 'form-favorite') {
    button.setAttribute('aria-checked', String(button.getAttribute('aria-checked') !== 'true'));
    return;
  }
  if (action === 'confirm-delete-deck') return openDialog(deleteDialog('deck', id, state.decks.find(deck => deck.id === id)?.name));
  if (action === 'confirm-delete-card') return openDialog(deleteDialog('card', id));
  if (action === 'filter') {
    if (Object.hasOwn(MODES, button.dataset.mode)) state.filter = button.dataset.mode;
    render(); return;
  }
  if (action === 'start-study') {
    setStudy(state.filter, button.dataset.deck);
    navigate('study'); return;
  }
  if (action === 'add-cards') {
    if (!state.decks.length) return openDialog(deckDialog());
    if (state.decks.length === 1) return openDialog(cardDialog(state.decks, state.decks[0].id));
    navigate('decks'); return;
  }
  if (action === 'reveal') { state.study.revealed = true; render(); return; }
  if (action === 'preset') {
    const preset = PRESETS[button.dataset.preset];
    if (!preset) { document.querySelector('#start-time')?.focus(); return; }
    const { per_day, start_time, end_time } = preset;
    return saveNotificationValues({ per_day, start_time, end_time });
  }
  if (action === 'count') return saveNotificationValues({ per_day: Math.max(1, state.settings.per_day + Number(button.dataset.delta)) });
  if (action === 'quiet') return saveNotificationValues(state.settings.quiet_start === null
    ? { quiet_start: '12:00', quiet_end: '14:00' } : { quiet_start: null, quiet_end: null });

  await work(async () => {
    const userId = state.user?.id;
    if (action === 'favorite') {
      const card = state.cards.find(item => item.id === id);
      if (!replaceCard(await api.saveCard(userId, id, { favorite: !card.favorite }))) return;
      render();
    } else if (action === 'deck-push') {
      const deck = state.decks.find(item => item.id === id);
      if (!replaceDeck(await api.saveDeck(userId, id, { push_enabled: !deck.push_enabled }))) return;
      render();
    } else if (action === 'rate') {
      const card = currentCard();
      if (!card) return;
      const studying = state.study;
      const updated = await api.review(card, button.dataset.rating);
      if (!replaceCard(updated)) return;
      studying.position += 1;
      studying.revealed = false;
      if (state.study !== studying || state.route.view !== 'study') { render(); return; }
      state.route.card = null;
      history.replaceState({}, '', routeUrl({ view: 'study' }));
      render();
      window.scrollTo({ top: 0 });
      root.querySelector('h1')?.setAttribute('tabindex', '-1');
      root.querySelector('h1')?.focus({ preventScroll: true });
    } else if (action === 'delete-card') {
      await api.deleteCard(userId, id);
      if (state.user?.id !== userId) return;
      state.cards = state.cards.filter(card => card.id !== id);
      closeDialog(); render();
    } else if (action === 'delete-deck') {
      await api.deleteDeck(userId, id);
      if (state.user?.id !== userId) return;
      state.decks = state.decks.filter(deck => deck.id !== id);
      state.cards = state.cards.filter(card => card.deck_id !== id);
      closeDialog(); navigate('decks');
    } else if (action === 'sign-out') {
      await api.signOut();
      state.authMode = 'login'; state.authMessage = '';
      await acceptSession(null);
      history.replaceState({}, '', routeUrl());
    }
  });
});

document.addEventListener('change', async event => {
  if (state.busy || state.route.view !== 'notifications' || !state.user) return;
  const { name, value } = event.target;
  if (['start_time', 'end_time', 'quiet_start', 'quiet_end'].includes(name)) {
    if (!value) { showNotice('Укажи время.', true); render(); return; }
    await saveNotificationValues({ [name]: value });
  }
});

document.addEventListener('submit', async event => {
  const form = event.target;
  if (!['auth-form', 'deck-form', 'card-form'].includes(form.id)) return;
  event.preventDefault();
  if (!form.reportValidity()) return;
  const values = new FormData(form);
  await work(async () => {
    if (form.id === 'auth-form') {
      const email = String(values.get('email') ?? '').trim();
      const password = String(values.get('password') ?? '');
      if (form.dataset.mode === 'register') {
        const result = await api.signUp(email, password);
        if (result.session) { state.authMode = 'login'; await acceptSession(result.session); }
        else {
          state.authMessage = 'Проверь почту: если регистрация доступна для этого адреса, придёт письмо с подтверждением. После подтверждения вернись ко входу.';
          state.authMode = 'login'; render();
        }
      } else if (form.dataset.mode === 'recover') {
        await api.resetPassword(email);
        state.authMessage = 'Если аккаунт с такой почтой существует, мы отправили ссылку для смены пароля.';
        state.authMode = 'login'; render();
      } else if (form.dataset.mode === 'reset') {
        await api.changePassword(password);
        state.authMode = 'login'; state.authMessage = '';
        showNotice('Пароль сохранён.');
        const { data } = await supabase.auth.getSession();
        await acceptSession(data.session);
      } else {
        const result = await api.signIn(email, password);
        state.authMode = 'login'; state.authMessage = '';
        await acceptSession(result.session);
      }
      return;
    }
    if (!state.user) return;
    const id = form.dataset.id || null;
    if (form.id === 'deck-form') {
      const name = String(values.get('name')).trim();
      if (!name) { showNotice('Добавь название колоды.', true); return; }
      const deck = await api.saveDeck(state.user.id, id, { name, exam_date: values.get('exam_date') || null });
      if (!replaceDeck(deck)) return;
      closeDialog(); navigate('deck', { deck: deck.id });
    } else {
      const question = String(values.get('question')).trim();
      const answer = String(values.get('answer')).trim();
      if (!question || !answer) { showNotice('Заполни вопрос и ответ.', true); return; }
      const card = await api.saveCard(state.user.id, id, {
        question, answer, deck_id: values.get('deck_id'),
        favorite: form.querySelector('[data-action="form-favorite"]').getAttribute('aria-checked') === 'true',
      });
      if (!replaceCard(card)) return;
      closeDialog(); navigate('deck', { deck: card.deck_id });
    }
  });
});

window.addEventListener('popstate', () => {
  if (dialog.open) dialog.close();
  state.route = readRoute();
  if (state.route.card && state.cards.some(card => card.id === state.route.card)) setStudy('all', null, state.route.card);
  render();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.user && state.ready
      && !state.busy && !dialog.open && Date.now() - lastLoaded > 30_000) refreshData();
});
setInterval(() => {
  if (document.visibilityState !== 'visible' || !state.ready || state.busy || dialog.open) return;
  if (state.route.view === 'study' && !currentCard()) {
    setStudy();
    render();
  } else if (['deck', 'decks'].includes(state.route.view)) render();
}, 60_000);

// Не вызываем асинхронные Auth-методы внутри синхронного callback SDK.
pwa.subscribe(() => {
  if (dialog.open && dialog.dataset.kind === 'installation') {
    const focusedAction = document.activeElement?.dataset.action;
    dialog.innerHTML = installationDialog(pwa.snapshot());
    if (focusedAction) dialog.querySelector(`[data-action="${focusedAction}"]`)?.focus();
  }
  if (!state.busy && state.user && state.route.view === 'settings') render();
});

supabase.auth.onAuthStateChange((event, session) => {
  setTimeout(() => { acceptSession(session, event).catch(() => showNotice('Не удалось восстановить вход. Обнови страницу.', true)); }, 0);
});

render();
const { data, error } = await supabase.auth.getSession();
if (error) showNotice(friendlyError(error), true);
await acceptSession(data.session);
if (authReturnError) showNotice('Ссылка подтверждения устарела или недействительна. Запроси новое письмо.', true);

```

## /Users/roman/Documents/Codex/test/question-cards/js/view.js

```javascript
import { appUrl, routeUrl } from './config.js';
import { icon } from './icons.js';
import { MODES, filterCards, cardCount, deckCount } from './study.js';

export function escapeHTML(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
const e = escapeHTML;
const action = (name, label, extra = '') => `<button class="text-button" data-action="${name}" ${extra}>${label}</button>`;
const back = view => `<a href="${routeUrl({ view })}" data-route="${view}" class="pill icon-button back-control" aria-label="Назад">${icon('back', 22)}</a>`;

export function switchButton(name, checked, label, extra = '') {
  return `<button type="button" class="switch" role="switch" aria-checked="${checked}" aria-label="${e(label)}" data-action="${name}" ${extra}><span class="switch-track"><span class="switch-knob"></span></span></button>`;
}

export function navigation(active) {
  return [['study', 'Учить'], ['decks', 'Колоды'], ['settings', 'Настройки']].map(([key, title]) =>
    `<a class="nav-tab" href="${routeUrl({ view: key })}" data-route="${key}" ${key === active ? 'aria-current="page"' : ''}>${icon(key)}<span>${title}</span></a>`).join('');
}

export function authView(mode, message = '', installation = {}) {
  const register = mode === 'register';
  const reset = mode === 'reset';
  const recover = mode === 'recover';
  const title = reset ? 'Новый пароль' : recover ? 'Восстановить вход' : 'Карточки';
  const subtitle = reset ? 'Придумай новый пароль для своего аккаунта.' : recover
    ? 'Пришлём ссылку для смены пароля.' : 'Повторяй понемногу. Запоминай надолго.';
  return `<section class="auth-page"><div class="auth-intro"><div class="accent-line"></div><h1>${title}</h1><p class="subtitle">${subtitle}</p></div>
    ${!reset && !recover ? `<div class="segments" aria-label="Вход или регистрация"><button class="segment" data-action="auth-mode" data-mode="login" aria-pressed="${!register}">Вход</button><button class="segment" data-action="auth-mode" data-mode="register" aria-pressed="${register}">Регистрация</button></div>` : ''}
    ${message ? `<p class="form-message" role="status">${e(message)}</p>` : ''}
    <form id="auth-form" class="auth-form" data-mode="${mode}">
      ${!reset ? '<label class="field" for="email">Почта<input id="email" name="email" type="email" autocomplete="email" placeholder="name@example.com" required autocapitalize="none" spellcheck="false"></label>' : ''}
      ${!recover ? `<label class="field" for="password">Пароль<input id="password" name="password" type="password" aria-label="Пароль" autocomplete="${register || reset ? 'new-password' : 'current-password'}" ${register || reset ? 'minlength="8" aria-describedby="password-help"' : ''} required>${register || reset ? '<span class="form-help" id="password-help">Не менее 8 символов.</span>' : ''}</label>` : ''}
      <button class="primary" type="submit">${reset ? 'Сохранить пароль' : recover ? 'Отправить ссылку' : register ? 'Создать аккаунт' : 'Войти'}</button>
    </form>
    ${!register && !reset && !recover ? action('auth-mode', 'Не помню пароль', 'data-mode="recover"') : ''}
    ${recover ? action('auth-mode', 'Вернуться ко входу', 'data-mode="login"') : ''}
    ${register ? '<p class="helper">После регистрации подтверди почту по ссылке из письма.</p>' : ''}
    ${installation.ios && !installation.standalone ? action('installation', 'Как установить на iPhone') : ''}
  </section>`;
}

export function decksView(decks, cards) {
  return `<section class="page"><header class="page-heading"><h1>Колоды</h1><p class="subtitle">${deckCount(decks.length)} · ${cardCount(cards.length)}</p></header>
    <div class="stack deck-stack">${decks.length ? decks.map(deck => {
      const own = cards.filter(card => card.deck_id === deck.id);
      const due = filterCards(own, 'due').length;
      return `<a href="${routeUrl({ view: 'deck', deck: deck.id })}" data-route="deck" data-deck="${e(deck.id)}" class="surface deck-tile"><span><span class="deck-name">${e(deck.name)}</span><span class="deck-meta">${cardCount(own.length)}</span></span>${due ? `<span class="badge" aria-label="К повторению: ${due}">${due}</span>` : '<span class="completed-label">Повторено</span>'}</a>`;
    }).join('') : '<p class="surface empty-note">Создай первую колоду и добавь в неё вопросы, которые хочешь запомнить.</p>'}
    <button class="dashed" data-action="new-deck">${icon('plus', 20)}Новая колода</button></div></section>`;
}

export function deckView(deck, cards, mode) {
  const own = cards.filter(card => card.deck_id === deck.id);
  const visible = filterCards(own, mode);
  return `<section class="page"><div class="toolbar">${back('decks')}<div class="toolbar-actions"><button class="pill icon-button" data-action="edit-deck" data-id="${e(deck.id)}" aria-label="Редактировать колоду">${icon('more', 22)}</button><button class="pill" data-action="new-card" data-deck="${e(deck.id)}">${icon('plus', 18)}Карточка</button></div></div>
    <header class="deck-heading"><h1>${e(deck.name)}</h1><p class="subtitle">${cardCount(own.length)}</p></header>
    <div class="deck-start"><button class="primary" data-action="start-study" data-deck="${e(deck.id)}" ${visible.length ? '' : 'disabled'}>Начать повторение</button></div>
    <div class="filters" aria-label="Режим изучения">${Object.entries(MODES).map(([key, label]) => `<button class="chip" data-action="filter" data-mode="${key}" aria-pressed="${mode === key}">${label} ${filterCards(own, key).length}</button>`).join('')}</div>
    <div class="surface card-list">${visible.length ? visible.map(card => `<div class="card-row"><button class="card-question" data-action="edit-card" data-id="${e(card.id)}" aria-label="Редактировать карточку: ${e(card.question)}">${e(card.question)}</button><button class="icon-button favorite-button" aria-label="${card.favorite ? 'Убрать из избранного' : 'Добавить в избранное'}" aria-pressed="${card.favorite}" data-action="favorite" data-id="${e(card.id)}">${icon('star', 22, card.favorite)}</button></div>`).join('') : '<p class="empty-note">В этом режиме пока нет карточек.</p>'}</div>
  </section>`;
}

export function studyView(card, deck, position, total, revealed, { hasCards = true, enabled = false } = {}) {
  if (!card) {
    return `<section class="study-page"><div class="done-area"><div class="done-icon">${icon('check', 32)}</div><h1>${hasCards ? 'На сегодня всё' : 'Начнём с вопроса'}</h1><p class="subtitle">${!hasCards ? 'Добавь карточки с тем, что хочешь запомнить.' : enabled ? 'Следующий вопрос придёт в уведомлении' : 'Можно добавить новые карточки или вернуться позже.'}</p><button class="primary" data-action="add-cards">Добавить карточки</button></div></section>`;
  }
  return `<section class="study-page"><header class="study-meta"><span>${e(deck?.name ?? 'Колода')}</span><span aria-label="Карточка ${position} из ${total}">${position} / ${total}</span></header>
    <div class="question-area"><div class="accent-line"></div><h1 class="question-text">${e(card.question)}</h1>${revealed ? `<div class="answer">${e(card.answer)}</div>` : `<button class="text-button reveal-answer" data-action="reveal" aria-expanded="false">Показать ответ${icon('down', 20)}</button>`}</div>
    <div class="ratings" aria-label="Оценка ответа"><button class="rating" data-action="rate" data-rating="again">Не знаю</button><button class="rating" data-action="rate" data-rating="hard">Сложно</button><button class="rating" data-action="rate" data-rating="good">Знаю</button></div></section>`;
}

export function settingsView(email, installation = {}) {
  return `<section class="page"><header class="page-heading"><h1>Настройки</h1></header><div class="stack">
    <div class="surface setting-group"><a class="setting-row setting-link" href="${routeUrl({ view: 'notifications' })}" data-route="notifications">${icon('bell', 22)}<span class="setting-text">Уведомления<small>Выключены</small></span><span class="setting-arrow">${icon('right', 18)}</span></a></div>
    <div class="surface setting-group"><button class="setting-row" data-action="installation" aria-label="Установка на телефон" aria-describedby="installation-summary">${icon('phone', 22)}<span class="setting-text">Установка на телефон<small id="installation-summary">${installation.standalone ? 'Установлено, открыто как приложение' : 'На экран «Домой», нужно для пушей на iPhone'}</small></span><span class="setting-arrow">${icon('right', 18)}</span></button></div>
    <div class="surface setting-group"><div class="setting-row">${icon('account', 22)}<span class="setting-text">Аккаунт<small>${e(email)}</small></span></div><button class="sign-out" data-action="sign-out">Выйти</button></div>
  </div></section>`;
}

export const PRESETS = Object.freeze({
  normal: { label: 'Обычный', per_day: 5, start_time: '09:00', end_time: '20:00' },
  evening: { label: 'Вечер', per_day: 3, start_time: '18:00', end_time: '22:00' },
  intensive: { label: 'Интенсив', per_day: 10, start_time: '09:00', end_time: '21:00' },
});

export function notificationsView(settings, decks) {
  const time = value => e(value?.slice(0, 5) ?? '');
  const preset = Object.entries(PRESETS).find(([, p]) => p.per_day === settings.per_day && p.start_time === settings.start_time.slice(0, 5) && p.end_time === settings.end_time.slice(0, 5))?.[0] ?? 'custom';
  const quiet = settings.quiet_start !== null;
  return `<section class="page"><div class="toolbar center-toolbar">${back('settings')}<h1>Уведомления</h1></div><div class="stack notification-stack">
    <div class="surface notification-main">${icon('bell', 22)}<span class="setting-text">Вопросы в уведомлениях<small>${settings.per_day} раз в день, с ${time(settings.start_time)} до ${time(settings.end_time)}</small></span>${switchButton('push-unavailable', false, 'Вопросы в уведомлениях', 'disabled')}</div>
    <p class="helper notification-help">Отправка уведомлений ещё не настроена. Предпочтения уже можно сохранить.</p>
    <div class="surface controls-group"><div class="segments presets" aria-label="Режим уведомлений">${[...Object.entries(PRESETS).map(([key, p]) => [key, p.label]), ['custom', 'Свой']].map(([key, label]) => `<button class="segment" data-action="preset" data-preset="${key}" aria-pressed="${preset === key}">${label}</button>`).join('')}</div>
    <div class="control-row"><span>Уведомлений в день</span><span class="stepper"><button class="icon-button" data-action="count" data-delta="-1" aria-label="Меньше" ${settings.per_day <= 1 ? 'disabled' : ''}>${icon('minus', 20)}</button><span class="stepper-output">${settings.per_day}</span><button class="icon-button" data-action="count" data-delta="1" aria-label="Больше">${icon('plus', 20)}</button></span></div>
    <label class="control-row" for="start-time">Начало<input id="start-time" name="start_time" class="time-input" type="time" value="${time(settings.start_time)}" required></label>
    <label class="control-row" for="end-time">Конец<input id="end-time" name="end_time" class="time-input" type="time" value="${time(settings.end_time)}" required></label>
    <div class="control-row"><span>Не беспокоить</span>${switchButton('quiet', quiet, 'Не беспокоить')}</div>
    ${quiet ? `<div class="control-row quiet-times"><label for="quiet-start">С<input id="quiet-start" name="quiet_start" class="time-input" type="time" value="${time(settings.quiet_start)}" required></label><label for="quiet-end">До<input id="quiet-end" name="quiet_end" class="time-input" type="time" value="${time(settings.quiet_end)}" required></label></div>` : ''}</div>
    <div class="surface controls-group"><p class="group-label">Колоды для уведомлений</p>${decks.length ? decks.map(deck => `<div class="control-row"><span>${e(deck.name)}</span>${switchButton('deck-push', deck.push_enabled, deck.name, `data-id="${e(deck.id)}"`)}</div>`).join('') : '<p class="empty-note">Сначала создай колоду.</p>'}</div>
    <p class="helper notification-help">Часовой пояс: ${e(settings.timezone)}. Изменения сохраняются автоматически.</p>
    <div class="center-text"><button class="text-button" disabled>Отправить тестовое уведомление</button></div>
  </div></section>`;
}

export function dialogHeading(title) {
  return `<div class="dialog-heading"><h2 id="dialog-title">${title}</h2><button type="button" class="icon-button" data-action="close-dialog" aria-label="Закрыть">${icon('close', 22)}</button></div>`;
}

export function installationDialog(info) {
  let content;
  if (info.standalone) {
    content = '<p class="dialog-message">Приложение уже установлено и открыто с иконки.</p>';
  } else if (info.installedInBrowser) {
    content = '<p class="dialog-message">Приложение установлено. Теперь открой его иконку на рабочем столе или экране «Домой».</p>';
  } else if (!info.secure) {
    content = '<p class="dialog-message">Для установки открой опубликованный сайт по HTTPS. На компьютере для разработки подходит localhost.</p>';
  } else if (info.ios) {
    content = '<ol class="install-steps"><li>Открой этот сайт в Safari.</li><li>Нажми «Поделиться» — квадрат со стрелкой вверх.</li><li>Выбери «На экран „Домой“» и нажми «Добавить».</li><li>Закрой Safari и открой «Карточки» с новой иконки.</li></ol><p class="helper">На iPhone push-уведомления доступны в установленном приложении с iOS 16.4. Если при добавлении предлагается режим веб-приложения, оставь его включённым.</p>';
  } else if (info.canPrompt) {
    content = '<p class="dialog-message">«Карточки» будут открываться в отдельном окне с собственной иконкой.</p><button class="primary" data-action="install-pwa">Установить приложение</button>';
  } else if (info.android) {
    content = '<ol class="install-steps"><li>Открой сайт в Chrome.</li><li>Нажми ⋮ справа от адресной строки.</li><li>Выбери «Установить и создать ярлык» → «Установить».</li><li>Подтверди установку и открой новую иконку.</li></ol><p class="helper">В других версиях браузера пункт может называться «Добавить на главный экран».</p>';
  } else {
    content = '<ol class="install-steps"><li>Открой сайт в Chrome или Edge.</li><li>В Chrome нажми ⋮ → «Транслировать, сохранить, поделиться» → «Установить страницу как приложение».</li><li>Подтверди установку и открой отдельное окно «Карточек».</li></ol><p class="helper">Если браузер предлагает значок установки справа от адресной строки, можно нажать на него.</p>';
  }
  return `${dialogHeading(info.standalone ? 'Приложение установлено' : 'Установка приложения')}
    <div class="dialog-form"><div class="install-intro"><img class="install-icon" src="${appUrl('assets/icons/icon-192.png')}" width="72" height="72" alt=""><div><h3>Карточки</h3><p class="helper">Своя иконка. Отдельное окно.</p></div></div>
    ${info.error ? '<p class="form-message">Не удалось подготовить установку. Проверь интернет и обнови страницу.</p>' : ''}
    ${content}<p class="helper">Для загрузки карточек и сохранения ответов нужен интернет.</p>
    <button class="text-button install-done" data-action="close-dialog">Понятно</button></div>`;
}

export function deckDialog(deck = null) {
  return `${dialogHeading(deck ? 'Редактировать колоду' : 'Новая колода')}<form id="deck-form" class="dialog-form" data-id="${e(deck?.id ?? '')}">
    <label class="field" for="deck-name">Название<input id="deck-name" name="name" value="${e(deck?.name ?? '')}" required placeholder="Например, Навигация" autofocus></label>
    <label class="field" for="exam-date">Дата экзамена<input id="exam-date" name="exam_date" aria-label="Дата экзамена" aria-describedby="exam-help" type="date" value="${e(deck?.exam_date ?? '')}"><span class="form-help" id="exam-help">Можно оставить пустой. Пока сохраняется только как заметка.</span></label>
    <div class="dialog-actions"><button type="submit" class="primary">${deck ? 'Сохранить' : 'Создать колоду'}</button>${deck ? action('confirm-delete-deck', 'Удалить колоду', `data-id="${e(deck.id)}"`) : ''}</div></form>`;
}

export function cardDialog(decks, deckId, card = null) {
  return `${dialogHeading(card ? 'Редактировать карточку' : 'Новая карточка')}<form id="card-form" class="dialog-form" data-id="${e(card?.id ?? '')}">
    <label class="field" for="card-question">Вопрос<textarea id="card-question" name="question" aria-label="Вопрос" required autofocus>${e(card?.question ?? '')}</textarea></label>
    <label class="field" for="card-answer">Ответ<textarea id="card-answer" name="answer" aria-label="Ответ" required>${e(card?.answer ?? '')}</textarea></label>
    <label class="field" for="card-deck">Колода<select id="card-deck" name="deck_id" aria-label="Колода">${decks.map(deck => `<option value="${e(deck.id)}" ${(card?.deck_id ?? deckId) === deck.id ? 'selected' : ''}>${e(deck.name)}</option>`).join('')}</select></label>
    <div class="check-field"><span>Избранное</span>${switchButton('form-favorite', card?.favorite ?? false, 'Избранное')}</div>
    <div class="dialog-actions"><button type="submit" class="primary">Сохранить карточку</button>${card ? action('confirm-delete-card', 'Удалить карточку', `data-id="${e(card.id)}"`) : ''}</div></form>`;
}

export function deleteDialog(kind, id, name) {
  const isDeck = kind === 'deck';
  return `${dialogHeading(isDeck ? 'Удалить колоду?' : 'Удалить карточку?')}<div class="dialog-form"><p class="dialog-message">${isDeck ? `Колода «${e(name)}», её карточки и история ответов будут удалены.` : 'Карточка и история её ответов будут удалены.'}</p><div class="dialog-actions"><button class="primary" data-action="delete-${kind}" data-id="${e(id)}">Удалить</button><button class="text-button" data-action="close-dialog">Отмена</button></div></div>`;
}

export function loadingView(failed = false) {
  return `<section class="loading-page"><h1>${failed ? 'Не удалось загрузить' : 'Загружаем карточки'}</h1><p>${failed ? 'Проверь подключение к интернету и попробуй снова.' : 'Ещё немного…'}</p>${failed ? '<button class="primary" data-action="reload">Попробовать снова</button><button class="text-button" data-action="sign-out">Выйти</button>' : ''}</section>`;
}

```

## /Users/roman/Documents/Codex/test/question-cards/css/styles.css

```css
:root {
  color-scheme: light;
  --paper: #F1EEE9;
  --ink: #2B2622;
  --muted: #6A6259;
  --accent: #D97757;
  --link: #A9502F;
  --line: #E4DFD6;
  --button-line: #D6D0C6;
  --surface: rgba(255,255,255,.6);
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  font-family: Manrope, system-ui, sans-serif;
  color: var(--ink);
  background: var(--paper);
  font-synthesis: none;
  -webkit-tap-highlight-color: transparent;
}
* { box-sizing: border-box; }
body { margin: 0; min-width: 280px; overflow-wrap: anywhere; }
.boot { padding: 64px 28px; font-size: 16px; }
button, input, textarea, select { font: inherit; color: inherit; }
button, a, input, textarea, select { touch-action: manipulation; }
button { cursor: pointer; }
button:disabled { cursor: default; opacity: .5; }
a { color: var(--link); }
button, a { -webkit-user-select: none; user-select: none; }
button:focus-visible, a:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible {
  outline: 2px solid var(--link); outline-offset: 4px;
}
[hidden] { display: none !important; }
svg { flex: none; }
h1, h2, p { margin: 0; }
h1 { font: 500 34px/1.25 Lora, Georgia, serif; letter-spacing: -.01em; }
h2 { font: 600 17px/1.4 Manrope, system-ui, sans-serif; }
.app-shell { position: relative; isolation: isolate; max-width: 480px; min-height: 100svh; margin: 0 auto; }
#app { position: relative; z-index: 1; outline: none; }
.background-spot { position: fixed; border-radius: 50%; pointer-events: none; z-index: -1; }
.spot-one { left: calc(50% - 265px); bottom: -50px; width: 280px; height: 280px; background: #D97757; opacity: .3; filter: blur(34px); }
.spot-two { left: calc(50% + 75px); bottom: 60px; width: 200px; height: 200px; background: #C99A3A; opacity: .18; filter: blur(30px); }
.page { padding-bottom: calc(112px + var(--safe-bottom)); }
.page-heading { padding: calc(64px + var(--safe-top)) 28px 0; }
.subtitle { margin-top: 6px; color: var(--muted); font-size: 14px; line-height: 1.5; }
.stack { display: flex; flex-direction: column; gap: 12px; padding: 22px 20px 0; }
.deck-stack { padding-top: 24px; }
.surface { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; }
.primary { width: 100%; min-height: 56px; padding: 14px 20px; border: 0; border-radius: 18px; background: var(--ink); color: var(--paper); font-size: 17px; font-weight: 600; }
.secondary { width: 100%; min-height: 52px; padding: 12px 20px; border: 1px solid var(--button-line); border-radius: 16px; background: rgba(255,255,255,.5); font-weight: 600; }
.text-button { min-height: 44px; padding: 8px 0; border: 0; background: none; color: var(--link); font-size: 16px; font-weight: 500; text-align: left; }
.danger { color: var(--link); }
.dashed { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 56px; border: 1.5px dashed #A39B8E; background: transparent; border-radius: 20px; font-size: 16px; font-weight: 600; }
.deck-tile { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; padding: 18px; text-align: left; color: var(--ink); text-decoration: none; }
.deck-name { display: block; font-size: 17px; font-weight: 600; }
.deck-meta { display: block; margin-top: 2px; font-size: 14px; color: var(--muted); }
.badge { flex: none; padding: 4px 12px; border-radius: 99px; background: #F3DCCF; color: #8A3F23; font-size: 14px; font-weight: 600; }
.completed-label { color: var(--muted); font-size: 14px; flex: none; }
.empty-note { padding: 22px 18px; color: var(--muted); font-size: 15px; line-height: 1.6; }
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: calc(56px + var(--safe-top)) 20px 0; }
.toolbar-actions { display: flex; align-items: center; gap: 8px; }
.pill { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; padding: 0 16px; border-radius: 22px; background: var(--surface); border: 1px solid rgba(255,255,255,.85); font-size: 15px; font-weight: 600; text-decoration: none; color: var(--ink); }
.icon-button { width: 44px; min-width: 44px; height: 44px; min-height: 44px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
.deck-heading { padding: 16px 28px 0; }
.deck-start { padding: 18px 20px 0; }
.filters { display: flex; gap: 8px; padding: 16px 20px 0; overflow-x: auto; scrollbar-width: none; }
.filters::-webkit-scrollbar { display: none; }
.chip { flex: none; min-height: 44px; padding: 0 16px; border-radius: 22px; border: 1px solid var(--button-line); background: rgba(255,255,255,.5); font-size: 14px; font-weight: 600; }
.chip[aria-pressed="true"] { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.card-list { margin: 14px 20px 0; overflow: hidden; }
.card-row { display: flex; align-items: center; gap: 12px; min-height: 60px; padding: 0 6px 0 18px; }
.card-row + .card-row { border-top: 1px solid var(--line); }
.card-question { flex: 1; min-width: 0; min-height: 60px; padding: 12px 0; border: 0; background: none; font-size: 16px; font-weight: 500; line-height: 1.35; text-align: left; white-space: pre-wrap; }
.favorite-button { border: 0; background: none; color: var(--muted); }
.favorite-button[aria-pressed="true"] { color: var(--link); }
.study-page { display: flex; flex-direction: column; min-height: 100svh; padding-bottom: 0; }
.study-meta { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: calc(56px + var(--safe-top)) 28px 0; color: var(--muted); font-size: 14px; }
.study-meta span:first-child { min-width: 0; }
.study-meta span:last-child { white-space: nowrap; }
.question-area { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 30px 28px; }
.accent-line { width: 28px; height: 3px; min-height: 3px; border-radius: 2px; background: var(--accent); margin-bottom: 24px; }
.question-text { white-space: pre-wrap; }
.reveal-answer { align-self: flex-start; display: flex; align-items: center; gap: 6px; margin-top: 20px; padding: 0; }
.answer { margin-top: 20px; padding: 16px 18px; border-radius: 18px; background: var(--surface); border: 1px solid var(--line); font-size: 17px; line-height: 1.5; white-space: pre-wrap; }
.ratings { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; padding: 0 20px calc(112px + var(--safe-bottom)); }
.rating { min-width: 0; height: 60px; border: 1px solid var(--button-line); background: rgba(255,255,255,.5); border-radius: 16px; font-size: 16px; font-weight: 600; }
.rating:last-child { background: var(--ink); border-color: var(--ink); color: var(--paper); }
.done-area { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: calc(64px + var(--safe-top)) 28px calc(112px + var(--safe-bottom)); gap: 16px; }
.done-icon { display: flex; align-items: center; justify-content: center; width: 68px; height: 68px; border: 1px solid var(--line); border-radius: 50%; background: rgba(255,255,255,.55); margin-bottom: 4px; }
.done-area .subtitle { margin: 0; max-width: 300px; font-size: 16px; }
.done-area .primary { margin-top: 10px; max-width: 320px; }
.setting-group { overflow: hidden; }
.setting-row { width: 100%; min-height: 60px; display: flex; align-items: center; gap: 14px; padding: 10px 16px; border: 0; background: none; text-align: left; font-weight: 500; }
.setting-text { flex: 1; min-width: 0; }
.setting-link { color: inherit; text-decoration: none; }
.setting-text small { display: block; color: var(--muted); font-size: 13px; font-weight: 400; line-height: 1.5; }
.setting-arrow { color: var(--muted); }
.sign-out { width: 100%; min-height: 56px; padding: 0 16px; border: 0; border-top: 1px solid var(--line); background: none; text-align: left; color: var(--link); font-weight: 600; }
.center-toolbar { position: relative; justify-content: center; min-height: calc(100px + var(--safe-top)); }
.center-toolbar .back-control { position: absolute; left: 20px; bottom: 0; }
.center-toolbar h1 { margin-top: 6px; font: 600 17px/1.5 Manrope, system-ui, sans-serif; letter-spacing: 0; }
.notification-stack { padding-top: 12px; }
.notification-main { display: flex; align-items: center; gap: 14px; padding: 10px 16px; }
.switch { display: flex; align-items: center; justify-content: center; width: 52px; min-width: 52px; min-height: 44px; padding: 0; border: 0; background: none; }
.switch-track { display: flex; justify-content: flex-start; width: 52px; height: 32px; padding: 3px; border-radius: 16px; background: #A39B8E; }
.switch[aria-checked="true"] .switch-track { justify-content: flex-end; background: var(--ink); }
.switch-knob { width: 26px; height: 26px; border-radius: 13px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25); }
.controls-group { padding: 14px 12px 4px; }
.segments { display: flex; gap: 2px; padding: 3px; border-radius: 14px; background: rgba(43,38,34,.06); }
.presets { margin: 0 4px 6px; }
.segment { flex: 1; min-height: 44px; min-width: 0; padding: 4px; border: 0; border-radius: 11px; background: transparent; color: #5C554C; font-size: 13px; font-weight: 500; }
.segment[aria-pressed="true"] { background: #fff; box-shadow: 0 1px 4px rgba(43,38,34,.15); color: var(--ink); font-weight: 600; }
.control-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 56px; padding: 0 4px; border-top: 1px solid var(--line); font-size: 16px; font-weight: 500; }
.stepper { display: flex; align-items: center; gap: 6px; }
.stepper-output { min-width: 22px; text-align: center; font-size: 17px; font-weight: 600; }
.stepper .icon-button { border: 1px solid var(--button-line); border-radius: 22px; background: rgba(255,255,255,.7); }
.time-input { width: 108px; min-width: 0; min-height: 44px; padding: 4px; border: 0; background: transparent; text-align: right; font-size: 16px; font-weight: 600; }
.quiet-times { flex-wrap: wrap; padding: 8px 4px; }
.quiet-times label { display: flex; align-items: center; gap: 4px; font-size: 14px; color: var(--muted); }
.quiet-times input { width: 100px; }
.group-label { padding: 0 4px 8px; font-size: 15px; font-weight: 600; }
.helper { color: var(--muted); font-size: 13px; line-height: 1.5; }
.notification-help { padding: 0 6px; }
.center-text { text-align: center; }
#navigation { position: fixed; z-index: 20; left: 50%; bottom: calc(28px + var(--safe-bottom)); transform: translateX(-50%); display: flex; gap: 4px; width: calc(100% - 40px); max-width: 440px; height: 68px; padding: 6px; border-radius: 34px; background: rgba(255,255,255,.5); backdrop-filter: blur(22px) saturate(1.6); -webkit-backdrop-filter: blur(22px) saturate(1.6); border: 1px solid rgba(255,255,255,.75); box-shadow: 0 8px 28px rgba(43,38,34,.14), inset 0 1px 0 rgba(255,255,255,.9); }
.nav-tab { flex: 1; min-width: 0; border: 0; border-radius: 28px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; font-size: 12px; font-weight: 500; color: #5C554C; text-decoration: none; }
.nav-tab[aria-current="page"] { background: rgba(255,255,255,.85); box-shadow: 0 2px 8px rgba(43,38,34,.1); color: var(--ink); font-weight: 600; }
.auth-page { display: flex; flex-direction: column; min-height: 100svh; padding: calc(80px + var(--safe-top)) 28px calc(32px + var(--safe-bottom)); gap: 28px; }
.auth-intro { margin-bottom: 4px; }
.auth-form { display: flex; flex-direction: column; gap: 18px; }
.auth-page .segments { margin-bottom: 4px; }
.auth-page .segment { font-size: 15px; }
.field { display: flex; flex-direction: column; gap: 8px; font-size: 14px; font-weight: 500; }
.field input, .field textarea, .field select { width: 100%; min-height: 52px; padding: 12px 14px; border: 1px solid var(--button-line); border-radius: 14px; background: rgba(255,255,255,.6); font-size: 16px; font-weight: 400; }
.field textarea { min-height: 112px; resize: vertical; line-height: 1.5; }
.form-help { font-size: 13px; font-weight: 400; color: var(--muted); line-height: 1.5; }
.form-message { padding: 14px 16px; border-radius: 16px; background: rgba(255,255,255,.65); border: 1px solid var(--line); font-size: 14px; line-height: 1.6; }
.notice { position: fixed; z-index: 100; top: calc(12px + var(--safe-top)); left: 50%; transform: translateX(-50%); width: calc(100% - 32px); max-width: 448px; padding: 14px 44px 14px 16px; border: 1px solid var(--button-line); border-radius: 16px; background: #fffaf4; box-shadow: 0 6px 22px rgba(43,38,34,.12); font: 500 14px/1.5 Manrope, system-ui, sans-serif; }
.notice-close { position: absolute; right: 0; top: 0; border: 0; background: none; color: var(--muted); }
dialog { width: calc(100% - 32px); max-width: 448px; max-height: calc(100dvh - 40px); padding: 24px; border: 1px solid rgba(255,255,255,.85); border-radius: 24px; background: #F1EEE9; box-shadow: 0 16px 60px rgba(43,38,34,.2); overflow-y: auto; }
dialog::backdrop { background: rgba(43,38,34,.25); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.dialog-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: -4px 0 16px; }
.dialog-heading h2 { font: 500 26px/1.25 Lora, Georgia, serif; }
.dialog-heading .icon-button { margin-right: -12px; border: 0; background: none; }
.dialog-form { display: flex; flex-direction: column; gap: 18px; }
.dialog-message { font-size: 16px; line-height: 1.6; white-space: pre-wrap; }
.install-intro { display: flex; align-items: center; gap: 16px; }
.install-intro h3 { margin: 0 0 4px; font: 600 18px/1.4 Manrope, system-ui, sans-serif; }
.install-icon { flex: none; width: 72px; height: 72px; border-radius: 18px; border: 1px solid var(--line); }
.install-steps { margin: 0; padding-left: 24px; font-size: 16px; line-height: 1.6; }
.install-steps li + li { margin-top: 10px; }
.install-steps li::marker { color: var(--link); font-weight: 600; }
.install-done { text-align: center; }
.dialog-actions { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
.dialog-actions .text-button { text-align: center; }
.check-field { display: flex; align-items: center; justify-content: space-between; gap: 16px; font-size: 15px; }
.loading-page { min-height: 100svh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; padding: 28px; text-align: center; }
.loading-page p { color: var(--muted); line-height: 1.5; }
.loading-page .primary { max-width: 300px; }
@media (max-width: 350px) {
  .question-area { padding-left: 22px; padding-right: 22px; }
  .rating { font-size: 14px; }
  .ratings { gap: 6px; }
  .control-row { font-size: 14px; }
  .presets .segment { font-size: 12px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; animation: none !important; transition: none !important; }
}

```

## /Users/roman/Documents/Codex/test/question-cards/assets/icons/icon.svg

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <rect width="512" height="512" fill="#F1EEE9"/>
  <rect x="156" y="143" width="230" height="210" rx="34" transform="rotate(9 156 143)" fill="#E4DFD6"/>
  <rect x="126" y="148" width="250" height="218" rx="34" fill="#FFFCF8" stroke="#2B2622" stroke-width="12"/>
  <path d="M184 119h135" stroke="#2B2622" stroke-width="12" stroke-linecap="round"/>
  <path d="M183 210h44" stroke="#D97757" stroke-width="10" stroke-linecap="round"/>
  <path d="M183 261h136M183 296h95" stroke="#2B2622" stroke-width="12" stroke-linecap="round"/>
</svg>

```

## /Users/roman/Documents/Codex/test/question-cards/tests/pwa.test.mjs

```javascript
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

```

## /Users/roman/Documents/Codex/test/question-cards/tests/browser.mjs

```javascript
// Не обращается к реальной базе: все Supabase-запросы перехвачены тестом.
// Для запуска нужны Node.js, Playwright и установленный Chrome/Chromium.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { BASE_PATH } from '../js/config.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await context.addInitScript(() => {
  window.__notificationRequests = 0;
  Notification.requestPermission = async () => { window.__notificationRequests += 1; return 'default'; };
});
const page = await context.newPage();
page.setDefaultTimeout(10_000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const output = new URL('../artifacts/', import.meta.url).pathname;
await mkdir(output, { recursive: true });

const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'test@example.com', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: new Date().toISOString() };
let decks = [];
let cards = [];
let settings = null;
const reviews = [];
let failNextReview = false;
let conflictNextReview = false;
const jwt = [
  { alg: 'HS256', typ: 'JWT' },
  { sub: user.id, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, iss: 'test' },
].map(x => Buffer.from(JSON.stringify(x)).toString('base64url')).join('.') + '.test-signature';
const session = { access_token: jwt, refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer', user };

await page.route('https://nvirttjdirfzsormbcun.supabase.co/**', async route => {
  const request = route.request();
  const url = new URL(request.url());
  const method = request.method();
  const body = request.postDataJSON();
  const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  if (url.pathname.endsWith('/token')) return json(session);
  if (url.pathname.endsWith('/signup')) return json({ user, session: null });
  if (url.pathname.endsWith('/recover')) return json({});
  if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204 });
  if (url.pathname.endsWith('/user')) return json(user);
  if (url.pathname.endsWith('/rpc/record_review')) {
    if (failNextReview) { failNextReview = false; return json({ message: 'Test network failure' }, 503); }
    const card = cards.find(c => c.id === body.p_card_id);
    if (conflictNextReview) { conflictNextReview = false; card.revision += 1; }
    if (body.p_expected_revision !== card.revision) return json({ code: '40001', message: 'Conflict' }, 400);
    reviews.push({ ...body, previous_interval: card.interval_days });
    Object.assign(card, {
      interval_days: body.p_interval_days, due_at: body.p_due_at,
      repetitions: body.p_repetitions, lapses: body.p_lapses,
      hard_count: body.p_hard_count, last_reviewed_at: body.p_reviewed_at,
      revision: card.revision + 1,
    });
    return json(card);
  }
  const table = url.pathname.split('/').at(-1);
  const id = url.searchParams.get('id')?.replace(/^eq\./, '');
  const single = request.headers().accept?.includes('vnd.pgrst.object');
  if (table === 'notification_settings') {
    if (method === 'POST') settings = { user_id: user.id, enabled: false, per_day: 5, start_time: '09:00:00', end_time: '20:00:00', quiet_start: null, quiet_end: null, ...body };
    if (method === 'PATCH') Object.assign(settings, body);
    return json(single ? settings : settings ? [settings] : []);
  }
  const list = table === 'decks' ? decks : table === 'cards' ? cards : null;
  if (!list) return json({ message: `Unexpected request: ${url.pathname}` }, 500);
  if (method === 'GET') return json(id && single ? list.find(x => x.id === id) : list.filter(x => !id || x.id === id));
  if (method === 'POST') {
    const row = { id: randomUUID(), user_id: user.id, created_at: new Date().toISOString(),
      ...(table === 'decks' ? { exam_date: null, push_enabled: true } : {
        interval_days: 0, due_at: new Date(Date.now() - 1000).toISOString(), repetitions: 0,
        lapses: 0, hard_count: 0, last_reviewed_at: null, revision: 0, favorite: false,
      }), ...body };
    list.push(row);
    return json(single ? row : [row], 201);
  }
  const row = list.find(x => x.id === id);
  if (method === 'PATCH') { Object.assign(row, body); return json(single ? row : [row]); }
  if (method === 'DELETE') {
    if (table === 'decks') { decks = decks.filter(x => x.id !== id); cards = cards.filter(x => x.deck_id !== id); }
    else cards = cards.filter(x => x.id !== id);
    return json(single ? row : [row]);
  }
  return json({ message: 'Unexpected method' }, 500);
});

const url = `http://localhost:8000${BASE_PATH}`;
const idle = () => page.locator('#app[aria-busy="false"]').waitFor();
const fill = async (name, value) => page.getByLabel(name, { exact: true }).fill(value);
const click = async name => { await page.getByRole('button', { name, exact: true }).click(); await idle(); };
try {
  await page.goto(url);
  await page.getByRole('button', { name: 'Войти', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert(await page.evaluate(() => document.fonts.check('500 34px Lora') && document.fonts.check('400 16px Manrope')), 'оба шрифта загружены');
  const pwaInfo = await page.evaluate(async () => {
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('SW activation timeout')), 10_000)),
    ]);
    const file = document.querySelector('link[rel="manifest"]').href;
    const manifest = await (await fetch(file)).json();
    return { scope: registration.scope, worker: registration.active.scriptURL,
      start: new URL(manifest.start_url, file).href, display: manifest.display,
      apple: document.querySelector('link[rel="apple-touch-icon"]').href,
      cached: await caches.keys(), notificationRequests: window.__notificationRequests };
  });
  assert.equal(pwaInfo.scope, url);
  assert.equal(pwaInfo.worker, `${url}sw.js`);
  assert.equal(pwaInfo.start, url);
  assert.equal(pwaInfo.display, 'standalone');
  assert.equal(pwaInfo.apple, `${url}assets/icons/apple-touch-icon.png`);
  assert.deepEqual(pwaInfo.cached, []);
  assert.equal(pwaInfo.notificationRequests, 0);
  await page.screenshot({ path: `${output}01-login.png` });
  await click('Регистрация');
  await fill('Почта', 'test@example.com'); await fill('Пароль', 'test-password');
  await click('Создать аккаунт');
  console.log('registration submitted');
  await page.getByText('Проверь почту:', { exact: false }).waitFor();
  await fill('Почта', 'test@example.com'); await fill('Пароль', 'test-password');
  await click('Войти');
  console.log('login submitted');
  await page.getByRole('heading', { name: 'Начнём с вопроса' }).waitFor();

  await page.getByRole('link', { name: 'Колоды', exact: true }).click();
  await click('Новая колода');
  await fill('Название', 'Навигация');
  await fill('Дата экзамена', '2027-06-01');
  await click('Создать колоду');
  assert.equal(decks.length, 1);
  assert.equal(decks[0].exam_date, '2027-06-01');

  for (const [question, answer] of [
    ['Что такое угол сноса?', 'Угол между курсом и линией пути (направлением вектора путевой скорости).'],
    ['Что такое магнитное склонение?', 'Угол между истинным и магнитным меридианами.'],
    ['Какие три вектора образуют навигационный треугольник скоростей?', 'Воздушная скорость, скорость ветра и путевая скорость.'],
  ]) {
    await click('Карточка'); await fill('Вопрос', question); await fill('Ответ', answer);
    await click('Сохранить карточку');
  }
  assert.equal(cards.length, 3);
  await page.getByRole('button', { name: 'Добавить в избранное' }).first().click(); await idle();
  assert.equal(cards.filter(c => c.favorite).length, 1);
  await page.screenshot({ path: `${output}02-deck.png` });

  await click('Избранные 1');
  assert.equal(await page.locator('.card-row').count(), 1);
  await click('Начать повторение');
  await page.getByRole('heading', { name: cards.find(c => c.favorite).question, exact: true }).waitFor();
  await page.screenshot({ path: `${output}03-question.png` });
  await click('Показать ответ');
  await page.locator('.answer').waitFor();
  await page.screenshot({ path: `${output}04-answer.png` });
  await click('Знаю');
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].p_interval_days, 3);
  await page.getByRole('heading', { name: 'На сегодня всё' }).waitFor();
  await page.screenshot({ path: `${output}05-complete.png` });

  await page.getByRole('link', { name: 'Колоды', exact: true }).click();
  await page.screenshot({ path: `${output}06-decks.png` });
  await page.locator('.deck-tile').click();
  await click('К повторению 2');
  await click('Начать повторение');
  const questionBeforeFailure = await page.locator('.question-text').textContent();
  failNextReview = true;
  await click('Сложно');
  assert.equal(await page.locator('.question-text').textContent(), questionBeforeFailure);
  assert.equal(reviews.length, 1);
  await click('Закрыть сообщение');
  conflictNextReview = true;
  await click('Сложно');
  assert.equal(reviews.length, 1);
  assert.equal(await page.locator('.question-text').textContent(), questionBeforeFailure);
  await click('Закрыть сообщение');
  await click('Сложно');
  assert.equal(reviews.at(-1).p_interval_days, 1);
  assert.notEqual(await page.locator('.question-text').textContent(), questionBeforeFailure);
  assert.equal(await page.locator('.answer').count(), 0);
  await click('Не знаю');
  assert.equal(reviews.at(-1).p_interval_days, 0);
  assert.equal(reviews.at(-1).p_lapses, 1);
  assert.equal(reviews.at(-1).p_repetitions, 0);
  await page.getByRole('heading', { name: 'На сегодня всё' }).waitFor();

  await page.getByRole('link', { name: 'Настройки', exact: true }).click();
  assert.equal(await page.getByText('Тема', { exact: true }).count(), 0);
  await page.screenshot({ path: `${output}07-settings.png` });
  await click('Установка на телефон');
  await page.getByRole('heading', { name: 'Установка приложения', exact: true }).waitFor();
  await page.evaluate(() => {
    window.__installPrompts = 0;
    const event = new Event('beforeinstallprompt', { cancelable: true });
    event.prompt = async () => { window.__installPrompts += 1; };
    event.userChoice = Promise.resolve({ outcome: 'dismissed' });
    window.dispatchEvent(event);
  });
  assert.equal(await page.evaluate(() => window.__installPrompts), 0);
  await page.screenshot({ path: `${output}09-installation.png` });
  await click('Установить приложение');
  assert.equal(await page.evaluate(() => window.__installPrompts), 1);
  await click('Понятно');
  await page.getByRole('link', { name: 'Уведомления', exact: false }).click();
  await click('Вечер'); assert.equal(settings.per_day, 3);
  await click('Больше'); assert.equal(settings.per_day, 4);
  await page.getByRole('switch', { name: 'Не беспокоить', exact: true }).click(); await idle();
  assert.equal(settings.quiet_start, '12:00');
  await page.getByRole('switch', { name: 'Навигация', exact: true }).click(); await idle();
  assert.equal(decks[0].push_enabled, false);
  assert.equal(settings.enabled, false, 'push не включается на этапе 2');
  await page.screenshot({ path: `${output}08-notifications.png` });

  await page.getByRole('link', { name: 'Колоды', exact: true }).click();
  await page.locator('.deck-tile').click();
  await click('Новые 0');
  assert.equal(await page.locator('.card-row').count(), 0, 'после «Не знаю» карточка не новая');
  await click('Все 3');
  await page.locator('.card-question').first().click();
  await fill('Вопрос', '<img src=x onerror=alert(1)>');
  await click('Сохранить карточку');
  assert.equal(await page.locator('#app img').count(), 0);
  await page.getByRole('button', { name: 'Редактировать карточку: <img src=x onerror=alert(1)>', exact: true }).click();
  await click('Удалить карточку');
  await click('Удалить');
  assert.equal(cards.length, 2);

  // Перенос карточки в другую свою колоду и обратно.
  const originalDeck = decks[0].id;
  await page.getByRole('link', { name: 'Колоды', exact: true }).click();
  await click('Новая колода'); await fill('Название', 'Аэродинамика'); await click('Создать колоду');
  const secondDeck = decks.find(d => d.id !== originalDeck).id;
  await page.getByRole('link', { name: 'Колоды', exact: true }).click();
  await page.locator('.deck-tile').filter({ hasText: 'Навигация' }).click();
  const movingCard = cards[0].id;
  await page.locator('.card-question').first().click();
  await page.getByLabel('Колода', { exact: true }).selectOption(secondDeck);
  await click('Сохранить карточку');
  assert.equal(cards.find(c => c.id === movingCard).deck_id, secondDeck);
  await page.locator('.card-question').first().click();
  await page.getByLabel('Колода', { exact: true }).selectOption(originalDeck);
  await click('Сохранить карточку');
  assert.equal(cards.find(c => c.id === movingCard).deck_id, originalDeck);
  await page.getByRole('link', { name: 'Колоды', exact: true }).click();
  await page.locator('.deck-tile').filter({ hasText: 'Аэродинамика' }).click();
  await click('Редактировать колоду'); await click('Удалить колоду'); await click('Удалить');
  assert.equal(decks.length, 1);

  const target = cards[0];
  await page.goto(`${url}?card=${target.id}&src=push`);
  await page.getByRole('heading', { name: target.question, exact: true }).waitFor();
  assert.equal(await page.locator('.answer').count(), 0);
  await page.reload();
  await page.getByRole('heading', { name: target.question, exact: true }).waitFor();

  for (const width of [320, 390, 480, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `overflow at ${width}`);
    const navBox = await page.locator('#navigation').boundingBox();
    assert(navBox.width <= 440);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'Колоды', exact: true }).click();
  await page.locator('.deck-tile').click();
  await click('Редактировать колоду');
  await fill('Название', 'Навигация — обновлено');
  await click('Сохранить');
  assert.equal(decks[0].name, 'Навигация — обновлено');
  await click('Редактировать колоду'); await click('Удалить колоду'); await click('Удалить');
  assert.equal(cards.length, 0); assert.equal(decks.length, 0);
  await page.getByRole('link', { name: 'Настройки', exact: true }).click();
  await click('Выйти');
  await page.getByRole('button', { name: 'Войти', exact: true }).waitFor();
  assert.equal(await page.locator('#navigation:visible').count(), 0);

  await click('Не помню пароль');
  await fill('Почта', 'test@example.com'); await click('Отправить ссылку');
  await page.getByText('Если аккаунт с такой почтой существует', { exact: false }).waitFor();
  // Переход из письма открывает документ заново, а не меняет hash уже открытой формы.
  await page.goto('about:blank');
  await page.goto(`${url}#access_token=${jwt}&refresh_token=test-refresh&expires_in=3600&token_type=bearer&type=recovery`);
  await page.getByRole('heading', { name: 'Новый пароль', exact: true }).waitFor();
  await fill('Пароль', 'new-test-password'); await click('Сохранить пароль');
  await page.getByRole('heading', { name: 'Начнём с вопроса', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Закрыть сообщение', exact: true }).click();

  assert.deepEqual(errors, []);
  console.log('PASS: регистрация, вход, CRUD, перенос карточки, избранное, фильтры, три оценки, RPC-конфликт, ошибка записи, ссылки карточек, настройки, ширины 320–1280, выход и смена пароля.');
  console.log('PASS: manifest, активный service worker и scope, apple-touch-icon, отсутствие кеша и запроса уведомлений, установка только по нажатию.');

  // Проверка iPhone-инструкции и standalone — эмуляция окружения, не физический iPhone.
  const iosContext = await browser.newContext({ viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' });
  await iosContext.route('https://nvirttjdirfzsormbcun.supabase.co/**', route => route.abort());
  const ios = await iosContext.newPage();
  await ios.goto(url);
  await ios.getByRole('button', { name: 'Как установить на iPhone', exact: true }).click();
  await ios.getByText('Нажми «Поделиться»', { exact: false }).waitFor();
  assert.equal(await ios.getByRole('button', { name: 'Установить приложение', exact: true }).count(), 0);
  await ios.evaluate(() => document.fonts.ready);
  await ios.screenshot({ path: `${output}10-iphone-installation.png` });
  await iosContext.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
  await ios.reload();
  await ios.getByRole('button', { name: 'Войти', exact: true }).waitFor();
  assert.equal(await ios.getByRole('button', { name: 'Как установить на iPhone', exact: true }).count(), 0);
  await iosContext.close();
  console.log('PASS: инструкция iPhone и скрытие предложения установки в standalone (эмуляция).');
  console.log('Все запросы Supabase были перехвачены. Реальные пользователи и письма не создавались.');
} catch (error) {
  console.error(error.message);
  console.error('Page:', (await page.locator('body').innerText({ timeout: 3000 })).slice(0, 2000));
  await page.screenshot({ path: `${output}failure.png`, timeout: 5000 });
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}

```
