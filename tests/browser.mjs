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
