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
let pushRenderPending = false;

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
    if (pushRenderPending) {
      pushRenderPending = false;
      refreshPushView();
    }
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
      if (enabled !== state.settings.enabled) {
        const updated = await api.saveSettings(userId, { enabled });
        if (updated.user_id !== state.user?.id) return;
        state.settings = updated;
      }
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

function refreshPushView() {
  const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (!state.busy && state.ready && !dialog.open && !editing
    && ['settings', 'notifications'].includes(state.route.view)) render();
}

push.subscribe(() => {
  if (state.busy) { pushRenderPending = true; return; }
  refreshPushView();
});

supabase.auth.onAuthStateChange((event, session) => {
  setTimeout(() => { acceptSession(session, event).catch(() => showNotice('Не удалось восстановить вход. Обнови страницу.', true)); }, 0);
});

render();
const { data, error } = await supabase.auth.getSession();
if (error) showNotice(friendlyError(error), true);
await acceptSession(data.session);
if (authReturnError) showNotice('Ссылка подтверждения устарела или недействительна. Запроси новое письмо.', true);
