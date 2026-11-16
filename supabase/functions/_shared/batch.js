// Независимая обработка заданий; зависимости передаются для Node/Deno-тестов.
export async function processPushJobs(jobs, { rpc, deliver, log = code => console.error(code) }) {
  let completed = 0, failed = 0, next = 0;
  // По четыре слота, а внутри deliver — до четырёх устройств.
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      try {
        const prepared = await rpc('prepare_due_push', { p_id: job.id, p_claimed_at: job.claimed_at });
        if (!prepared) continue; // SQL уже записал причину skipped.
        const result = await deliver(prepared.card, prepared.subscriptions, job.id);
        await rpc('finish_push', { p_id: job.id, p_claimed_at: job.claimed_at, p_sent: result.sent > 0 });
        completed += 1;
      } catch {
        failed += 1;
        // Только постоянные коды: без объекта ошибки, endpoint и текста вопроса.
        log('push_job_failed');
        try {
          await rpc('finish_push', { p_id: job.id, p_claimed_at: job.claimed_at, p_sent: false });
        } catch {
          log('push_job_finish_failed');
          // Если БД недоступна, существующее правило закроет processing через 10 минут.
        }
      }
    }
  }));
  return { ok: true, claimed: jobs.length, completed, failed };
}
