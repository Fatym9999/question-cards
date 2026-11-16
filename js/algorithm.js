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
