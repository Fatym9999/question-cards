-- Для отката: скопировать в НОВУЮ миграцию. Колонки и данные не удаляются.
begin;

create or replace function public.choose_push_card(p_user_id uuid, p_allow_future boolean default false, p_now timestamptz default now())
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select jsonb_build_object('id', c.id, 'question', c.question, 'deck_name', d.name)
  from public.cards c join public.decks d on d.id = c.deck_id and d.user_id = c.user_id
  where c.user_id = p_user_id and d.push_enabled and (p_allow_future or c.due_at <= p_now)
  order by ((greatest(0, extract(epoch from (p_now - c.due_at)) / 86400) * 10
    + c.lapses * 4 + c.hard_count * 2) * (0.8 + random() * 0.4)) desc, c.due_at, c.id
  limit 1;
$$;

create or replace function public.prepare_due_push(p_id uuid, p_claimed_at timestamptz, p_now timestamptz default now())
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

create or replace function public.finish_push(p_id uuid, p_claimed_at timestamptz, p_sent boolean)
returns void language sql security invoker set search_path = '' as $$
  update public.notification_schedule set status = case when p_sent then 'sent' else 'skipped' end,
    sent_at = case when p_sent then now() else null end,
    skip_reason = case when p_sent then null else 'delivery_failed' end
  where id = p_id and status = 'processing' and claimed_at = p_claimed_at;
$$;

commit;
