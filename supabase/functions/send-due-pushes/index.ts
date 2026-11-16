import { authenticateCron, handler, rpc } from '../_shared/core.ts';
import { deliver } from '../_shared/push.ts';
import { processPushJobs } from '../_shared/batch.js';

Deno.serve(handler(async request => {
  await authenticateCron(request);
  const jobs = await rpc('claim_due_pushes', { p_limit: 20 });
  return processPushJobs(jobs, { rpc, deliver });
}));
