# Полный собственный код этапа 2

Файлы приведены целиком, без сокращений. Корневая папка: `/Users/roman/Documents/Codex/test/question-cards`.

Готовая сторонняя библиотека Supabase находится целиком в `vendor/supabase-2.119.0.js`; её лицензия — в `vendor/supabase-LICENSE.txt`. Бинарные шрифты, их лицензии и источники — в `assets/fonts/`.

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

## /Users/roman/Documents/Codex/test/question-cards/js/bootstrap.js

```javascript
import { appUrl } from './config.js';

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

## /Users/roman/Documents/Codex/test/question-cards/js/supabase-client.js

```javascript
import { BASE_PATH, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

export const authReturnType = new URLSearchParams(globalThis.location?.hash?.slice(1) ?? '').get('type');
export const authReturnError = new URLSearchParams(globalThis.location?.hash?.slice(1) ?? '').get('error');

export const supabase = globalThis.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
    storageKey: `question-cards-auth:${BASE_PATH}`,
  },
});

```

## /Users/roman/Documents/Codex/test/question-cards/js/api.js

```javascript
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
};

```

## /Users/roman/Documents/Codex/test/question-cards/js/algorithm.js

```javascript
// Чистый модуль: не обращается к браузеру, Supabase или интерфейсу.
// Позже здесь можно заменить алгоритм на FSRS, сохранив контракт результата.
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export function calculateReview(card, rating, now = new Date()) {
  const reviewedAt = new Date(now);
  if (!Number.isFinite(reviewedAt.getTime())) throw new TypeError('Некорректное время ответа');
  for (const key of ['interval_days', 'repetitions', 'lapses', 'hard_count']) {
    if (!Number.isSafeInteger(card[key]) || card[key] < 0) throw new TypeError(`Некорректное поле ${key}`);
  }
  let interval = card.interval_days;
  let repetitions = card.repetitions;
  let lapses = card.lapses;
  let hardCount = card.hard_count;
  let delay;

  switch (rating) {
    case 'again':
      interval = 0;
      repetitions = 0;
      lapses += 1;
      delay = 10 * MINUTE;
      break;
    case 'hard':
      interval = Math.max(1, Math.round(interval * 1.3));
      repetitions += 1;
      hardCount += 1;
      delay = interval * DAY;
      break;
    case 'good':
      interval = interval < 1 ? 3 : Math.round(interval * 2.5);
      repetitions += 1;
      delay = interval * DAY;
      break;
    default:
      throw new TypeError('Неизвестная оценка');
  }

  for (const value of [interval, repetitions, lapses, hardCount]) {
    if (value > 2_147_483_647) throw new RangeError('Значение превышает диапазон базы данных');
  }
  return {
    interval_days: interval,
    due_at: new Date(reviewedAt.getTime() + delay).toISOString(),
    repetitions,
    lapses,
    hard_count: hardCount,
    last_reviewed_at: reviewedAt.toISOString(),
  };
}

```

## /Users/roman/Documents/Codex/test/question-cards/js/study.js

```javascript
export const MODES = Object.freeze({ all: 'Все', new: 'Новые', due: 'К повторению', favorite: 'Избранные' });

export function filterCards(cards, mode = 'all', now = Date.now()) {
  if (!Object.hasOwn(MODES, mode)) throw new TypeError('Неизвестный режим изучения');
  return cards.filter(card => {
    if (mode === 'new') return card.last_reviewed_at === null;
    if (mode === 'due') return Date.parse(card.due_at) <= Number(now);
    if (mode === 'favorite') return card.favorite;
    return true;
  });
}

export function buildQueue(cards, mode = 'due', now = Date.now()) {
  return filterCards(cards, mode, now)
    .sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at) || a.id.localeCompare(b.id))
    .map(card => card.id);
}

