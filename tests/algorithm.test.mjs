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
