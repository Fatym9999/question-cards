-- Диагностика этапа 5. Только чтение, запуск в Supabase SQL Editor от postgres.
-- Не выводит адреса подписок, ключи, тексты вопросов или содержимое Vault.
select jsonb_build_object(
  'checked_at', now(),
  'cron', (
    select coalesce(jsonb_agg(to_jsonb(j)), '[]'::jsonb)
    from (
      select c.jobname, c.schedule, c.active,
        last_run.status as last_status, last_run.start_time as last_started_at
      from cron.job c
      left join lateral (
        select r.status, r.start_time from cron.job_run_details r
        where r.jobid = c.jobid order by r.start_time desc limit 1
      ) last_run on true
      where c.jobname in ('question-cards-plan', 'question-cards-send')
      order by c.jobname
    ) j
  ),
  'recent_http', (
    select coalesce(jsonb_agg(to_jsonb(h)), '[]'::jsonb)
    from (
      select id, status_code, timed_out, created
      from net._http_response order by id desc limit 5
    ) h
  ),
  'accounts', (
    select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
    from (
      select s.user_id, s.enabled, s.per_day, s.timezone,
        s.start_time, s.end_time, s.quiet_start, s.quiet_end,
        (now() at time zone s.timezone) as local_now,
        (select count(*) from public.push_subscriptions p
          where p.user_id = s.user_id) as subscriptions,
        (select count(*) from public.cards c join public.decks d
          on d.id = c.deck_id and d.user_id = c.user_id
          where c.user_id = s.user_id and d.push_enabled and c.due_at <= now()) as due_cards
      from public.notification_settings s order by s.user_id
    ) a
  ),
  'recent_schedule', (
    select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb)
    from (
      select p.user_id, p.plan_date, p.slot, p.fire_at,
        p.fire_at at time zone s.timezone as local_fire_at,
        p.status, p.skip_reason, p.claimed_at, p.sent_at
      from public.notification_schedule p
      join public.notification_settings s on s.user_id = p.user_id
      order by p.fire_at desc, p.slot desc limit 30
    ) n
  )
) as runtime_status;
