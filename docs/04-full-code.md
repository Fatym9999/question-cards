# Полный код этапа 4

Корень: `/Users/roman/Documents/Codex/test/question-cards`.
Все новые и изменённые исходные файлы приведены полностью. Приватные push.env и cron SQL не публикуются; SQL создаётся генератором из секретов.
Порядок настройки: [04-push.md](04-push.md).

## /Users/roman/Documents/Codex/test/question-cards/js/push-config.js

````javascript
// Публичный ключ VAPID. Приватный ключ находится только в Supabase Secrets.
export const VAPID_PUBLIC_KEY = 'BE3i3LwK5LDtuuat8oUKJxpnFvqzRSTkaoGvlrpl5HG7dPLk8DzhGvoNJVyVY0U7AMfaXlQh7HQGhusJcWYDcFw';
export const MIN_PUSH_CARDS = 3;
export const MAX_PUSH_PER_DAY = 50;
````

## /Users/roman/Documents/Codex/test/question-cards/js/push-utils.js

````javascript
export function decodeApplicationKey(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

export function sameApplicationKey(subscription, expected) {
  const stored = subscription.options?.applicationServerKey;
  if (!stored) return false;
  const actual = new Uint8Array(stored);
  return actual.length === expected.length && actual.every((byte, index) => byte === expected[index]);
}

export function supportedPushEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash
      && (['web.push.apple.com', 'fcm.googleapis.com'].includes(url.hostname)
        || /(^|\.)push\.services\.mozilla\.com$/.test(url.hostname)
        || /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname));
  } catch { return false; }
}
````

## /Users/roman/Documents/Codex/test/question-cards/js/push.js

````javascript
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
  const listeners = new Set();
  const changed = () => listeners.forEach(listener => listener());
  const owner = () => { try { return win.localStorage.getItem(ownerKey); } catch { return null; } };
  const setOwner = value => { try { value ? win.localStorage.setItem(ownerKey, value) : win.localStorage.removeItem(ownerKey); } catch { /* Подписку всё равно проверяем через PushManager. */ } };
  const supported = () => Boolean(win.isSecureContext && 'serviceWorker' in win.navigator && 'PushManager' in win && 'Notification' in win);
  const current = (version, userId) => generation === version && context.userId === userId;

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
      try {
        // После уже выданного разрешения восстановление не показывает системный запрос.
        await synchronize(win.Notification.permission === 'granted' && context.enabled, version, userId);
        if (current(version, userId)) lastError = null;
      } catch { if (current(version, userId)) { subscribed = false; lastError = 'restore_failed'; } }
      if (current(version, userId)) changed();
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
      await synchronize(true, version, userId);
      if (!current(version, userId) || !subscribed) throw pushError('subscription_error');
      lastError = null;
      changed();
    },
    async detach(userId = context.userId) {
      const version = ++generation;
      if (!supported()) { setOwner(null); return; }
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
    },
  };
}
````

## /Users/roman/Documents/Codex/test/question-cards/js/api.js

````javascript
import { supabase } from './supabase-client.js';
import { appUrl } from './config.js';
import { calculateReview } from './algorithm.js';

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

async function allRows(table, userId) {
  const rows = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const page = unwrap(await supabase.from(table).select('*').eq('user_id', userId)
      .order('id').range(from, from + pageSize - 1));
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function settingsFor(userId) {
  let settings = unwrap(await supabase.from('notification_settings').select('*').eq('user_id', userId).maybeSingle());
  if (settings) return settings;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const result = await supabase.from('notification_settings').insert({ user_id: userId, timezone }).select().single();
  if (result.error?.code === '23505') {
    return unwrap(await supabase.from('notification_settings').select('*').eq('user_id', userId).single());
  }
  return unwrap(result);
}

export const api = {
  async load(userId) {
    const [decks, cards, settings] = await Promise.all([
      allRows('decks', userId), allRows('cards', userId), settingsFor(userId),
    ]);
    decks.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return { decks, cards, settings };
  },
  async signIn(email, password) {
    return unwrap(await supabase.auth.signInWithPassword({ email, password }));
  },
  async signUp(email, password) {
    return unwrap(await supabase.auth.signUp({ email, password, options: { emailRedirectTo: appUrl() } }));
  },
  async resetPassword(email) {
    return unwrap(await supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl() }));
  },
  async changePassword(password) {
    return unwrap(await supabase.auth.updateUser({ password }));
  },
  async signOut() {
    return unwrap(await supabase.auth.signOut({ scope: 'local' }));
  },
  async saveDeck(userId, id, values) {
    const query = id ? supabase.from('decks').update(values).eq('id', id).eq('user_id', userId)
      : supabase.from('decks').insert(values);
    return unwrap(await query.select().single());
  },
  async deleteDeck(userId, id) {
    return unwrap(await supabase.from('decks').delete().eq('id', id).eq('user_id', userId).select('id').single());
  },
  async saveCard(userId, id, values) {
    const query = id ? supabase.from('cards').update(values).eq('id', id).eq('user_id', userId)
      : supabase.from('cards').insert(values);
    return unwrap(await query.select().single());
  },
  async deleteCard(userId, id) {
    return unwrap(await supabase.from('cards').delete().eq('id', id).eq('user_id', userId).select('id').single());
  },
  async review(card, rating) {
    const result = calculateReview(card, rating);
    const saved = unwrap(await supabase.rpc('record_review', {
      p_card_id: card.id,
      p_expected_revision: card.revision,
      p_rating: rating,
      p_interval_days: result.interval_days,
      p_due_at: result.due_at,
      p_repetitions: result.repetitions,
      p_lapses: result.lapses,
      p_hard_count: result.hard_count,
      p_reviewed_at: result.last_reviewed_at,
    }));
    return Array.isArray(saved) ? saved[0] : saved;
  },
  async saveSettings(userId, values) {
    return unwrap(await supabase.from('notification_settings').update(values)
      .eq('user_id', userId).select().single());
  },
  async saveSubscription(values) {
    return unwrap(await supabase.from('push_subscriptions').upsert(values,
      { onConflict: 'user_id,endpoint' }).select().single());
  },
  async deleteSubscription(userId, endpoint) {
    return unwrap(await supabase.from('push_subscriptions').delete()
      .eq('user_id', userId).eq('endpoint', endpoint));
  },
  async testPush() {
    const result = await supabase.functions.invoke('test-push', { body: {} });
    if (result.error) {
      let code = 'delivery_failed';
      try { code = (await result.error.context.json()).error ?? code; } catch { /* Нет структурированного ответа. */ }
      throw Object.assign(new Error(code), { code });
    }
    return result.data;
  },
};
````

## /Users/roman/Documents/Codex/test/question-cards/js/app.js

````javascript
import { supabase, authReturnType, authReturnError } from './supabase-client.js';
import { api } from './api.js';
import { routeUrl } from './config.js';
import { MODES, buildQueue } from './study.js';
import { icon } from './icons.js';
import { pwa } from './pwa.js';
import { createPushController } from './push.js';
import { MAX_PUSH_PER_DAY } from './push-config.js';
import {
  authView, decksView, deckView, studyView, settingsView, notificationsView,
  navigation, deckDialog, cardDialog, deleteDialog, installationDialog, loadingView,
  PRESETS,
} from './view.js';

