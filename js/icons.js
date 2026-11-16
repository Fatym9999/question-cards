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
