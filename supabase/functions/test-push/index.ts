import { admin, authenticatedUser, handler, HttpError, rpc } from '../_shared/core.ts';
import { deliver } from '../_shared/push.ts';

Deno.serve(handler(async request => {
  const userId = await authenticatedUser(request);
  const cards = await admin(`cards?user_id=eq.${userId}&select=id&limit=1`);
  if (!cards.length) throw new HttpError(409, 'no_cards');
  const subscriptions = await admin(`push_subscriptions?user_id=eq.${userId}&select=*`);
  if (!subscriptions.length) throw new HttpError(409, 'no_subscriptions');
  const card = await rpc('choose_push_card', { p_user_id: userId, p_allow_future: true });
  if (!card) throw new HttpError(409, 'no_enabled_decks');
  if (!await rpc('claim_test_push', { p_user_id: userId })) throw new HttpError(429, 'test_rate_limit');
  const result = await deliver(card, subscriptions, crypto.randomUUID());
  if (result.sent === 0) throw new HttpError(502, 'delivery_failed');
  return { ok: true, ...result };
}, true));
