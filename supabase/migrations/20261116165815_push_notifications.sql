begin;

alter table public.notification_schedule add column skip_reason text;
alter table public.notification_settings add constraint notification_settings_daily_limit check (per_day <= 50);
grant usage on schema app_private to service_role;

-- Ограничитель тестовых отправок не доступен браузеру.
create table app_private.push_test_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null
);
alter table app_private.push_test_limits enable row level security;
revoke all on app_private.push_test_limits from public, anon, authenticated;
grant select, insert, update, delete on app_private.push_test_limits to service_role;

create function app_private.in_push_window(p_time time, p_start time, p_end time)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select case when p_start < p_end then p_time >= p_start and p_time < p_end
    else p_time >= p_start or p_time < p_end end;
$$;

-- Перебираются реальные UTC-минуты: несуществующие часы DST не создаются,
-- повторяющийся осенний час представлен двумя разными UTC-интервалами.
create function app_private.push_minutes(
  p_date date, p_zone text, p_start time, p_end time,
  p_quiet_start time, p_quiet_end time, p_now timestamptz
)
returns table(fire_at timestamptz) language sql stable security invoker set search_path = '' as $$
  select t from pg_catalog.generate_series(
    (p_date::timestamp at time zone 'UTC') - interval '18 hours',
    (p_date::timestamp at time zone 'UTC') + interval '42 hours', interval '1 minute'
  ) t
  where (t at time zone p_zone)::date = p_date
    and t >= date_trunc('minute', p_now) + interval '1 minute'
    and app_private.in_push_window((t at time zone p_zone)::time, p_start, p_end)
    and (p_quiet_start is null or not app_private.in_push_window(
      (t at time zone p_zone)::time, p_quiet_start, p_quiet_end));
$$;

create function app_private.reset_pending_push_schedule()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and new.user_id <> auth.uid() then
    raise exception 'Нет доступа к настройкам' using errcode = '42501';
  end if;
  if new.enabled is distinct from old.enabled or new.per_day is distinct from old.per_day
    or new.start_time is distinct from old.start_time or new.end_time is distinct from old.end_time
    or new.quiet_start is distinct from old.quiet_start or new.quiet_end is distinct from old.quiet_end
    or new.timezone is distinct from old.timezone then
    delete from public.notification_schedule where user_id = new.user_id
      and (status = 'pending' or (status = 'skipped' and skip_reason = 'no_window'));
  end if;
  return new;
end;
$$;
create trigger reset_pending_push_schedule after update on public.notification_settings
  for each row execute function app_private.reset_pending_push_schedule();

create function public.plan_push_schedule(p_user_id uuid default null, p_now timestamptz default now())
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  settings public.notification_settings%rowtype;
  plan_day date; day_offset integer; existing integer; last_slot integer;
  budget integer; moments timestamptz[]; i integer; inserted integer; total integer := 0;
begin
  for settings in select s.* from public.notification_settings s
    where s.enabled and (p_user_id is null or s.user_id = p_user_id)
      and exists (select 1 from public.push_subscriptions ps where ps.user_id = s.user_id)
    order by s.user_id for update of s skip locked
  loop
    for day_offset in 0..1 loop
      plan_day := (p_now at time zone settings.timezone)::date + day_offset;
      select count(*), coalesce(max(slot), 0) into existing, last_slot
        from public.notification_schedule where user_id = settings.user_id and plan_date = plan_day;
      budget := greatest(0, settings.per_day - existing);
      if budget = 0 then continue; end if;
      select coalesce(array_agg(p.fire_at order by p.fire_at), array[]::timestamptz[]) into moments
      from (
        select m.fire_at from app_private.push_minutes(plan_day, settings.timezone,
          settings.start_time, settings.end_time, settings.quiet_start, settings.quiet_end, p_now) m
        where not exists (select 1 from public.notification_schedule n
          where n.user_id = settings.user_id and n.plan_date = plan_day and n.fire_at = m.fire_at)
        order by random() limit budget
      ) p;
      for i in 1..budget loop
        insert into public.notification_schedule(user_id, plan_date, slot, fire_at, status, skip_reason)
        values (settings.user_id, plan_day, last_slot + i,
          coalesce(moments[i], plan_day::timestamp at time zone settings.timezone),
          case when moments[i] is null then 'skipped' else 'pending' end,
          case when moments[i] is null then 'no_window' else null end)
        on conflict (user_id, plan_date, slot) do nothing;
        get diagnostics inserted = row_count;
        total := total + inserted;
      end loop;
    end loop;
  end loop;
  return total;
end;
$$;