const root = document.querySelector('#app');
const nav = document.querySelector('#navigation');
const dialog = document.querySelector('#editor');
const notice = document.querySelector('#notice');
const push = createPushController(api);
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
  if (code === 'push_unsupported' || code === 'unsupported_push_service') return 'Уведомления в этом браузере пока не поддерживаются. Попробуй Safari на iPhone или Chrome на Android.';
  if (code === 'install_first') return 'Сначала установи приложение на экран «Домой» и открой с иконки.';
  if (code === 'not_enough_cards') return 'Сначала добавь хотя бы три карточки.';
  if (code === 'permission_denied') return 'Уведомления не разрешены. Включи их в настройках браузера или телефона.';
  if (code === 'pwa_not_ready' || code === 'subscription_error') return 'Не удалось подключить уведомления. Обнови страницу и попробуй снова.';
  if (code === 'not_configured') return 'Отправка уведомлений ещё не настроена на сервере.';
  if (code === 'no_subscriptions') return 'Подключи уведомления на этом устройстве.';
  if (code === 'no_cards') return 'Сначала добавь карточки.';
  if (code === 'no_enabled_decks') return 'Включи хотя бы одну колоду с карточками для уведомлений.';
  if (code === 'test_rate_limit') return 'Тест можно отправлять не чаще раза в минуту.';
  if (code === 'delivery_failed') return 'Уведомление не отправлено. Проверь подключение устройства и попробуй снова.';
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
  push.setContext(state.user?.id ?? null, state.cards.length, state.settings?.enabled ?? false);
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
  } else if (view === 'settings') root.innerHTML = settingsView(state.user.email, pwa.snapshot(), state.settings);
  else if (view === 'notifications') root.innerHTML = notificationsView(state.settings, state.decks, push.snapshot());
  else {
    if (!state.study) setStudy();
    const card = currentCard();
    root.innerHTML = studyView(card, state.decks.find(item => item.id === card?.deck_id),
      state.study.position + 1, state.study.queue.length, state.study.revealed,
      { hasCards: state.cards.length > 0, enabled: state.settings.enabled });
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
    void push.restore();
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
    const previousUserId = state.user?.id;
    push.setContext(null, 0, false);
    void push.detach(previousUserId).catch(() => {});
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
  if (action === 'count') return saveNotificationValues({ per_day: Math.min(MAX_PUSH_PER_DAY, Math.max(1, state.settings.per_day + Number(button.dataset.delta))) });
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
      try { await push.detach(userId); } catch { /* Выход из аккаунта должен работать и при сбое push-сервиса. */ }
      await api.signOut();
      state.authMode = 'login'; state.authMessage = '';
      await acceptSession(null);
      history.replaceState({}, '', routeUrl());
    } else if (action === 'toggle-push' || action === 'connect-push') {
      const enabled = action === 'connect-push' || !state.settings.enabled;
      if (enabled) await push.enable();
      const updated = await api.saveSettings(userId, { enabled });
      if (updated.user_id !== state.user?.id) return;
      state.settings = updated;
      render();
    } else if (action === 'test-push') {
      await api.testPush();
      showNotice('Тестовое уведомление отправлено. Проверь все подключённые устройства.');
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

push.subscribe(() => {
  const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (!state.busy && state.ready && !dialog.open && !editing
    && ['settings', 'notifications'].includes(state.route.view)) render();
});

supabase.auth.onAuthStateChange((event, session) => {
  setTimeout(() => { acceptSession(session, event).catch(() => showNotice('Не удалось восстановить вход. Обнови страницу.', true)); }, 0);
});

render();
const { data, error } = await supabase.auth.getSession();
if (error) showNotice(friendlyError(error), true);
await acceptSession(data.session);
if (authReturnError) showNotice('Ссылка подтверждения устарела или недействительна. Запроси новое письмо.', true);
````

## /Users/roman/Documents/Codex/test/question-cards/js/view.js

````javascript
import { appUrl, routeUrl } from './config.js';
import { icon } from './icons.js';
import { MODES, filterCards, cardCount, deckCount } from './study.js';
import { MAX_PUSH_PER_DAY } from './push-config.js';

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

export function settingsView(email, installation = {}, notificationSettings = {}) {
  return `<section class="page"><header class="page-heading"><h1>Настройки</h1></header><div class="stack">
    <div class="surface setting-group"><a class="setting-row setting-link" href="${routeUrl({ view: 'notifications' })}" data-route="notifications">${icon('bell', 22)}<span class="setting-text">Уведомления<small>${notificationSettings.enabled ? `Включены, ${notificationSettings.per_day} раз в день` : 'Выключены'}</small></span><span class="setting-arrow">${icon('right', 18)}</span></a></div>
    <div class="surface setting-group"><button class="setting-row" data-action="installation" aria-label="Установка на телефон" aria-describedby="installation-summary">${icon('phone', 22)}<span class="setting-text">Установка на телефон<small id="installation-summary">${installation.standalone ? 'Установлено, открыто как приложение' : 'На экран «Домой», нужно для пушей на iPhone'}</small></span><span class="setting-arrow">${icon('right', 18)}</span></button></div>
    <div class="surface setting-group"><div class="setting-row">${icon('account', 22)}<span class="setting-text">Аккаунт<small>${e(email)}</small></span></div><button class="sign-out" data-action="sign-out">Выйти</button></div>
  </div></section>`;
}

export const PRESETS = Object.freeze({
  normal: { label: 'Обычный', per_day: 5, start_time: '09:00', end_time: '20:00' },
  evening: { label: 'Вечер', per_day: 3, start_time: '18:00', end_time: '22:00' },
  intensive: { label: 'Интенсив', per_day: 10, start_time: '09:00', end_time: '21:00' },
});

export function notificationsView(settings, decks, push = {}) {
  const time = value => e(value?.slice(0, 5) ?? '');
  const preset = Object.entries(PRESETS).find(([, p]) => p.per_day === settings.per_day && p.start_time === settings.start_time.slice(0, 5) && p.end_time === settings.end_time.slice(0, 5))?.[0] ?? 'custom';
  const quiet = settings.quiet_start !== null;
  const canConnect = push.supported && !push.installFirst && push.enoughCards && push.configured;
  let hint = 'Вопросы приходят в выбранное время. Один и тот же вопрос — на все подключённые устройства.';
  if (!push.enoughCards) hint = 'Добавь хотя бы три карточки, чтобы включить вопросы в уведомлениях.';
  else if (push.installFirst) hint = 'На iPhone открой установленное приложение с иконки на экране «Домой».';
  else if (!push.supported) hint = 'В этом браузере уведомления недоступны. Попробуй Chrome или установленное приложение на iPhone.';
  else if (push.permission === 'denied') hint = 'Разреши уведомления в настройках браузера или телефона.';
  else if (settings.enabled && !push.subscribed) hint = 'Уведомления включены, но это устройство ещё не подключено.';
  if (push.error) hint = 'Подписка этого устройства не восстановилась. Нажми «Подключить это устройство».';
  return `<section class="page"><div class="toolbar center-toolbar">${back('settings')}<h1>Уведомления</h1></div><div class="stack notification-stack">
    <div class="surface notification-main">${icon('bell', 22)}<span class="setting-text">Вопросы в уведомлениях<small>${settings.per_day} раз в день, с ${time(settings.start_time)} до ${time(settings.end_time)}</small></span>${switchButton('toggle-push', settings.enabled, 'Вопросы в уведомлениях', !settings.enabled && !canConnect ? 'disabled' : '')}</div>
    <p class="helper notification-help">${hint}</p>
    ${push.installFirst ? action('installation', 'Как установить на iPhone') : ''}
    ${canConnect && settings.enabled && !push.subscribed ? '<button class="secondary" data-action="connect-push">Подключить это устройство</button>' : ''}
    <div class="surface controls-group"><div class="segments presets" aria-label="Режим уведомлений">${[...Object.entries(PRESETS).map(([key, p]) => [key, p.label]), ['custom', 'Свой']].map(([key, label]) => `<button class="segment" data-action="preset" data-preset="${key}" aria-pressed="${preset === key}">${label}</button>`).join('')}</div>
    <div class="control-row"><span>Уведомлений в день</span><span class="stepper"><button class="icon-button" data-action="count" data-delta="-1" aria-label="Меньше" ${settings.per_day <= 1 ? 'disabled' : ''}>${icon('minus', 20)}</button><span class="stepper-output">${settings.per_day}</span><button class="icon-button" data-action="count" data-delta="1" aria-label="Больше" ${settings.per_day >= MAX_PUSH_PER_DAY ? 'disabled' : ''}>${icon('plus', 20)}</button></span></div>
    <label class="control-row" for="start-time">Начало<input id="start-time" name="start_time" class="time-input" type="time" value="${time(settings.start_time)}" required></label>
    <label class="control-row" for="end-time">Конец<input id="end-time" name="end_time" class="time-input" type="time" value="${time(settings.end_time)}" required></label>
    <div class="control-row"><span>Не беспокоить</span>${switchButton('quiet', quiet, 'Не беспокоить')}</div>
    ${quiet ? `<div class="control-row quiet-times"><label for="quiet-start">С<input id="quiet-start" name="quiet_start" class="time-input" type="time" value="${time(settings.quiet_start)}" required></label><label for="quiet-end">До<input id="quiet-end" name="quiet_end" class="time-input" type="time" value="${time(settings.quiet_end)}" required></label></div>` : ''}</div>
    <div class="surface controls-group"><p class="group-label">Колоды для уведомлений</p>${decks.length ? decks.map(deck => `<div class="control-row"><span>${e(deck.name)}</span>${switchButton('deck-push', deck.push_enabled, deck.name, `data-id="${e(deck.id)}"`)}</div>`).join('') : '<p class="empty-note">Сначала создай колоду.</p>'}</div>
    <p class="helper notification-help">Часовой пояс: ${e(settings.timezone)}. Изменения сохраняются автоматически.</p>
    <div class="center-text"><button class="text-button" data-action="test-push" ${push.subscribed && canConnect ? '' : 'disabled'}>Отправить тестовое уведомление</button></div>
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
````

## /Users/roman/Documents/Codex/test/question-cards/scripts/generate-push-secrets.mjs

````javascript
// Секреты сохраняются ВНЕ каталога статического сайта и не выводятся в терминал.
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { BASE_PATH, SUPABASE_URL } from '../js/config.js';

const privateDirectory = fileURLToPath(new URL('../../question-cards-private/', import.meta.url));
const secretFile = `${privateDirectory}push.env`;
await mkdir(privateDirectory, { recursive: true, mode: 0o700 });
await writeFile(`${privateDirectory}.gitignore`, '*\n');
let secrets;
try {
  secrets = await readFile(secretFile, 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const cronSecret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  secrets = `VAPID_PRIVATE_JWK=${JSON.stringify(privateJwk)}\nVAPID_SUBJECT=${new URL(BASE_PATH, 'https://fatym9999.github.io').href}\nCRON_SECRET=${cronSecret}\nAPP_ORIGIN=https://fatym9999.github.io\n`;
  await writeFile(secretFile, secrets, { mode: 0o600, flag: 'wx' });
}
const privateValue = secrets.split('\n').find(line => line.startsWith('VAPID_PRIVATE_JWK=')).slice('VAPID_PRIVATE_JWK='.length);
const privateKey = JSON.parse(privateValue);
const publicKey = Buffer.concat([Buffer.from([4]), Buffer.from(privateKey.x, 'base64url'), Buffer.from(privateKey.y, 'base64url')]).toString('base64url');
await writeFile(new URL('../js/push-config.js', import.meta.url), `// Публичный ключ VAPID. Приватный ключ находится только в Supabase Secrets.\nexport const VAPID_PUBLIC_KEY = '${publicKey}';\nexport const MIN_PUSH_CARDS = 3;\nexport const MAX_PUSH_PER_DAY = 50;\n`);
await chmod(secretFile, 0o600);
const cronSecret = secrets.split('\n').find(line => line.startsWith('CRON_SECRET=')).slice('CRON_SECRET='.length);
const cronSql = `-- ПРИВАТНЫЙ файл: не добавлять в Git и не публиковать. Выполнить после установки Edge Secrets.
begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare secret_id uuid;
begin
  select id into secret_id from vault.secrets where name = 'question_cards_cron_secret';
  if secret_id is null then
    perform vault.create_secret('${cronSecret}', 'question_cards_cron_secret');
  else
    perform vault.update_secret(secret_id, '${cronSecret}');
  end if;
  select id into secret_id from vault.secrets where name = 'question_cards_project_url';
  if secret_id is null then
    perform vault.create_secret('${SUPABASE_URL}', 'question_cards_project_url');
  else
    perform vault.update_secret(secret_id, '${SUPABASE_URL}');
  end if;
end;
$$;

revoke all on table net.http_request_queue from public, anon, authenticated;
revoke all on table net._http_response from public, anon, authenticated;

select cron.schedule('question-cards-plan', '*/5 * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'question_cards_project_url') || '/functions/v1/plan-schedule',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'question_cards_cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$job$);

select cron.schedule('question-cards-send', '* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'question_cards_project_url') || '/functions/v1/send-due-pushes',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'question_cards_cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$job$);
commit;
`;
await writeFile(`${privateDirectory}setup-push-cron.sql`, cronSql, { mode: 0o600 });
console.log('Ключи готовы. Закрытый файл: question-cards-private/push.env. Публичный ключ: js/push-config.js.');
````

## /Users/roman/Documents/Codex/test/question-cards/supabase/config.toml

````toml
project_id = "question-cards"

[functions.plan-schedule]
verify_jwt = false

[functions.send-due-pushes]
verify_jwt = false

[functions.test-push]
# JWT проверяется через Supabase Auth внутри функции.
verify_jwt = false
````

## /Users/roman/Documents/Codex/test/question-cards/supabase/functions/deno.json

````json
{
  "lock": "./deno.lock",
  "compilerOptions": { "lib": ["deno.window", "dom", "esnext"] }
}
````

## /Users/roman/Documents/Codex/test/question-cards/supabase/functions/deno.lock

````json
{
  "version": "5",
  "specifiers": {
    "jsr:@negrel/http-ece@0.7.0": "0.7.0",
    "jsr:@negrel/webpush@0.5.0": "0.5.0",
    "jsr:@std/bytes@1": "1.0.6",
    "jsr:@std/encoding@1": "1.0.11"
  },
  "jsr": {
    "@negrel/http-ece@0.7.0": {
      "integrity": "068e61ba6f52da5454051a283cc19621607f8dd6e74d55c01bb365b8c6644076",
      "dependencies": [
        "jsr:@std/bytes",
        "jsr:@std/encoding"
      ]
    },
    "@negrel/webpush@0.5.0": {
      "integrity": "919ed5bf4d676923667c5278093f36ffb2efe7fe2f155b6d32723ea3b73fa693",
      "dependencies": [
        "jsr:@negrel/http-ece",
        "jsr:@std/bytes",
        "jsr:@std/encoding"
      ]
    },
    "@std/bytes@1.0.6": {
      "integrity": "f6ac6adbd8ccd99314045f5703e23af0a68d7f7e58364b47d2c7f408aeb5820a"
    },
    "@std/encoding@1.0.11": {
      "integrity": "e7cef2f0b3153bccc17431e7c864a1de03a4b6d9647389c43e08aaa775d37385"
    }
  }
}
````

## /Users/roman/Documents/Codex/test/question-cards/supabase/functions/_shared/core.ts

````typescript
import { BASE_PATH } from '../../../js/config.js';

export class HttpError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

export function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(503, 'not_configured');
  return value;
}

