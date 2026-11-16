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