export function cardCount(number) {
  const lastTwo = number % 100;
  const last = number % 10;
  const word = lastTwo >= 11 && lastTwo <= 14 ? 'карточек'
    : last === 1 ? 'карточка' : last >= 2 && last <= 4 ? 'карточки' : 'карточек';
  return `${number} ${word}`;
}

export function deckCount(number) {
  const lastTwo = number % 100;
  const last = number % 10;
  const word = lastTwo >= 11 && lastTwo <= 14 ? 'колод'
    : last === 1 ? 'колода' : last >= 2 && last <= 4 ? 'колоды' : 'колод';
  return `${number} ${word}`;
}

```

## /Users/roman/Documents/Codex/test/question-cards/js/icons.js

```javascript
const paths = {
  study: '<rect x="4.5" y="8" width="15" height="11" rx="2.5"/><path d="M8 4.8h8"/>',
  decks: '<rect x="4.5" y="10" width="15" height="9" rx="2.5"/><path d="M7.5 6.5h9M10 3.5h4"/>',
  settings: '<path d="M5 8h9M18 8h1M5 16h1M10 16h9"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/>',
  back: '<path d="M14.5 6l-6 6 6 6"/>',
  right: '<path d="M9.5 6l6 6-6 6"/>',
  down: '<path d="M7 10l5 5 5-5"/>',
  plus: '<path d="M12 6v12M6 12h12"/>',
  minus: '<path d="M6 12h12"/>',
  check: '<path d="M6.5 12l3.5 3.5L17.5 8"/>',
  star: '<path d="M12 4.5l2.3 4.8 5.2.7-3.8 3.6.9 5.2-4.6-2.5-4.6 2.5.9-5.2-3.8-3.6 5.2-.7z"/>',
  bell: '<path d="M6.5 16.5V11a5.5 5.5 0 0111 0v5.5l1.5 1.5H5zM10.5 20.5h3"/>',
  phone: '<rect x="7" y="3.5" width="10" height="17" rx="2.5"/><path d="M11 17.5h2"/>',
  account: '<circle cx="12" cy="9" r="3.2"/><path d="M5.5 19c.8-3.2 3.4-4.8 6.5-4.8s5.7 1.6 6.5 4.8"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
};

export function icon(name, size = 24, filled = false) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? ''}</svg>`;
}

```

## /Users/roman/Documents/Codex/test/question-cards/js/view.js

```javascript
import { routeUrl } from './config.js';
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

export function authView(mode, message = '') {
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

export function settingsView(email) {
  return `<section class="page"><header class="page-heading"><h1>Настройки</h1></header><div class="stack">
    <div class="surface setting-group"><a class="setting-row setting-link" href="${routeUrl({ view: 'notifications' })}" data-route="notifications">${icon('bell', 22)}<span class="setting-text">Уведомления<small>Выключены</small></span><span class="setting-arrow">${icon('right', 18)}</span></a></div>
    <div class="surface setting-group"><button class="setting-row" data-action="installation">${icon('phone', 22)}<span class="setting-text">Установка на телефон<small>На экран «Домой», нужно для пушей на iPhone</small></span><span class="setting-arrow">${icon('right', 18)}</span></button></div>
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

## /Users/roman/Documents/Codex/test/question-cards/js/app.js

```javascript
import { supabase, authReturnType, authReturnError } from './supabase-client.js';
import { api } from './api.js';
import { routeUrl } from './config.js';
import { MODES, buildQueue } from './study.js';
import { icon } from './icons.js';
import {
  authView, decksView, deckView, studyView, settingsView, notificationsView,
  navigation, deckDialog, cardDialog, deleteDialog, dialogHeading, loadingView,
  PRESETS, escapeHTML,
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
    root.innerHTML = authView(state.authMode, state.authMessage);
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
  } else if (view === 'settings') root.innerHTML = settingsView(state.user.email);
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
  if (action === 'installation') {
    openDialog(`${dialogHeading('Установка на телефон')}<p class="dialog-message">Возможность установить приложение на экран «Домой» появится после настройки установки.</p>`);
    return;
  }
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
supabase.auth.onAuthStateChange((event, session) => {
  setTimeout(() => { acceptSession(session, event).catch(() => showNotice('Не удалось восстановить вход. Обнови страницу.', true)); }, 0);
});

render();
const { data, error } = await supabase.auth.getSession();
if (error) showNotice(friendlyError(error), true);
await acceptSession(data.session);
if (authReturnError) showNotice('Ссылка подтверждения устарела или недействительна. Запроси новое письмо.', true);

```