function apiKey(kind: 'secret' | 'publishable'): string {
  const dictionary = Deno.env.get(kind === 'secret' ? 'SUPABASE_SECRET_KEYS' : 'SUPABASE_PUBLISHABLE_KEYS');
  const modern = dictionary ? JSON.parse(dictionary).default : null;
  return modern || required(kind === 'secret' ? 'SUPABASE_SERVICE_ROLE_KEY' : 'SUPABASE_ANON_KEY');
}

export function appOrigin(): string {
  return new URL(Deno.env.get('APP_ORIGIN') || 'https://fatym9999.github.io').origin;
}

export function cardUrl(id: string): string {
  const url = new URL(BASE_PATH, appOrigin());
  url.searchParams.set('card', id);
  url.searchParams.set('src', 'push');
  return url.href;
}

export async function admin(path: string, init: RequestInit = {}): Promise<any> {
  const headers = new Headers(init.headers);
  headers.set('apikey', apiKey('secret'));
  headers.set('Content-Type', 'application/json');
  const response = await fetch(`${required('SUPABASE_URL')}/rest/v1/${path}`, {
    ...init, headers, signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new HttpError(502, 'database_error');
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export function rpc(name: string, values: Record<string, unknown> = {}): Promise<any> {
  return admin(`rpc/${name}`, { method: 'POST', body: JSON.stringify(values) });
}

export async function authenticatedUser(request: Request): Promise<string> {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) throw new HttpError(401, 'unauthorized');
  const response = await fetch(`${required('SUPABASE_URL')}/auth/v1/user`, {
    headers: { apikey: apiKey('publishable'), Authorization: authorization },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new HttpError(401, 'unauthorized');
  const user = await response.json();
  if (typeof user.id !== 'string') throw new HttpError(401, 'unauthorized');
  return user.id;
}

export async function authenticateCron(request: Request): Promise<void> {
  const actual = request.headers.get('x-cron-secret') ?? '';
  const expected = required('CRON_SECRET');
  const encode = (text: string) => new TextEncoder().encode(text);
  const [a, b] = await Promise.all([actual, expected].map(value => crypto.subtle.digest('SHA-256', encode(value))));
  const left = new Uint8Array(a), right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  if (difference !== 0) throw new HttpError(401, 'unauthorized');
}

export function handler(callback: (request: Request) => Promise<unknown>, browser = false) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('Origin');
    const allowed = !origin || [appOrigin(), 'http://localhost:8000'].includes(origin);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'Vary': 'Origin',
    };
    if (browser && origin && allowed) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Headers'] = 'authorization, x-client-info, apikey, content-type';
      headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    }
    if (!allowed) return Response.json({ error: 'origin_not_allowed' }, { status: 403, headers });
    if (request.method === 'OPTIONS' && browser) return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405, headers });
    try {
      return Response.json(await callback(request), { headers });
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const code = error instanceof HttpError ? error.code : 'internal_error';
      // В логах нет ключей, endpoint, текста карточки или тела запроса.
      console.error('push_function_error', code);
      return Response.json({ error: code }, { status, headers });
    }
  };
}
````

