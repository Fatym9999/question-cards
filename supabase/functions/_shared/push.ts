import { ApplicationServer, importVapidKeys, PushMessageError, Urgency } from 'jsr:@negrel/webpush@0.5.0';
import { admin, cardUrl, required } from './core.ts';
import { supportedPushEndpoint } from '../../../js/push-utils.js';

export interface Subscription { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }
export interface Card { id: string; question: string; deck_name: string }

export const allowedEndpoint = supportedPushEndpoint;

// Библиотека использует глобальный Fetch API. Ограничение касается только её
// VAPID-запросов; запросы Supabase/Auth остаются обычными.
const fetchTransport = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  if (headers.get('Authorization')?.startsWith('vapid ')) {
    const endpoint = input instanceof Request ? input.url : String(input);
    if (!allowedEndpoint(endpoint)) return Promise.reject(new Error('unsupported_push_endpoint'));
    return fetchTransport(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(8_000) });
  }
  return fetchTransport(input, init);
};

let serverPromise: Promise<ApplicationServer> | null = null;
function server(): Promise<ApplicationServer> {
  serverPromise ??= (async () => {
    const privateKey = JSON.parse(required('VAPID_PRIVATE_JWK'));
    const publicKey = { kty: privateKey.kty, crv: privateKey.crv, x: privateKey.x, y: privateKey.y, key_ops: ['verify'], ext: true };
    const vapidKeys = await importVapidKeys({ publicKey, privateKey });
    return ApplicationServer.new({ contactInformation: required('VAPID_SUBJECT'), vapidKeys });
  })().catch(error => { serverPromise = null; throw error; });
  return serverPromise;
}

export function pushPayload(card: Card): string {
  const payload = { title: card.deck_name, body: card.question, url: cardUrl(card.id) };
  const bytes = () => new TextEncoder().encode(JSON.stringify(payload)).length;
  // Ограничение Web Push — байты UTF-8, а не число символов. Полный вопрос остаётся в приложении.
  if (bytes() > 3993) {
    payload.title = Array.from(payload.title).slice(0, 120).join('');
    const question = Array.from(payload.body);
    let low = 0, high = question.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      payload.body = question.slice(0, middle).join('') + '…';
      if (bytes() <= 3993) low = middle; else high = middle - 1;
    }
    payload.body = question.slice(0, low).join('') + '…';
  }
  return JSON.stringify(payload);
}

export async function deliver(card: Card, subscriptions: Subscription[], topic: string) {
  const application = await server();
  const message = pushPayload(card);
  let sent = 0, removed = 0;
  // Один payload для всех устройств. Одновременно не более четырёх отправок.
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, subscriptions.length) }, async () => {
    while (next < subscriptions.length) {
      const subscription = subscriptions[next++];
      try {
        if (!allowedEndpoint(subscription.endpoint)) continue;
        const subscriber = application.subscribe({ endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth } });
        await subscriber.pushTextMessage(message, { ttl: 60, urgency: Urgency.High, topic: topic.replace(/-/g, '').slice(0, 32) });
        sent += 1;
      } catch (error) {
        const status = error instanceof PushMessageError ? error.response.status : 0;
        if (status === 404 || status === 410) {
          const filters = new URLSearchParams({ id: `eq.${subscription.id}`, user_id: `eq.${subscription.user_id}`, endpoint: `eq.${subscription.endpoint}` });
          try {
            await admin(`push_subscriptions?${filters}`, { method: 'DELETE' });
            removed += 1;
          } catch { console.error('subscription_cleanup_failed'); }
        } else console.error('push_device_failed', status);
      }
    }
  }));
  return { sent, removed };
}