## /Users/roman/Documents/Codex/test/question-cards/scripts/serve.py

```python
#!/usr/bin/env python3
"""Локальный сервер статических файлов. Читает BASE_PATH прямо из js/config.js."""
import argparse
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
match = re.search(r"export const BASE_PATH = ['\"]([^'\"]+)['\"]", (ROOT / 'js/config.js').read_text())
if not match:
    raise SystemExit('Не найдена константа BASE_PATH в js/config.js')
BASE_PATH = match.group(1)
if not BASE_PATH.startswith('/') or not BASE_PATH.endswith('/'):
    raise SystemExit('BASE_PATH должен начинаться и заканчиваться символом /')


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript; charset=utf-8'}

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/' and BASE_PATH != '/':
            self.send_response(302)
            self.send_header('Location', BASE_PATH)
            self.end_headers()
            return
        if not path.startswith(BASE_PATH):
            self.send_error(404)
            return
        self.path = '/' + self.path[len(BASE_PATH):]
        super().do_GET()

    def do_HEAD(self):
        if not urlsplit(self.path).path.startswith(BASE_PATH):
            self.send_error(404)
            return
        self.path = '/' + self.path[len(BASE_PATH):]
        super().do_HEAD()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(ROOT)))
    print(f'Открой http://localhost:{args.port}{BASE_PATH}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

```

## /Users/roman/Documents/Codex/test/question-cards/package.json

```json
{
  "name": "question-cards",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.mjs"
  }
}

```

## /Users/roman/Documents/Codex/test/question-cards/.gitignore

```text
.DS_Store
.env
.env.*
!.env.example
supabase/.temp/
supabase/.branches/
__pycache__/
*.pyc
artifacts/

```

## /Users/roman/Documents/Codex/test/question-cards/.nojekyll

```text

```

## /Users/roman/Documents/Codex/test/question-cards/tests/algorithm.test.mjs

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReview } from '../js/algorithm.js';
import { filterCards, buildQueue, cardCount, deckCount } from '../js/study.js';
import { appUrl, BASE_PATH } from '../js/config.js';
import { escapeHTML, studyView } from '../js/view.js';

const now = new Date('2026-11-16T15:00:00Z');
const card = { id: 'a', interval_days: 4, repetitions: 2, lapses: 1, hard_count: 1 };

test('«Не знаю» — 10 минут, сброс repetitions, рост lapses', () => {
  assert.deepEqual(calculateReview(card, 'again', now), {
    interval_days: 0, due_at: '2026-11-16T15:10:00.000Z', repetitions: 0,
    lapses: 2, hard_count: 1, last_reviewed_at: '2026-11-16T15:00:00.000Z',
  });
  assert.equal(card.interval_days, 4, 'исходная карточка не меняется');
});

test('«Сложно» — округление ×1.3 и минимум один день', () => {
  const hard = calculateReview(card, 'hard', now);
  assert.equal(hard.interval_days, 5);
  assert.equal(hard.due_at, '2026-11-21T15:00:00.000Z');
  assert.equal(hard.repetitions, 3);
  assert.equal(hard.hard_count, 2);
  assert.equal(hard.lapses, 1);
  assert.equal(calculateReview({ ...card, interval_days: 0 }, 'hard', now).interval_days, 1);
});