## /Users/roman/Documents/Codex/test/question-cards/supabase/functions/_shared/push.ts

````typescript
import { ApplicationServer, importVapidKeys, PushMessageError, Urgency } from 'jsr:@negrel/webpush@0.5.0';
import { admin, cardUrl, required } from './core.ts';
import { supportedPushEndpoint } from '../../../js/push-utils.js';

export interface Subscription { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }
export interface Card { id: string; question: string; deck_name: string }

export const allowedEndpoint = supportedPushEndpoint;

// Библиотека использует глобальный Fetch API. Ограничение касается только её
// VAPID-запросов; запросы Supabase/Auth остаются обычными.
const fetchTransport = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  if (headers.get('Authorization')?.startsWith('vapid ')) {
    const endpoint = input instanceof Request ? input.url : String(input);
    if (!allowedEndpoint(endpoint)) return Promise.reject(new Error('unsupported_push_endpoint'));
    return fetchTransport(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(8_000) });
  }
  return fetchTransport(input, init);
};

let serverPromise: Promise<ApplicationServer> | null = null;
function server(): Promise<ApplicationServer> {
  serverPromise ??= (async () => {
    const privateKey = JSON.parse(required('VAPID_PRIVATE_JWK'));
    const publicKey = { kty: privateKey.kty, crv: privateKey.crv, x: privateKey.x, y: privateKey.y, key_ops: ['verify'], ext: true };
    const vapidKeys = await importVapidKeys({ publicKey, privateKey });
    return ApplicationServer.new({ contactInformation: required('VAPID_SUBJECT'), vapidKeys });
  })().catch(error => { serverPromise = null; throw error; });
  return serverPromise;
}

export function pushPayload(card: Card): string {
  const payload = { title: card.deck_name, body: card.question, url: cardUrl(card.id) };
  const bytes = () => new TextEncoder().encode(JSON.stringify(payload)).length;
  // Ограничение Web Push — байты UTF-8, а не число символов. Полный вопрос остаётся в приложении.
  if (bytes() > 3993) {
    payload.title = Array.from(payload.title).slice(0, 120).join('');
    const question = Array.from(payload.body);
    let low = 0, high = question.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      payload.body = question.slice(0, middle).join('') + '…';
      if (bytes() <= 3993) low = middle; else high = middle - 1;
    }
    payload.body = question.slice(0, low).join('') + '…';
  }
  return JSON.stringify(payload);
}

export async function deliver(card: Card, subscriptions: Subscription[], topic: string) {
  const application = await server();
  const message = pushPayload(card);
  let sent = 0, removed = 0;
  // Один payload для всех устройств. Одновременно не более четырёх отправок.
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, subscriptions.length) }, async () => {
    while (next < subscriptions.length) {
      const subscription = subscriptions[next++];
      try {
        if (!allowedEndpoint(subscription.endpoint)) continue;
        const subscriber = application.subscribe({ endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth } });
        await subscriber.pushTextMessage(message, { ttl: 60, urgency: Urgency.High, topic: topic.replace(/-/g, '').slice(0, 32) });
        sent += 1;
      } catch (error) {
        const status = error instanceof PushMessageError ? error.response.status : 0;
        if (status === 404 || status === 410) {
          const filters = new URLSearchParams({ id: `eq.${subscription.id}`, user_id: `eq.${subscription.user_id}`, endpoint: `eq.${subscription.endpoint}` });
          try {
            await admin(`push_subscriptions?${filters}`, { method: 'DELETE' });
            removed += 1;
          } catch { console.error('subscription_cleanup_failed'); }
        } else console.error('push_device_failed', status);
      }
    }
  }));
  return { sent, removed };
}
````

## /Users/roman/Documents/Codex/test/question-cards/supabase/functions/plan-schedule/index.ts

````typescript
import { authenticateCron, handler, rpc } from '../_shared/core.ts';

Deno.serve(handler(async request => {
  await authenticateCron(request);
  const planned = await rpc('plan_push_schedule');
  return { ok: true, planned };
}));
````

## /Users/roman/Documents/Codex/test/question-cards/supabase/functions/send-due-pushes/index.ts

````typescript
import { authenticateCron, handler, rpc } from '../_shared/core.ts';
import { deliver } from '../_shared/push.ts';

Deno.serve(handler(async request => {
  await authenticateCron(request);
  const jobs = await rpc('claim_due_pushes', { p_limit: 20 });
  let completed = 0;
  // По четыре слота, а внутри слота — до четырёх устройств.
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const prepared = await rpc('prepare_due_push', { p_id: job.id, p_claimed_at: job.claimed_at });
      if (!prepared) continue;
      const result = await deliver(prepared.card, prepared.subscriptions, job.id);
      await rpc('finish_push', { p_id: job.id, p_claimed_at: job.claimed_at, p_sent: result.sent > 0 });
      completed += 1;
    }
  }));
  return { ok: true, claimed: jobs.length, completed };
}));
````

