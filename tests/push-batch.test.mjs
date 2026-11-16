import test from 'node:test';
import assert from 'node:assert/strict';
import { processPushJobs } from '../supabase/functions/_shared/batch.js';

test('пачка продолжает работу после сбоя; failed не включает обычный skipped', async () => {
  const calls = [], logs = [];
  const jobs = Array.from({ length: 6 }, (_, id) => ({ id, claimed_at: 'claim-token' }));
  const result = await processPushJobs(jobs, {
    async rpc(name, args) {
      calls.push({ name, ...args });
      if (name === 'finish_push') return;
      if (args.p_id === 1) throw new Error('sensitive text');
      if (args.p_id === 2) return null;
      return { card: { id: args.p_id }, subscriptions: [] };
    },
    deliver: async () => ({ sent: 1 }), log: code => logs.push(code),
  });
  assert.deepEqual(result, { ok: true, claimed: 6, completed: 4, failed: 1 });
  assert(calls.some(call => call.name === 'finish_push' && call.p_id === 1 && call.p_sent === false && call.p_claimed_at === 'claim-token'));
  assert(calls.some(call => call.name === 'finish_push' && call.p_id === 5 && call.p_sent === true));
  assert.deepEqual(logs, ['push_job_failed']);
});

test('пустая пачка и нулевая доставка завершаются без исключений', async () => {
  const empty = await processPushJobs([], { rpc: () => assert.fail(), deliver: () => assert.fail() });
  assert.deepEqual(empty, { ok: true, claimed: 0, completed: 0, failed: 0 });
  const finishes = [];
  const result = await processPushJobs([{ id: 'a', claimed_at: 'c' }], {
    async rpc(name, args) {
      if (name === 'prepare_due_push') return { card: {}, subscriptions: [] };
      finishes.push(args);
    },
    deliver: async () => ({ sent: 0 }),
  });
  assert.equal(result.completed, 1);
  assert.equal(finishes[0].p_sent, false);
});
