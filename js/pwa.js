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
