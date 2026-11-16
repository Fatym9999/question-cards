import { authenticateCron, handler, rpc } from '../_shared/core.ts';

Deno.serve(handler(async request => {
  await authenticateCron(request);
  const planned = await rpc('plan_push_schedule');
  return { ok: true, planned };
}));