test('«Знаю» — три дня с нуля или округление ×2.5', () => {
  assert.equal(calculateReview({ ...card, interval_days: 0 }, 'good', now).interval_days, 3);
  const good = calculateReview({ ...card, interval_days: 3 }, 'good', now);
  assert.equal(good.interval_days, 8);
  assert.equal(good.due_at, '2026-11-24T15:00:00.000Z');
  assert.equal(good.repetitions, 3);
  assert.equal(good.lapses, 1);
  assert.equal(good.hard_count, 1);
});

test('повторение в днях — точная длительность, независимо от DST и exam_date', () => {
  const spring = calculateReview({ ...card, interval_days: 0, exam_date: '2026-03-29' }, 'good', '2026-03-28T12:00:00Z');
  assert.equal(spring.due_at, '2026-03-31T12:00:00.000Z');
  assert.deepEqual(spring, calculateReview({ ...card, interval_days: 0 }, 'good', '2026-03-28T12:00:00Z'));
});

test('недопустимые оценки, даты и счётчики отвергаются', () => {
  assert.throws(() => calculateReview(card, 'invalid', now));
  assert.throws(() => calculateReview(card, 'good', 'not-a-date'));
  assert.throws(() => calculateReview({ ...card, lapses: -1 }, 'again', now));
  assert.throws(() => calculateReview({ ...card, interval_days: 2_147_483_647 }, 'good', now));
});

const cards = [
  { id: 'c', due_at: '2026-11-17T00:00:00Z', last_reviewed_at: '2026-11-15T00:00:00Z', repetitions: 0, favorite: true },
  { id: 'b', due_at: '2026-11-16T15:00:00Z', last_reviewed_at: null, favorite: false },
  { id: 'a', due_at: '2026-11-15T00:00:00Z', last_reviewed_at: '2026-11-14T00:00:00Z', favorite: false },
];

test('режимы: новые не включают карточки после «Не знаю»', () => {
  assert.deepEqual(filterCards(cards, 'new', now).map(c => c.id), ['b']);
  assert.deepEqual(filterCards(cards, 'due', now).map(c => c.id), ['b', 'a']);
  assert.deepEqual(filterCards(cards, 'favorite', now).map(c => c.id), ['c']);
  assert.equal(filterCards(cards, 'all', now).length, 3);
  assert.deepEqual(buildQueue(cards, 'due', now), ['a', 'b']);
});

test('ресурсы и ссылки остаются внутри base path', () => {
  assert.equal(new URL(appUrl('css/styles.css', 'https://fatym9999.github.io')).pathname, `${BASE_PATH}css/styles.css`);
  assert.equal(appUrl('', 'https://moonhaze.ru'), `https://moonhaze.ru${BASE_PATH}`);
});

test('контент карточек экранируется, оценки всегда видимы и без интервалов', () => {
  const markup = studyView({ ...card, question: '<img src=x onerror=alert(1)>', answer: '<script>x</script>' }, { name: '<b>Колода</b>' }, 1, 1, false);
  assert(!markup.includes('<img'));
  assert(markup.includes('&lt;img'));
  for (const label of ['Не знаю', 'Сложно', 'Знаю', 'Показать ответ']) assert(markup.includes(label));
  assert(!markup.includes('10 мин'));
  assert.equal(escapeHTML('"<>&'), '&quot;&lt;&gt;&amp;');
});

test('русские формы количества', () => {
  assert.equal(cardCount(1), '1 карточка');
  assert.equal(cardCount(12), '12 карточек');
  assert.equal(cardCount(22), '22 карточки');
  assert.equal(deckCount(3), '3 колоды');
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

## /Users/roman/Documents/Codex/test/question-cards/assets/fonts/fonts.css

```css
@font-face {
  font-family: 'Lora';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url(26bad053b5abef.ttf) format('truetype');
}
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(e67b0c8eafbd46.ttf) format('truetype');
}
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url(00a65a8efb4038.ttf) format('truetype');
}
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url(beeb7fd59d9b2c.ttf) format('truetype');
}

```
