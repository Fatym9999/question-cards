import { supabase } from './supabase-client.js';
import { appUrl } from './config.js';
import { calculateReview } from './algorithm.js';

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

async function allRows(table, userId) {
  const rows = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const page = unwrap(await supabase.from(table).select('*').eq('user_id', userId)
      .order('id').range(from, from + pageSize - 1));
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function settingsFor(userId) {
  let settings = unwrap(await supabase.from('notification_settings').select('*').eq('user_id', userId).maybeSingle());
  if (settings) return settings;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const result = await supabase.from('notification_settings').insert({ user_id: userId, timezone }).select().single();
  if (result.error?.code === '23505') {
    return unwrap(await supabase.from('notification_settings').select('*').eq('user_id', userId).single());
  }
  return unwrap(result);
}

export const api = {
  async load(userId) {
    const [decks, cards, settings] = await Promise.all([
      allRows('decks', userId), allRows('cards', userId), settingsFor(userId),
    ]);
    decks.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return { decks, cards, settings };
  },
  async signIn(email, password) {
    return unwrap(await supabase.auth.signInWithPassword({ email, password }));
  },
  async signUp(email, password) {
    return unwrap(await supabase.auth.signUp({ email, password, options: { emailRedirectTo: appUrl() } }));
  },
  async resetPassword(email) {
    return unwrap(await supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl() }));
  },
  async changePassword(password) {
    return unwrap(await supabase.auth.updateUser({ password }));
  },
  async signOut() {
    return unwrap(await supabase.auth.signOut({ scope: 'local' }));
  },
  async saveDeck(userId, id, values) {
    const query = id ? supabase.from('decks').update(values).eq('id', id).eq('user_id', userId)
      : supabase.from('decks').insert(values);
    return unwrap(await query.select().single());
  },
  async deleteDeck(userId, id) {
    return unwrap(await supabase.from('decks').delete().eq('id', id).eq('user_id', userId).select('id').single());
  },
  async saveCard(userId, id, values) {
    const query = id ? supabase.from('cards').update(values).eq('id', id).eq('user_id', userId)
      : supabase.from('cards').insert(values);
    return unwrap(await query.select().single());
  },
  async deleteCard(userId, id) {
    return unwrap(await supabase.from('cards').delete().eq('id', id).eq('user_id', userId).select('id').single());
  },
  async review(card, rating) {
    const result = calculateReview(card, rating);
    const saved = unwrap(await supabase.rpc('record_review', {
      p_card_id: card.id,
      p_expected_revision: card.revision,
      p_rating: rating,
      p_interval_days: result.interval_days,
      p_due_at: result.due_at,
      p_repetitions: result.repetitions,
      p_lapses: result.lapses,
      p_hard_count: result.hard_count,
      p_reviewed_at: result.last_reviewed_at,
    }));
    return Array.isArray(saved) ? saved[0] : saved;
  },
  async saveSettings(userId, values) {
    return unwrap(await supabase.from('notification_settings').update(values)
      .eq('user_id', userId).select().single());
  },
  async saveSubscription(values) {
    return unwrap(await supabase.from('push_subscriptions').upsert(values,
      { onConflict: 'user_id,endpoint' }).select().single());
  },
  async deleteSubscription(userId, endpoint) {
    return unwrap(await supabase.from('push_subscriptions').delete()
      .eq('user_id', userId).eq('endpoint', endpoint));
  },
  async testPush() {
    const result = await supabase.functions.invoke('test-push', { body: {} });
    if (result.error) {
      let code = 'delivery_failed';
      try { code = (await result.error.context.json()).error ?? code; } catch { /* Нет структурированного ответа. */ }
      throw Object.assign(new Error(code), { code });
    }
    return result.data;
  },
};
