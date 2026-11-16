import { processPushJobs } from './_shared/batch.js';

function assert(value: unknown, message = 'assertion failed'): asserts value { if (!value) throw new Error(message); }
const jobs = Array.from({ length: 7 }, (_, index) => ({ id: String(index), claimed_at: '2026-11-16T12:00:00Z' }));

Deno.test('сбой prepare одного задания не мешает остальной пачке; finish(false) вызывается', async () => {
  const finishes: Record<string, unknown>[] = [], logs: string[] = [], deliveries: string[] = [];
  const result = await processPushJobs(jobs, {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === 'finish_push') { finishes.push(args); return; }
      if (args.p_id === '0') throw new Error('PRIVATE: endpoint/card/secret');
      if (args.p_id === '1') return null;
      return { card: { id: args.p_id }, subscriptions: [] };
    },
    deliver: async (_card: unknown, _subscriptions: unknown, id: string) => { deliveries.push(id); return { sent: 1 }; },
    log: (code: string) => logs.push(code),
  });
  assert(result.claimed === 7 && result.completed === 5 && result.failed === 1);
  assert(deliveries.length === 5 && deliveries.includes('6'));
  assert(finishes.some(args => args.p_id === '0' && args.p_sent === false));
  assert(logs.join(',') === 'push_job_failed');
});

Deno.test('падение deliver и повторного finish не останавливает другие задания', async () => {
  const logs: string[] = [], attempts: Record<string, unknown>[] = [];
  const result = await processPushJobs(jobs, {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === 'prepare_due_push') return { card: { id: args.p_id }, subscriptions: [] };
      attempts.push(args);
      if (args.p_id === '0') throw new Error('PRIVATE database error');
    },
    deliver: async (card: { id: string }) => {
      if (card.id === '0') throw new Error('PRIVATE question');
      return { sent: 1 };
    },
    log: (code: string) => logs.push(code),
  });
  assert(result.completed === 6 && result.failed === 1);
  assert(attempts.some(args => args.p_id === '0' && args.p_sent === false));
  assert(logs.join(',') === 'push_job_failed,push_job_finish_failed');
});

Deno.test('сбой успешного finish вызывает защищённый finish(false), failed считается один раз', async () => {
  const calls: boolean[] = [];
  const result = await processPushJobs(jobs.slice(0, 1), {
    rpc: async (name: string, args: { p_sent?: boolean }) => {
      if (name === 'prepare_due_push') return { card: {}, subscriptions: [] };
      calls.push(args.p_sent!);
      if (args.p_sent) throw new Error('database response lost');
    },
    deliver: async () => ({ sent: 1 }), log: () => {},
  });
  assert(result.completed === 0 && result.failed === 1);
  assert(JSON.stringify(calls) === '[true,false]');
});
