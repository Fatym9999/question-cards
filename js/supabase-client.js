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
