// Проверка настоящего шифрования библиотеки. Сетевые запросы заменены тестовым fetch.
const calls: { url: string; init: RequestInit }[] = [];
let dead = false;
globalThis.fetch = (input, init = {}) => {
  const url = input instanceof Request ? input.url : String(input);
  calls.push({ url, init });
  if (url.startsWith('https://database.example/')) return Promise.resolve(new Response(null, { status: 204 }));
  return Promise.resolve(new Response(null, { status: dead && url.includes('dead') ? 410 : 201 }));
};
const vapid = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
Deno.env.set('VAPID_PRIVATE_JWK', JSON.stringify(await crypto.subtle.exportKey('jwk', vapid.privateKey)));
Deno.env.set('VAPID_SUBJECT', 'https://example.com');
Deno.env.set('APP_ORIGIN', 'https://example.com');
Deno.env.set('SUPABASE_URL', 'https://database.example');
Deno.env.set('SUPABASE_SECRET_KEYS', JSON.stringify({ default: 'test-secret' }));

const { deliver, pushPayload } = await import('./_shared/push.ts');
const { handler, authenticatedUser } = await import('./_shared/core.ts');
const { decodeApplicationKey } = await import('../../js/push-utils.js');
function assert(value: unknown, message = 'assertion failed'): asserts value { if (!value) throw new Error(message); }
const encode = (value: Uint8Array) => btoa(String.fromCharCode(...value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
const auth = crypto.getRandomValues(new Uint8Array(16));
const card = { id: '22222222-2222-4222-8222-222222222222', question: 'Что такое угол сноса?', deck_name: 'Навигация' };
const subscription = { id: '33333333-3333-4333-8333-333333333333', user_id: 'user-a',
  endpoint: 'https://fcm.googleapis.com/fcm/send/test', p256dh: encode(uaPublic), auth: encode(auth) };

async function hkdf(key: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number) {
  const material = await crypto.subtle.importKey('raw', new Uint8Array(key), 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(salt), info: new Uint8Array(info) }, material, length * 8));
}
function concat(...parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length; } return result;
}

Deno.test('VAPID проверяется, payload расшифровывается как RFC 8291', async () => {
  const result = await deliver(card, [subscription], 'test-topic');
  assert(result.sent === 1);
  const sent = calls.find(call => call.url === subscription.endpoint)!;
  const headers = new Headers(sent.init.headers);
  assert(headers.get('Content-Encoding') === 'aes128gcm');
  assert(headers.get('TTL') === '60');
  assert(sent.init.redirect === 'error');
  const authorization = headers.get('Authorization')!;
  const token = authorization.match(/t=([^,]+)/)![1];
  const [head, body, signature] = token.split('.');
  const claims = JSON.parse(new TextDecoder().decode(decodeApplicationKey(body)));
  assert(claims.aud === new URL(subscription.endpoint).origin);
  assert(claims.sub === 'https://example.com');
  assert(claims.exp * 1000 > Date.now() && claims.exp * 1000 < Date.now() + 24 * 3600_000);
  assert(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vapid.publicKey,
    decodeApplicationKey(signature), new TextEncoder().encode(`${head}.${body}`)));

  const encrypted = new Uint8Array(sent.init.body as ArrayBuffer);
  const salt = encrypted.slice(0, 16);
  const keyLength = encrypted[20];
  assert(keyLength === 65);
  const serverRaw = encrypted.slice(21, 21 + keyLength);
  const serverPublic = await crypto.subtle.importKey('raw', serverRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: serverPublic }, ua.privateKey, 256));
  const utf8 = new TextEncoder();
  const ikm = await hkdf(secret, auth, concat(utf8.encode('WebPush: info\0'), uaPublic, serverRaw), 32);
  const cek = await hkdf(ikm, salt, utf8.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(ikm, salt, utf8.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, encrypted.slice(21 + keyLength)));
  assert(plaintext.at(-1) === 2);
  const payload = JSON.parse(new TextDecoder().decode(plaintext.slice(0, -1)));
  assert(payload.title === card.deck_name && payload.body === card.question);
  assert(payload.url === `https://example.com/question-cards/?card=${card.id}&src=push`);
});

Deno.test('длинный кириллический вопрос укладывается в предел UTF-8 Web Push', () => {
  const payload = pushPayload({ ...card, question: 'Я🙂'.repeat(5000), deck_name: 'Колода'.repeat(500) });
  assert(new TextEncoder().encode(payload).length <= 3993);
  assert(JSON.parse(payload).body.endsWith('…'));
});

Deno.test('410 удаляет только конкретную подписку, успех другого устройства сохраняется', async () => {
  dead = true;
  const result = await deliver(card, [{ ...subscription, endpoint: subscription.endpoint + '-dead' }, subscription], 'next-topic');
  assert(result.sent === 1 && result.removed === 1);
  const deleted = calls.filter(call => call.init.method === 'DELETE').at(-1)!;
  const url = new URL(deleted.url);
  assert(url.searchParams.get('user_id') === 'eq.user-a');
  assert(url.searchParams.get('endpoint') === `eq.${subscription.endpoint}-dead`);
});

Deno.test('endpoint другого домена не получает ни запрос, ни VAPID', async () => {
  const before = calls.length;
  const result = await deliver(card, [{ ...subscription, endpoint: 'https://127.0.0.1/private' }], 'blocked');
  assert(result.sent === 0 && calls.length === before);
});

Deno.test('test-push требует JWT, CORS не открывает произвольный origin', async () => {
  const endpoint = handler(async request => ({ user: await authenticatedUser(request) }), true);
  const unauthorized = await endpoint(new Request('https://example.com', { method: 'POST' }));
  assert(unauthorized.status === 401);
  const cors = await endpoint(new Request('https://example.com', { method: 'OPTIONS', headers: { Origin: 'https://example.com' } }));
  assert(cors.status === 204 && cors.headers.get('Access-Control-Allow-Origin') === 'https://example.com');
  const blocked = await endpoint(new Request('https://example.com', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }));
  assert(blocked.status === 403);
});
