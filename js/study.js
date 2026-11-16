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
