begin;

alter table public.cards add column last_pushed_at timestamptz check (isfinite(last_pushed_at));
alter table public.notification_schedule add column card_id uuid
  references public.cards(id) on delete set null;
create index notification_schedule_active_card_idx
  on public.notification_schedule(user_id, card_id)
  where status = 'processing' and card_id is not null;

-- Сигнатура прежняя: старые клиенты и Edge Functions продолжают работать.
create or replace function public.choose_push_card(
  p_user_id uuid, p_allow_future boolean default false, p_now timestamptz default now()
)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  c_push_cooldown constant interval := interval '6 hours';
  c_priority_count_cap constant integer := 5;
  chosen jsonb;
begin
  select jsonb_build_object('id', c.id, 'question', c.question, 'deck_name', d.name) into chosen
  from public.cards c join public.decks d on d.id = c.deck_id and d.user_id = c.user_id
  where c.user_id = p_user_id and d.push_enabled
    and (p_allow_future or (
      c.due_at <= p_now
      and (c.last_pushed_at is null or c.last_pushed_at <= p_now - c_push_cooldown)
      -- Два параллельных слота не резервируют один вопрос до завершения доставки.
      and not exists (select 1 from public.notification_schedule n
        where n.user_id = c.user_id and n.card_id = c.id and n.status = 'processing')
    ))
  order by ((greatest(0, extract(epoch from (p_now - c.due_at)) / 86400) * 10
    + least(c.lapses, c_priority_count_cap) * 4
    + least(c.hard_count, c_priority_count_cap) * 2) * (0.8 + random() * 0.4)) desc,
    c.due_at, c.id
  limit 1;
  return chosen;
end;
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
  select * into settings from public.notification_settings where user_id = job.user_id for update;
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
  -- Сохраняем выбранную карточку; last_pushed_at меняет только успешный finish.
  update public.notification_schedule set card_id = (card->>'id')::uuid where id = job.id;
  return jsonb_build_object('card', card, 'subscriptions', subscriptions);
end;
$$;

create or replace function public.finish_push(p_id uuid, p_claimed_at timestamptz, p_sent boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  finished_card uuid;
  owner_id uuid;
begin
  update public.notification_schedule set status = case when p_sent then 'sent' else 'skipped' end,
    sent_at = case when p_sent then now() else null end,
    skip_reason = case when p_sent then null else 'delivery_failed' end
  where id = p_id and status = 'processing' and claimed_at = p_claimed_at
  returning card_id, user_id into finished_card, owner_id;
  -- Повторный/устаревший finish ничего не меняет. Оба обновления — одна транзакция.
  if found and p_sent and finished_card is not null then
    update public.cards set last_pushed_at = now()
      where id = finished_card and user_id = owner_id;
  end if;
end;
$$;

revoke all on function public.choose_push_card(uuid, boolean, timestamptz),
  public.prepare_due_push(uuid, timestamptz, timestamptz),
  public.finish_push(uuid, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.choose_push_card(uuid, boolean, timestamptz),
  public.prepare_due_push(uuid, timestamptz, timestamptz),
  public.finish_push(uuid, timestamptz, boolean) to service_role;

notify pgrst, 'reload schema';
commit;
