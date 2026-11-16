import { BASE_PATH } from '../../../js/config.js';

export class HttpError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

export function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(503, 'not_configured');
  return value;
}

function apiKey(kind: 'secret' | 'publishable'): string {
  const dictionary = Deno.env.get(kind === 'secret' ? 'SUPABASE_SECRET_KEYS' : 'SUPABASE_PUBLISHABLE_KEYS');
  const modern = dictionary ? JSON.parse(dictionary).default : null;
  return modern || required(kind === 'secret' ? 'SUPABASE_SERVICE_ROLE_KEY' : 'SUPABASE_ANON_KEY');
}

export function appOrigin(): string {
  return new URL(Deno.env.get('APP_ORIGIN') || 'https://fatym9999.github.io').origin;
}

export function cardUrl(id: string): string {
  const url = new URL(BASE_PATH, appOrigin());
  url.searchParams.set('card', id);
  url.searchParams.set('src', 'push');
  return url.href;
}

export async function admin(path: string, init: RequestInit = {}): Promise<any> {
  const headers = new Headers(init.headers);
  headers.set('apikey', apiKey('secret'));
  headers.set('Content-Type', 'application/json');
  const response = await fetch(`${required('SUPABASE_URL')}/rest/v1/${path}`, {
    ...init, headers, signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new HttpError(502, 'database_error');
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export function rpc(name: string, values: Record<string, unknown> = {}): Promise<any> {
  return admin(`rpc/${name}`, { method: 'POST', body: JSON.stringify(values) });
}

export async function authenticatedUser(request: Request): Promise<string> {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) throw new HttpError(401, 'unauthorized');
  const response = await fetch(`${required('SUPABASE_URL')}/auth/v1/user`, {
    headers: { apikey: apiKey('publishable'), Authorization: authorization },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new HttpError(401, 'unauthorized');
  const user = await response.json();
  if (typeof user.id !== 'string') throw new HttpError(401, 'unauthorized');
  return user.id;
}

export async function authenticateCron(request: Request): Promise<void> {
  const actual = request.headers.get('x-cron-secret') ?? '';
  const expected = required('CRON_SECRET');
  const encode = (text: string) => new TextEncoder().encode(text);
  const [a, b] = await Promise.all([actual, expected].map(value => crypto.subtle.digest('SHA-256', encode(value))));
  const left = new Uint8Array(a), right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  if (difference !== 0) throw new HttpError(401, 'unauthorized');
}

export function handler(callback: (request: Request) => Promise<unknown>, browser = false) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('Origin');
    const allowed = !origin || [appOrigin(), 'http://localhost:8000'].includes(origin);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'Vary': 'Origin',
    };
    if (browser && origin && allowed) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Headers'] = 'authorization, x-client-info, apikey, content-type';
      headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    }
    if (!allowed) return Response.json({ error: 'origin_not_allowed' }, { status: 403, headers });
    if (request.method === 'OPTIONS' && browser) return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405, headers });
    try {
      return Response.json(await callback(request), { headers });
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const code = error instanceof HttpError ? error.code : 'internal_error';
      // В логах нет ключей, endpoint, текста карточки или тела запроса.
      console.error('push_function_error', code);
      return Response.json({ error: code }, { status, headers });
    }
  };
}
