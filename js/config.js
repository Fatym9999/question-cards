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
