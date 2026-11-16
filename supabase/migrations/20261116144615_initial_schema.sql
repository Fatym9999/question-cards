-- Этап 1. Выполнить ОДИН раз в новом отдельном Supabase-проекте.
begin;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema public, app_private to authenticated;
grant usage on schema public to service_role;

create table public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  exam_date date,
  push_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  deck_id uuid not null,
  question text not null check (length(btrim(question)) > 0),
  answer text not null check (length(btrim(answer)) > 0),
  favorite boolean not null default false,
  interval_days integer not null default 0 check (interval_days >= 0),
  due_at timestamptz not null default now() check (isfinite(due_at)),
  repetitions integer not null default 0 check (repetitions >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  hard_count integer not null default 0 check (hard_count >= 0),
  last_reviewed_at timestamptz check (isfinite(last_reviewed_at)),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (deck_id, user_id) references public.decks(id, user_id) on delete cascade
);

create table public.review_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id uuid not null,
  rating text not null check (rating in ('again', 'hard', 'good')),
  previous_interval integer not null check (previous_interval >= 0),
  new_interval integer not null check (new_interval >= 0),
  reviewed_at timestamptz not null check (isfinite(reviewed_at)),
  foreign key (card_id, user_id) references public.cards(id, user_id) on delete cascade
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null check (endpoint ~ '^https://[^[:space:]]+$'),
  p256dh text not null check (length(p256dh) > 0),
  auth text not null check (length(auth) > 0),
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create table public.notification_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  per_day integer not null default 5 check (per_day >= 1),
  start_time time not null default '09:00',
  end_time time not null default '20:00',
  quiet_start time,
  quiet_end time,
  timezone text not null default 'UTC',
  check (start_time <> end_time),
  check (
    (quiet_start is null and quiet_end is null)
    or (quiet_start is not null and quiet_end is not null and quiet_start <> quiet_end)
  )
);

create table public.notification_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  slot integer not null check (slot >= 1),
  fire_at timestamptz not null check (isfinite(fire_at)),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'skipped')),
  claimed_at timestamptz check (isfinite(claimed_at)),
  sent_at timestamptz check (isfinite(sent_at)),
  unique (user_id, plan_date, slot),
  check (status <> 'processing' or claimed_at is not null),
  check (status <> 'sent' or sent_at is not null)
);

create index decks_user_idx on public.decks(user_id);
create index cards_deck_owner_idx on public.cards(deck_id, user_id);
create index cards_user_due_idx on public.cards(user_id, due_at);
create index review_logs_card_owner_idx on public.review_logs(card_id, user_id);
create index review_logs_user_time_idx on public.review_logs(user_id, reviewed_at desc);
create index notification_schedule_pending_idx
  on public.notification_schedule(fire_at) where status = 'pending';
create index notification_schedule_processing_idx
  on public.notification_schedule(claimed_at) where status = 'processing';

create function app_private.validate_notification_timezone()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from pg_catalog.pg_timezone_names z
    where z.name = new.timezone
      and (z.name = 'UTC' or position('/' in z.name) > 0)
      and z.name not like 'posix/%'
      and z.name not like 'right/%'
  ) then
    raise exception 'Укажите часовой пояс IANA, например Europe/Moscow'
      using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function app_private.validate_notification_timezone() from public, anon, authenticated;

create trigger validate_notification_timezone
before insert or update of timezone on public.notification_settings
for each row execute function app_private.validate_notification_timezone();

-- У каждой клиентской таблицы четыре отдельные политики владельца.
-- Расписание намеренно НЕ входит в этот список: политик клиента у него нет.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'decks', 'cards', 'review_logs', 'push_subscriptions', 'notification_settings'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy owner_select on public.%I for select to authenticated
       using ((select auth.uid()) = user_id)', table_name
    );
    execute format(
      'create policy owner_insert on public.%I for insert to authenticated
       with check ((select auth.uid()) = user_id)', table_name
    );
    execute format(
      'create policy owner_update on public.%I for update to authenticated
       using ((select auth.uid()) = user_id)
       with check ((select auth.uid()) = user_id)', table_name
    );
    execute format(
      'create policy owner_delete on public.%I for delete to authenticated
       using ((select auth.uid()) = user_id)', table_name
    );
  end loop;
end;
$$;
alter table public.notification_schedule enable row level security;