## /Users/roman/Documents/Codex/test/question-cards/supabase/functions/test-push/index.ts

````typescript
import { admin, authenticatedUser, handler, HttpError, rpc } from '../_shared/core.ts';
import { deliver } from '../_shared/push.ts';

Deno.serve(handler(async request => {
  const userId = await authenticatedUser(request);
  const cards = await admin(`cards?user_id=eq.${userId}&select=id&limit=1`);
  if (!cards.length) throw new HttpError(409, 'no_cards');
  const subscriptions = await admin(`push_subscriptions?user_id=eq.${userId}&select=*`);
  if (!subscriptions.length) throw new HttpError(409, 'no_subscriptions');
  const card = await rpc('choose_push_card', { p_user_id: userId, p_allow_future: true });
  if (!card) throw new HttpError(409, 'no_enabled_decks');
  if (!await rpc('claim_test_push', { p_user_id: userId })) throw new HttpError(429, 'test_rate_limit');
  const result = await deliver(card, subscriptions, crypto.randomUUID());
  if (result.sent === 0) throw new HttpError(502, 'delivery_failed');
  return { ok: true, ...result };
}, true));
````

## /Users/roman/Documents/Codex/test/question-cards/supabase/migrations/20261116165815_push_notifications.sql

````sql
begin;

alter table public.notification_schedule add column skip_reason text;
alter table public.notification_settings add constraint notification_settings_daily_limit check (per_day <= 50);
grant usage on schema app_private to service_role;

-- Ограничитель тестовых отправок не доступен браузеру.
create table app_private.push_test_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null
);
alter table app_private.push_test_limits enable row level security;
revoke all on app_private.push_test_limits from public, anon, authenticated;
grant select, insert, update, delete on app_private.push_test_limits to service_role;

create function app_private.in_push_window(p_time time, p_start time, p_end time)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select case when p_start < p_end then p_time >= p_start and p_time < p_end
    else p_time >= p_start or p_time < p_end end;
$$;

-- Перебираются реальные UTC-минуты: несуществующие часы DST не создаются,
-- повторяющийся осенний час представлен двумя разными UTC-интервалами.
create function app_private.push_minutes(
  p_date date, p_zone text, p_start time, p_end time,
  p_quiet_start time, p_quiet_end time, p_now timestamptz
)
returns table(fire_at timestamptz) language sql stable security invoker set search_path = '' as $$
  select t from pg_catalog.generate_series(
    (p_date::timestamp at time zone 'UTC') - interval '18 hours',
    (p_date::timestamp at time zone 'UTC') + interval '42 hours', interval '1 minute'
  ) t
  where (t at time zone p_zone)::date = p_date
    and t >= date_trunc('minute', p_now) + interval '1 minute'
    and app_private.in_push_window((t at time zone p_zone)::time, p_start, p_end)
    and (p_quiet_start is null or not app_private.in_push_window(
      (t at time zone p_zone)::time, p_quiet_start, p_quiet_end));
$$;

create function app_private.reset_pending_push_schedule()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and new.user_id <> auth.uid() then
    raise exception 'Нет доступа к настройкам' using errcode = '42501';
  end if;
  if new.enabled is distinct from old.enabled or new.per_day is distinct from old.per_day
    or new.start_time is distinct from old.start_time or new.end_time is distinct from old.end_time
    or new.quiet_start is distinct from old.quiet_start or new.quiet_end is distinct from old.quiet_end
    or new.timezone is distinct from old.timezone then
    delete from public.notification_schedule where user_id = new.user_id
      and (status = 'pending' or (status = 'skipped' and skip_reason = 'no_window'));
  end if;
  return new;
end;
$$;
create trigger reset_pending_push_schedule after update on public.notification_settings
  for each row execute function app_private.reset_pending_push_schedule();

create function public.plan_push_schedule(p_user_id uuid default null, p_now timestamptz default now())
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  settings public.notification_settings%rowtype;
  plan_day date; day_offset integer; existing integer; last_slot integer;
  budget integer; moments timestamptz[]; i integer; inserted integer; total integer := 0;
begin
  for settings in select s.* from public.notification_settings s
    where s.enabled and (p_user_id is null or s.user_id = p_user_id)
      and exists (select 1 from public.push_subscriptions ps where ps.user_id = s.user_id)
    order by s.user_id for update of s skip locked
  loop
    for day_offset in 0..1 loop
      plan_day := (p_now at time zone settings.timezone)::date + day_offset;
      select count(*), coalesce(max(slot), 0) into existing, last_slot
        from public.notification_schedule where user_id = settings.user_id and plan_date = plan_day;
      budget := greatest(0, settings.per_day - existing);
      if budget = 0 then continue; end if;
      select coalesce(array_agg(p.fire_at order by p.fire_at), array[]::timestamptz[]) into moments
      from (
        select m.fire_at from app_private.push_minutes(plan_day, settings.timezone,
          settings.start_time, settings.end_time, settings.quiet_start, settings.quiet_end, p_now) m
        where not exists (select 1 from public.notification_schedule n
          where n.user_id = settings.user_id and n.plan_date = plan_day and n.fire_at = m.fire_at)
        order by random() limit budget
      ) p;
      for i in 1..budget loop
        insert into public.notification_schedule(user_id, plan_date, slot, fire_at, status, skip_reason)
        values (settings.user_id, plan_day, last_slot + i,
          coalesce(moments[i], plan_day::timestamp at time zone settings.timezone),
          case when moments[i] is null then 'skipped' else 'pending' end,
          case when moments[i] is null then 'no_window' else null end)
        on conflict (user_id, plan_date, slot) do nothing;
        get diagnostics inserted = row_count;
        total := total + inserted;
      end loop;
    end loop;
  end loop;
  return total;
end;
$$;

create function public.claim_due_pushes(p_limit integer default 20, p_now timestamptz default now())
returns setof public.notification_schedule language plpgsql security invoker set search_path = '' as $$
begin
  -- Не повторяем неизвестный результат отправки после падения процесса.
  update public.notification_schedule set status = 'skipped', skip_reason = 'stale_processing'
    where status = 'processing' and claimed_at < p_now - interval '10 minutes';
  return query
    with candidates as (
      select id from public.notification_schedule
      where status = 'pending' and fire_at <= p_now
      order by fire_at, id limit greatest(1, least(p_limit, 50))
      for update skip locked
    )
    update public.notification_schedule n set status = 'processing', claimed_at = p_now
      from candidates c where n.id = c.id returning n.*;
end;
$$;

create function public.choose_push_card(p_user_id uuid, p_allow_future boolean default false, p_now timestamptz default now())
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select jsonb_build_object('id', c.id, 'question', c.question, 'deck_name', d.name)
  from public.cards c join public.decks d on d.id = c.deck_id and d.user_id = c.user_id
  where c.user_id = p_user_id and d.push_enabled and (p_allow_future or c.due_at <= p_now)
  order by ((greatest(0, extract(epoch from (p_now - c.due_at)) / 86400) * 10
    + c.lapses * 4 + c.hard_count * 2) * (0.8 + random() * 0.4)) desc, c.due_at, c.id
  limit 1;
$$;

create function public.prepare_due_push(p_id uuid, p_claimed_at timestamptz, p_now timestamptz default now())
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  job public.notification_schedule%rowtype;
  settings public.notification_settings%rowtype;
  local_time time; reason text; card jsonb; subscriptions jsonb;