create function public.claim_due_pushes(p_limit integer default 20, p_now timestamptz default now())
returns setof public.notification_schedule language plpgsql security invoker set search_path = '' as $$
begin
  -- Не повторяем неизвестный результат отправки после падения процесса.
  update public.notification_schedule set status = 'skipped', skip_reason = 'stale_processing'
    where status = 'processing' and claimed_at < p_now - interval '10 minutes';
  return query
    with candidates as (
      select id from public.notification_schedule
      where status = 'pending' and fire_at <= p_now
      order by fire_at, id limit greatest(1, least(p_limit, 50))
      for update skip locked
    )
    update public.notification_schedule n set status = 'processing', claimed_at = p_now
      from candidates c where n.id = c.id returning n.*;
end;
$$;

create function public.choose_push_card(p_user_id uuid, p_allow_future boolean default false, p_now timestamptz default now())
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select jsonb_build_object('id', c.id, 'question', c.question, 'deck_name', d.name)
  from public.cards c join public.decks d on d.id = c.deck_id and d.user_id = c.user_id
  where c.user_id = p_user_id and d.push_enabled and (p_allow_future or c.due_at <= p_now)
  order by ((greatest(0, extract(epoch from (p_now - c.due_at)) / 86400) * 10
    + c.lapses * 4 + c.hard_count * 2) * (0.8 + random() * 0.4)) desc, c.due_at, c.id
  limit 1;
$$;

create function public.prepare_due_push(p_id uuid, p_claimed_at timestamptz, p_now timestamptz default now())
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  job public.notification_schedule%rowtype;
  settings public.notification_settings%rowtype;
  local_time time; reason text; card jsonb; subscriptions jsonb;
begin
  select * into job from public.notification_schedule
    where id = p_id and status = 'processing' and claimed_at = p_claimed_at for update;
  if not found then return null; end if;
  select * into settings from public.notification_settings where user_id = job.user_id;
  local_time := (p_now at time zone settings.timezone)::time;
  if settings.user_id is null or not settings.enabled then reason := 'disabled';
  elsif job.fire_at < p_now - interval '5 minutes' then reason := 'late';
  elsif (p_now at time zone settings.timezone)::date <> job.plan_date then reason := 'wrong_day';
  elsif not app_private.in_push_window(local_time, settings.start_time, settings.end_time)
    or (settings.quiet_start is not null and app_private.in_push_window(local_time, settings.quiet_start, settings.quiet_end))
    then reason := 'outside_window';
  end if;
  if reason is null then
    card := public.choose_push_card(job.user_id, false, p_now);
    if card is null then reason := 'no_cards'; end if;
  end if;
  if reason is null then
    select jsonb_agg(to_jsonb(p)) into subscriptions from public.push_subscriptions p where p.user_id = job.user_id;
    if subscriptions is null then reason := 'no_subscriptions'; end if;
  end if;
  if reason is not null then
    update public.notification_schedule set status = 'skipped', skip_reason = reason where id = job.id;
    return null;
  end if;
  return jsonb_build_object('card', card, 'subscriptions', subscriptions);
end;
$$;

create function public.finish_push(p_id uuid, p_claimed_at timestamptz, p_sent boolean)
returns void language sql security invoker set search_path = '' as $$
  update public.notification_schedule set status = case when p_sent then 'sent' else 'skipped' end,
    sent_at = case when p_sent then now() else null end,
    skip_reason = case when p_sent then null else 'delivery_failed' end
  where id = p_id and status = 'processing' and claimed_at = p_claimed_at;
$$;

create function public.claim_test_push(p_user_id uuid)
returns boolean language sql security invoker set search_path = '' as $$
  with claimed as (
    insert into app_private.push_test_limits(user_id, requested_at) values (p_user_id, now())
    on conflict (user_id) do update set requested_at = excluded.requested_at
      where push_test_limits.requested_at < now() - interval '1 minute'
    returning user_id
  ) select exists(select 1 from claimed);
$$;

-- Закрываем прямой вызов вспомогательной функции автоматического RLS из панели.
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end; $$;

revoke all on function app_private.in_push_window(time, time, time),
  app_private.push_minutes(date, text, time, time, time, time, timestamptz),
  app_private.reset_pending_push_schedule() from public, anon, authenticated;
grant execute on function app_private.in_push_window(time, time, time),
  app_private.push_minutes(date, text, time, time, time, time, timestamptz) to service_role;

revoke all on function public.plan_push_schedule(uuid, timestamptz),
  public.claim_due_pushes(integer, timestamptz), public.choose_push_card(uuid, boolean, timestamptz),
  public.prepare_due_push(uuid, timestamptz, timestamptz), public.finish_push(uuid, timestamptz, boolean),
  public.claim_test_push(uuid) from public, anon, authenticated;
grant execute on function public.plan_push_schedule(uuid, timestamptz),
  public.claim_due_pushes(integer, timestamptz), public.choose_push_card(uuid, boolean, timestamptz),
  public.prepare_due_push(uuid, timestamptz, timestamptz), public.finish_push(uuid, timestamptz, boolean),
  public.claim_test_push(uuid) to service_role;

commit;
