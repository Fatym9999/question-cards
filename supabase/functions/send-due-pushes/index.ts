import { authenticateCron, handler, rpc } from '../_shared/core.ts';
import { deliver } from '../_shared/push.ts';

Deno.serve(handler(async request => {
  await authenticateCron(request);
  const jobs = await rpc('claim_due_pushes', { p_limit: 20 });
  let completed = 0;
  // По четыре слота, а внутри слота — до четырёх устройств.
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const prepared = await rpc('prepare_due_push', { p_id: job.id, p_claimed_at: job.claimed_at });
      if (!prepared) continue;
      const result = await deliver(prepared.card, prepared.subscriptions, job.id);
      await rpc('finish_push', { p_id: job.id, p_claimed_at: job.claimed_at, p_sent: result.sent > 0 });
      completed += 1;
    }
  }));
  return { ok: true, claimed: jobs.length, completed };
}));