begin
  select * into job from public.notification_schedule
    where id = p_id and status = 'processing' and claimed_at = p_claimed_at for update;
  if not found then return null; end if;
  select * into settings from public.notification_settings where user_id = job.user_id;
  local_time := (p_now at time zone settings.timezone)::time;
  if settings.user_id is null or not settings.enabled then reason := 'disabled';
  elsif job.fire_at < p_now - interval '5 minutes' then reason := 'late';
  elsif (p_now at time zone settings.timezone)::date <> job.plan_date then reason := 'wrong_day';
  elsif not app_private.in_push_window(local_time, settings.start_time, settings.end_time)
    or (settings.quiet_start is not null and app_private.in_push_window(local_time, settings.quiet_start, settings.quiet_end))
    then reason := 'outside_window';
  end if;
  if reason is null then
    card := public.choose_push_card(job.user_id, false, p_now);
    if card is null then reason := 'no_cards'; end if;
  end if;
  if reason is null then
    select jsonb_agg(to_jsonb(p)) into subscriptions from public.push_subscriptions p where p.user_id = job.user_id;
    if subscriptions is null then reason := 'no_subscriptions'; end if;
  end if;
  if reason is not null then
    update public.notification_schedule set status = 'skipped', skip_reason = reason where id = job.id;
    return null;
  end if;
  return jsonb_build_object('card', card, 'subscriptions', subscriptions);
end;
$$;

create function public.finish_push(p_id uuid, p_claimed_at timestamptz, p_sent boolean)
returns void language sql security invoker set search_path = '' as $$
  update public.notification_schedule set status = case when p_sent then 'sent' else 'skipped' end,
    sent_at = case when p_sent then now() else null end,
    skip_reason = case when p_sent then null else 'delivery_failed' end
  where id = p_id and status = 'processing' and claimed_at = p_claimed_at;
$$;

create function public.claim_test_push(p_user_id uuid)
returns boolean language sql security invoker set search_path = '' as $$
  with claimed as (
    insert into app_private.push_test_limits(user_id, requested_at) values (p_user_id, now())
    on conflict (user_id) do update set requested_at = excluded.requested_at
      where push_test_limits.requested_at < now() - interval '1 minute'
    returning user_id
  ) select exists(select 1 from claimed);
$$;

-- Закрываем прямой вызов вспомогательной функции автоматического RLS из панели.
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end; $$;

revoke all on function app_private.in_push_window(time, time, time),
  app_private.push_minutes(date, text, time, time, time, time, timestamptz),
  app_private.reset_pending_push_schedule() from public, anon, authenticated;
grant execute on function app_private.in_push_window(time, time, time),
  app_private.push_minutes(date, text, time, time, time, time, timestamptz) to service_role;

revoke all on function public.plan_push_schedule(uuid, timestamptz),
  public.claim_due_pushes(integer, timestamptz), public.choose_push_card(uuid, boolean, timestamptz),
  public.prepare_due_push(uuid, timestamptz, timestamptz), public.finish_push(uuid, timestamptz, boolean),
  public.claim_test_push(uuid) from public, anon, authenticated;
grant execute on function public.plan_push_schedule(uuid, timestamptz),
  public.claim_due_pushes(integer, timestamptz), public.choose_push_card(uuid, boolean, timestamptz),
  public.prepare_due_push(uuid, timestamptz, timestamptz), public.finish_push(uuid, timestamptz, boolean),
  public.claim_test_push(uuid) to service_role;

commit;
````

## /Users/roman/Documents/Codex/test/question-cards/supabase/tests/003_push_schedule.sql

````sql
-- Выполнить целиком после миграции push. В конце все тестовые данные откатываются.
begin;
select set_config('test.push_user', gen_random_uuid()::text, true);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
insert into auth.users(id, email) values (current_setting('test.push_user')::uuid,
  current_setting('test.push_user') || '@example.invalid');
insert into public.decks(user_id, name) values (current_setting('test.push_user')::uuid, 'Тест push');
insert into public.cards(user_id, deck_id, question, answer, due_at, lapses)
  select d.user_id, d.id, 'Тестовый вопрос ' || i, 'Ответ', '2026-11-15 00:00+00', i
  from public.decks d cross join generate_series(1, 3) i where d.user_id = current_setting('test.push_user')::uuid;
insert into public.notification_settings(user_id, enabled, timezone)
  values (current_setting('test.push_user')::uuid, true, 'Europe/Moscow');
insert into public.push_subscriptions(user_id, endpoint, p256dh, auth)
  values (current_setting('test.push_user')::uuid, 'https://fcm.googleapis.com/fcm/send/only-a-test', 'test-key', 'test-auth');

do $$ begin
  if (select count(*) from app_private.push_minutes('2026-03-08', 'America/New_York',
      '01:00', '04:00', null, null, '2026-03-07 00:00+00')) <> 120 then
    raise exception 'FAIL: весенний DST должен исключить несуществующий час';
  end if;
  if (select count(*) from app_private.push_minutes('2026-11-01', 'America/New_York',
      '01:00', '02:00', null, null, '2026-10-31 00:00+00')) <> 120 then
    raise exception 'FAIL: осенний повторяющийся час имеет два UTC-интервала';
  end if;
  if (select count(*) from app_private.push_minutes('2026-11-16', 'Europe/Moscow',
      '09:00', '20:00', '12:00', '14:00', '2026-11-15 00:00+00')) <> 540 then
    raise exception 'FAIL: не исключён режим тишины';
  end if;
  if (select count(*) from app_private.push_minutes('2026-11-16', 'Europe/Moscow',
      '22:00', '08:00', '23:00', '07:00', '2026-11-15 00:00+00')) <> 120 then
    raise exception 'FAIL: окно или тишина через полночь';
  end if;
end; $$;

set local role service_role;
do $$
declare
  uid uuid := current_setting('test.push_user')::uuid;
  count_inserted integer; first_job public.notification_schedule%rowtype;
  second_job public.notification_schedule%rowtype; prepared jsonb;
