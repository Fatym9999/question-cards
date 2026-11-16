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