-- Убираем в том числе автоматические GRANT нового проекта Supabase.
revoke all on table public.decks, public.cards, public.review_logs,
  public.push_subscriptions, public.notification_settings, public.notification_schedule
  from public, anon, authenticated;

grant select, delete on public.decks, public.cards, public.review_logs to authenticated;
grant insert (name, exam_date, push_enabled) on public.decks to authenticated;
grant update (name, exam_date, push_enabled) on public.decks to authenticated;
grant insert (deck_id, question, answer, favorite) on public.cards to authenticated;
grant update (deck_id, question, answer, favorite) on public.cards to authenticated;
grant select, insert, update, delete on public.push_subscriptions,
  public.notification_settings to authenticated;

grant all on table public.decks, public.cards, public.review_logs,
  public.push_subscriptions, public.notification_settings, public.notification_schedule
  to service_role;

-- Привилегированная часть находится вне схемы Data API.
-- Она нужна, чтобы браузер не мог менять поля повторения и журнал напрямую.
create function app_private.record_review(
  p_card_id uuid,
  p_expected_revision bigint,
  p_rating text,
  p_interval_days integer,
  p_due_at timestamptz,
  p_repetitions integer,
  p_lapses integer,
  p_hard_count integer,
  p_reviewed_at timestamptz
)
returns public.cards
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_uid uuid := auth.uid();
  previous_card public.cards%rowtype;
  updated_card public.cards%rowtype;
begin
  if current_uid is null then
    raise exception 'Сначала войдите в аккаунт' using errcode = '42501';
  end if;

  select * into previous_card from public.cards
  where id = p_card_id and user_id = current_uid
  for update;

  if not found then
    raise exception 'Карточка недоступна' using errcode = 'P0002';
  end if;
  if p_expected_revision is distinct from previous_card.revision then
    raise exception 'Карточка уже изменена. Обновите её перед ответом'
      using errcode = '40001';
  end if;

  if p_rating is null or p_rating not in ('again', 'hard', 'good')
    or p_interval_days is null or p_interval_days < 0
    or p_repetitions is null or p_repetitions < 0
    or p_lapses is null or p_lapses < 0
    or p_hard_count is null or p_hard_count < 0
    or p_reviewed_at is null or not isfinite(p_reviewed_at)
    or p_due_at is null or not isfinite(p_due_at)
    or p_due_at <= p_reviewed_at then
    raise exception 'Некорректные параметры ответа' using errcode = '22023';
  end if;

  -- Формулы здесь не дублируются: новые значения считает JS-модуль этапа 2.
  update public.cards set
    interval_days = p_interval_days,
    due_at = p_due_at,
    repetitions = p_repetitions,
    lapses = p_lapses,
    hard_count = p_hard_count,
    last_reviewed_at = p_reviewed_at,
    revision = revision + 1
  where id = previous_card.id and user_id = current_uid
  returning * into updated_card;

  insert into public.review_logs (
    card_id, user_id, rating, previous_interval, new_interval, reviewed_at
  ) values (
    previous_card.id, current_uid, p_rating, previous_card.interval_days,
    p_interval_days, p_reviewed_at
  );

  return updated_card;
end;
$$;
revoke all on function app_private.record_review(
  uuid, bigint, text, integer, timestamptz, integer, integer, integer, timestamptz
) from public, anon, authenticated;
grant execute on function app_private.record_review(
  uuid, bigint, text, integer, timestamptz, integer, integer, integer, timestamptz
) to authenticated;

-- Единственная точка вызова из JS: supabase.rpc('record_review', {...}).
-- Обёртка не начинает отдельную транзакцию: весь вызов атомарен.
create function public.record_review(
  p_card_id uuid,
  p_expected_revision bigint,
  p_rating text,
  p_interval_days integer,
  p_due_at timestamptz,
  p_repetitions integer,
  p_lapses integer,
  p_hard_count integer,
  p_reviewed_at timestamptz
)
returns public.cards
language sql
security invoker
set search_path = ''
as $$
  select app_private.record_review(
    p_card_id, p_expected_revision, p_rating, p_interval_days,
    p_due_at, p_repetitions, p_lapses, p_hard_count, p_reviewed_at
  );
$$;
revoke all on function public.record_review(
  uuid, bigint, text, integer, timestamptz, integer, integer, integer, timestamptz
) from public, anon, authenticated;
grant execute on function public.record_review(
  uuid, bigint, text, integer, timestamptz, integer, integer, integer, timestamptz
) to authenticated;

commit;