begin
  count_inserted := public.plan_push_schedule(uid, '2026-11-16 00:00+00');
  if count_inserted <> 10 then raise exception 'FAIL: должны планироваться сегодня и завтра'; end if;
  if public.plan_push_schedule(uid, '2026-11-16 00:00+00') <> 0 then
    raise exception 'FAIL: повторное планирование не идемпотентно';
  end if;
  if (select count(*) from public.notification_schedule where user_id = uid) <> 10 then
    raise exception 'FAIL: дубли расписания';
  end if;
  if exists (select 1 from public.notification_schedule n where n.user_id = uid
      and ((n.fire_at at time zone 'Europe/Moscow')::date <> n.plan_date
      or not app_private.in_push_window((n.fire_at at time zone 'Europe/Moscow')::time, '09:00', '20:00'))) then
    raise exception 'FAIL: неверная локальная дата или окно';
  end if;
  if exists (select 1 from public.notification_schedule where user_id = uid
      group by plan_date, fire_at having count(*) > 1) then
    raise exception 'FAIL: для одного пользователя выбрана одинаковая минута';
  end if;

  select * into first_job from public.notification_schedule where user_id = uid order by fire_at limit 1;
  select * into first_job from public.claim_due_pushes(1, first_job.fire_at);
  if first_job.id is null or first_job.status <> 'processing' then raise exception 'FAIL: claim'; end if;
  select * into second_job from public.claim_due_pushes(1, first_job.fire_at);
  if second_job.id = first_job.id then raise exception 'FAIL: processing взят повторно'; end if;
  prepared := public.prepare_due_push(first_job.id, first_job.claimed_at, first_job.fire_at);
  if prepared->'card'->>'id' is null or jsonb_array_length(prepared->'subscriptions') <> 1 then
    raise exception 'FAIL: выбор карточки и всех устройств';
  end if;
  perform public.finish_push(first_job.id, first_job.claimed_at, true);
  if not exists (select 1 from public.notification_schedule where id = first_job.id
      and status = 'sent' and sent_at is not null) then raise exception 'FAIL: статус sent'; end if;

  -- Настройки перестраивают только будущие/непопытавшиеся слоты, сохраняя уже отправленные.
  update public.notification_settings set quiet_start = '12:00', quiet_end = '14:00' where user_id = uid;
  perform public.plan_push_schedule(uid, '2026-11-16 00:00+00');
  if (select count(*) from public.notification_schedule where user_id = uid and plan_date = '2026-11-16') <> 5 then
    raise exception 'FAIL: дневной бюджет после изменения настроек';
  end if;
  if not exists (select 1 from public.notification_schedule where id = first_job.id and status = 'sent') then
    raise exception 'FAIL: отправленный слот удалён при перестроении';
  end if;
  if exists (select 1 from public.notification_schedule where user_id = uid and status = 'pending'
    and app_private.in_push_window((fire_at at time zone 'Europe/Moscow')::time, '12:00', '14:00')) then
    raise exception 'FAIL: новый план попал в тишину';
  end if;

  -- Зависший processing закрывается, повторного claim нет.
  update public.notification_schedule set status = 'processing', claimed_at = '2026-11-16 00:00+00'
    where user_id = uid and status = 'pending';
  perform public.claim_due_pushes(1, '2026-11-16 00:11+00');
  if exists (select 1 from public.notification_schedule where user_id = uid and status = 'processing'
      and claimed_at = '2026-11-16 00:00+00') then raise exception 'FAIL: зависшие строки не закрыты'; end if;
  if not exists (select 1 from public.notification_schedule where user_id = uid and skip_reason = 'stale_processing') then
    raise exception 'FAIL: отсутствует причина закрытия processing';
  end if;
  if not public.claim_test_push(uid) or public.claim_test_push(uid) then
    raise exception 'FAIL: ограничение тестового push';
  end if;
end; $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.push_user'), true);
do $$ begin
  begin
    perform public.claim_due_pushes();
    raise exception 'FAIL: клиенту доступен захват расписания';
  exception when insufficient_privilege then null; end;
  begin
    perform public.plan_push_schedule();
    raise exception 'FAIL: клиенту доступно планирование';
  exception when insufficient_privilege then null; end;
  begin
    perform public.claim_test_push(auth.uid());
    raise exception 'FAIL: клиент обходит ограничитель теста';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from app_private.push_test_limits;
    raise exception 'FAIL: приватный ограничитель доступен клиенту';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
select 'OK: DST, тихое окно, локальная дата, идемпотентность, claim, sent, stale и права проверены' as result;
rollback;
````

## /Users/roman/Documents/Codex/test/question-cards/supabase/functions/push_test.ts

````typescript
// Проверка настоящего шифрования библиотеки. Сетевые запросы заменены тестовым fetch.
const calls: { url: string; init: RequestInit }[] = [];
let dead = false;
globalThis.fetch = (input, init = {}) => {
  const url = input instanceof Request ? input.url : String(input);
  calls.push({ url, init });
  if (url.startsWith('https://database.example/')) return Promise.resolve(new Response(null, { status: 204 }));
  return Promise.resolve(new Response(null, { status: dead && url.includes('dead') ? 410 : 201 }));
};
const vapid = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
Deno.env.set('VAPID_PRIVATE_JWK', JSON.stringify(await crypto.subtle.exportKey('jwk', vapid.privateKey)));
Deno.env.set('VAPID_SUBJECT', 'https://example.com');
Deno.env.set('APP_ORIGIN', 'https://example.com');
Deno.env.set('SUPABASE_URL', 'https://database.example');
Deno.env.set('SUPABASE_SECRET_KEYS', JSON.stringify({ default: 'test-secret' }));

const { deliver, pushPayload } = await import('./_shared/push.ts');
const { handler, authenticatedUser } = await import('./_shared/core.ts');
const { decodeApplicationKey } = await import('../../js/push-utils.js');
function assert(value: unknown, message = 'assertion failed'): asserts value { if (!value) throw new Error(message); }
const encode = (value: Uint8Array) => btoa(String.fromCharCode(...value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
const auth = crypto.getRandomValues(new Uint8Array(16));
const card = { id: '22222222-2222-4222-8222-222222222222', question: 'Что такое угол сноса?', deck_name: 'Навигация' };
const subscription = { id: '33333333-3333-4333-8333-333333333333', user_id: 'user-a',
  endpoint: 'https://fcm.googleapis.com/fcm/send/test', p256dh: encode(uaPublic), auth: encode(auth) };

async function hkdf(key: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number) {
  const material = await crypto.subtle.importKey('raw', new Uint8Array(key), 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(salt), info: new Uint8Array(info) }, material, length * 8));
}
function concat(...parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length; } return result;
}

Deno.test('VAPID проверяется, payload расшифровывается как RFC 8291', async () => {
  const result = await deliver(card, [subscription], 'test-topic');
  assert(result.sent === 1);
  const sent = calls.find(call => call.url === subscription.endpoint)!;
  const headers = new Headers(sent.init.headers);
  assert(headers.get('Content-Encoding') === 'aes128gcm');
  assert(headers.get('TTL') === '60');
  assert(sent.init.redirect === 'error');
  const authorization = headers.get('Authorization')!;
  const token = authorization.match(/t=([^,]+)/)![1];
  const [head, body, signature] = token.split('.');
  const claims = JSON.parse(new TextDecoder().decode(decodeApplicationKey(body)));
  assert(claims.aud === new URL(subscription.endpoint).origin);
  assert(claims.sub === 'https://example.com');
  assert(claims.exp * 1000 > Date.now() && claims.exp * 1000 < Date.now() + 24 * 3600_000);
  assert(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vapid.publicKey,
    decodeApplicationKey(signature), new TextEncoder().encode(`${head}.${body}`)));

  const encrypted = new Uint8Array(sent.init.body as ArrayBuffer);
  const salt = encrypted.slice(0, 16);
  const keyLength = encrypted[20];
  assert(keyLength === 65);
  const serverRaw = encrypted.slice(21, 21 + keyLength);
  const serverPublic = await crypto.subtle.importKey('raw', serverRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: serverPublic }, ua.privateKey, 256));
  const utf8 = new TextEncoder();
  const ikm = await hkdf(secret, auth, concat(utf8.encode('WebPush: info\0'), uaPublic, serverRaw), 32);
  const cek = await hkdf(ikm, salt, utf8.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(ikm, salt, utf8.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, encrypted.slice(21 + keyLength)));
  assert(plaintext.at(-1) === 2);
  const payload = JSON.parse(new TextDecoder().decode(plaintext.slice(0, -1)));
  assert(payload.title === card.deck_name && payload.body === card.question);
  assert(payload.url === `https://example.com/question-cards/?card=${card.id}&src=push`);
});

Deno.test('длинный кириллический вопрос укладывается в предел UTF-8 Web Push', () => {
  const payload = pushPayload({ ...card, question: 'Я🙂'.repeat(5000), deck_name: 'Колода'.repeat(500) });
  assert(new TextEncoder().encode(payload).length <= 3993);
  assert(JSON.parse(payload).body.endsWith('…'));
});

Deno.test('410 удаляет только конкретную подписку, успех другого устройства сохраняется', async () => {
  dead = true;
  const result = await deliver(card, [{ ...subscription, endpoint: subscription.endpoint + '-dead' }, subscription], 'next-topic');
  assert(result.sent === 1 && result.removed === 1);
  const deleted = calls.filter(call => call.init.method === 'DELETE').at(-1)!;
  const url = new URL(deleted.url);
  assert(url.searchParams.get('user_id') === 'eq.user-a');
  assert(url.searchParams.get('endpoint') === `eq.${subscription.endpoint}-dead`);
});

Deno.test('endpoint другого домена не получает ни запрос, ни VAPID', async () => {
  const before = calls.length;
  const result = await deliver(card, [{ ...subscription, endpoint: 'https://127.0.0.1/private' }], 'blocked');
  assert(result.sent === 0 && calls.length === before);
});

Deno.test('test-push требует JWT, CORS не открывает произвольный origin', async () => {
  const endpoint = handler(async request => ({ user: await authenticatedUser(request) }), true);
  const unauthorized = await endpoint(new Request('https://example.com', { method: 'POST' }));
  assert(unauthorized.status === 401);
  const cors = await endpoint(new Request('https://example.com', { method: 'OPTIONS', headers: { Origin: 'https://example.com' } }));
  assert(cors.status === 204 && cors.headers.get('Access-Control-Allow-Origin') === 'https://example.com');
  const blocked = await endpoint(new Request('https://example.com', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }));
  assert(blocked.status === 403);
});
````

## /Users/roman/Documents/Codex/test/question-cards/tests/push.test.mjs

````javascript
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
````

## /Users/roman/Documents/Codex/test/question-cards/tests/browser.mjs

````javascript
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
  Object.defineProperty(Notification, 'permission', { get: () => localStorage.getItem('test-push-permission') || 'default' });
  Notification.requestPermission = async () => {
    window.__notificationRequests += 1;
    localStorage.setItem('test-push-permission', 'granted');
    return 'granted';
  };
  const fromStored = () => {
    const stored = JSON.parse(localStorage.getItem('test-push-subscription') || 'null');
    return stored ? {
      endpoint: stored.endpoint, options: { applicationServerKey: new Uint8Array(stored.key).buffer },
      toJSON: () => ({ endpoint: stored.endpoint, keys: { p256dh: 'test-key', auth: 'test-auth' } }),
      unsubscribe: async () => { localStorage.removeItem('test-push-subscription'); return true; },
    } : null;
  };
  PushManager.prototype.getSubscription = async () => fromStored();
  PushManager.prototype.subscribe = async options => {
    localStorage.setItem('test-push-subscription', JSON.stringify({
      endpoint: 'https://fcm.googleapis.com/fcm/send/browser-test', key: Array.from(options.applicationServerKey),
    }));
    return fromStored();
  };
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
let subscriptions = [];
let testPushCalls = 0;
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
  if (url.pathname.endsWith('/functions/v1/test-push')) { testPushCalls += 1; return json({ ok: true, sent: 1, removed: 0 }); }
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
  if (table === 'push_subscriptions') {
    if (method === 'POST') {
      const existing = subscriptions.find(row => row.user_id === body.user_id && row.endpoint === body.endpoint);
      if (existing) Object.assign(existing, body);
      else subscriptions.push({ id: randomUUID(), ...body });
      return json(single ? subscriptions.at(-1) : subscriptions);
    }
    if (method === 'DELETE') {
      const endpoint = url.searchParams.get('endpoint')?.replace(/^eq\./, '');
      subscriptions = subscriptions.filter(row => row.endpoint !== endpoint);
      return route.fulfill({ status: 204 });
    }
    return json(subscriptions);
  }
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
  assert.equal(settings.enabled, false, 'изменение времени и колод само не включает push');
  await page.getByRole('switch', { name: 'Навигация', exact: true }).click(); await idle();
  await page.getByRole('switch', { name: 'Вопросы в уведомлениях', exact: true }).click(); await idle();
  assert.equal(settings.enabled, true);
  assert.equal(subscriptions.length, 1);
  assert.equal(await page.evaluate(() => window.__notificationRequests), 1);
  await click('Отправить тестовое уведомление');
  assert.equal(testPushCalls, 1);
  await click('Закрыть сообщение');
  await page.screenshot({ path: `${output}11-push-enabled.png` });
  await page.getByRole('switch', { name: 'Вопросы в уведомлениях', exact: true }).click(); await idle();
  assert.equal(settings.enabled, false);
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
  assert.equal(subscriptions.length, 0, 'выход отвязывает устройство');

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
````

## /Users/roman/Documents/Codex/test/question-cards/README.md

````markdown
# Карточки

Статичное приложение для карточек с интервальным повторением.
HTML + CSS + JavaScript ES-модули, без сборки. Бэкенд — Supabase.

Этап 1 (база, RLS, RPC) проверен в Supabase.
Этап 2 (интерфейс и повторение) реализован и проверен пользователем в браузере.
Этап 3 (PWA) проверен пользователем на iPhone.
Этап 4 (push) реализован: миграция применена, три Edge Functions развёрнуты.
Осталось подключить secrets/cron, опубликовать интерфейс и проверить реальный push.

## Запуск

```sh
python3 /Users/roman/Documents/Codex/test/question-cards/scripts/serve.py
```

Открой <http://localhost:8000/question-cards/>.
Сборка и npm install не нужны. Сервер Python используется только для локального просмотра.

## Инструкции

- [Этап 1: Supabase](docs/01-supabase.md)
- [Этап 2: запуск, проверка, GitHub Pages](docs/02-frontend.md)
- [Полный собственный код этапа 2](docs/02-full-code.md)
- [Этап 3: установка PWA](docs/03-pwa.md)
- [Полный собственный код этапа 3](docs/03-full-code.md)
- [Этап 4: ключи, cron и первый push](docs/04-push.md)
- [Полный собственный код этапа 4](docs/04-full-code.md)
- [Исходные экраны](references/screens.html)
- [Правила дизайна](references/design-spec.md)

Единственная константа пути — BASE_PATH в js/config.js.
Project URL и предоставленный публичный publishable key сохранены там же.
Серверных ключей и паролей в проекте нет.
План переноса на moonhaze.ru — в инструкции этапа 1.

## Поведение

- «Учить» — карточки с наступившим сроком из всех колод.
- В колоде доступны «Все», «Новые», «К повторению», «Избранные».
- Ответ раскрывается сразу под вопросом; оценки доступны до раскрытия.
- После успешной записи оценки открывается следующий вопрос без промежуточного экрана.
- При ошибке связи карточка остаётся на экране.
- Алгоритм — отдельный чистый модуль js/algorithm.js.
- RPC обновляет карточку и журнал одной транзакцией; revision защищает от старого состояния.
- Новые определяются по отсутствию last_reviewed_at, а не по repetitions.
- Данные карточек не кешируются на устройстве; Auth хранит сессию SDK в localStorage.
- Только светлая тема. Lora, Manrope и SDK сохранены локально с лицензиями.
- Уведомления подключаются явным нажатием после создания трёх карточек.
- Вопрос выбирается при отправке, один payload идёт на все подписки пользователя.
- Расписание учитывает локальное окно, тихие часы и DST; серверные задачи защищены секретом.
- PWA устанавливается в отдельное окно. На iPhone есть инструкция Safari и определение standalone.
- Worker работает без офлайн-кеша; push открывает точную карточку в существующем или новом окне.

## Проверка

```sh
node --test tests/*.test.mjs
```

27 тестов алгоритма, режимов, путей, иконок, установки, service worker и подписок.
Ещё 5 Deno-тестов проверяют шифрование и транспорт Web Push; команды — в этапе 4.
Для tests/browser.mjs нужны Playwright и Chrome. Все запросы Supabase там перехватываются:
реальные аккаунты, письма и карточки не создаются.
Проверены CRUD, перенос, избранное, оценки, ошибки и конфликты,
ссылки карточек, восстановление сессии и пароля, настройки и размеры 320–1280 px.

Для проверки реальной базы пройди шаги инструкции этапа 2.
````
