-- После push_review_stage_one. Только тестовые строки, в конце полный откат.
begin;
select set_config('test.cooldown_user', gen_random_uuid()::text, true);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
insert into auth.users(id, email) values (current_setting('test.cooldown_user')::uuid,
  current_setting('test.cooldown_user') || '@example.invalid');
insert into public.decks(user_id, name) values (current_setting('test.cooldown_user')::uuid, 'Cooldown fixture');
insert into public.cards(user_id, deck_id, question, answer, due_at)
  select user_id, id, 'Одна просроченная карточка', 'Ответ', now() - interval '1 day'
  from public.decks where user_id = current_setting('test.cooldown_user')::uuid;
insert into public.notification_settings(user_id, enabled, timezone, start_time, end_time)
  values (current_setting('test.cooldown_user')::uuid, true, 'UTC',
    (now() - interval '1 hour')::time, (now() + interval '1 hour')::time);
insert into public.push_subscriptions(user_id, endpoint, p256dh, auth)
  values (current_setting('test.cooldown_user')::uuid, 'https://fcm.googleapis.com/fcm/send/test-cooldown', 'test-key', 'test-auth');

set local role service_role;
do $$
declare
  uid uuid := current_setting('test.cooldown_user')::uuid;
  cid uuid; job_id uuid; overlapping_id uuid; next_id uuid; failed_id uuid;
  capped_id uuid; overdue_id uuid; prepared jsonb; stamp timestamptz; n integer;
begin
  select id into cid from public.cards where user_id = uid;
  insert into public.notification_schedule(user_id, plan_date, slot, fire_at, status, claimed_at)
    values (uid, (now() at time zone 'UTC')::date, 1, now(), 'processing', now()) returning id into job_id;
  prepared := public.prepare_due_push(job_id, now());
  if (prepared->'card'->>'id')::uuid is distinct from cid then raise exception 'FAIL: карточка не выбрана'; end if;
  if (select card_id from public.notification_schedule where id = job_id) is distinct from cid then
    raise exception 'FAIL: card_id не сохранён'; end if;
  if (select last_pushed_at from public.cards where id = cid) is not null then
    raise exception 'FAIL: prepare начал cooldown до доставки'; end if;

  -- Резервирование защищает и перекрывающиеся задания до первого finish.
  insert into public.notification_schedule(user_id, plan_date, slot, fire_at, status, claimed_at)
    values (uid, (now() at time zone 'UTC')::date, 2, now(), 'processing', now()) returning id into overlapping_id;
  if public.prepare_due_push(overlapping_id, now()) is not null then
    raise exception 'FAIL: пересекающиеся слоты выбрали одну карточку'; end if;

  perform public.finish_push(job_id, now(), true);
  select last_pushed_at into stamp from public.cards where id = cid;
  if stamp is distinct from now() then raise exception 'FAIL: успешный finish не записал время'; end if;
  perform public.finish_push(job_id, now(), false);
  if (select status from public.notification_schedule where id = job_id) <> 'sent' then
    raise exception 'FAIL: повторный finish изменил отправленный слот'; end if;

  insert into public.notification_schedule(user_id, plan_date, slot, fire_at, status, claimed_at)
    values (uid, (now() at time zone 'UTC')::date, 3, now(), 'processing', now()) returning id into next_id;
  if public.prepare_due_push(next_id, now()) is not null then
    raise exception 'FAIL: соседний слот повторил карточку за 6 часов'; end if;
  if not exists (select 1 from public.notification_schedule where id = next_id
    and status = 'skipped' and skip_reason = 'no_cards') then raise exception 'FAIL: нет skipped/no_cards'; end if;
  if public.choose_push_card(uid, false, now() + interval '6 hours' - interval '1 second') is not null then
    raise exception 'FAIL: cooldown закончился рано'; end if;
  if (public.choose_push_card(uid, false, now() + interval '6 hours')->>'id')::uuid is distinct from cid then
    raise exception 'FAIL: ровно через 6 часов карточка должна быть доступна'; end if;
  if (public.choose_push_card(uid, true)->>'id')::uuid is distinct from cid then
    raise exception 'FAIL: тестовая отправка должна обходить cooldown'; end if;
  if (select last_pushed_at from public.cards where id = cid) is distinct from stamp then
    raise exception 'FAIL: тестовый выбор изменил last_pushed_at'; end if;

  -- Неуспех не запускает cooldown; устаревший claim не может подтвердить доставку.
  update public.cards set last_pushed_at = null where id = cid;
  insert into public.notification_schedule(user_id, plan_date, slot, fire_at, status, claimed_at)
    values (uid, (now() at time zone 'UTC')::date, 4, now(), 'processing', now()) returning id into failed_id;
  perform public.prepare_due_push(failed_id, now());
  perform public.finish_push(failed_id, now() - interval '1 second', true);
  if (select last_pushed_at from public.cards where id = cid) is not null then
    raise exception 'FAIL: чужой claim записал время'; end if;
  perform public.finish_push(failed_id, now(), false);
  if (select last_pushed_at from public.cards where id = cid) is not null then
    raise exception 'FAIL: ошибка доставки начала cooldown'; end if;
  if public.choose_push_card(uid) is null then raise exception 'FAIL: ошибка оставила резерв карточки'; end if;

  -- Даже огромные счётчики не могут перевесить 8 дней просрочки после ограничения по 5.
  update public.cards set due_at = now(), lapses = 100000, hard_count = 100000 where id = cid;
  capped_id := cid;
  insert into public.cards(user_id, deck_id, question, answer, due_at)
    select user_id, deck_id, 'Давно просроченная', 'Ответ', now() - interval '8 days'
    from public.cards where id = cid returning id into overdue_id;
  for n in 1..20 loop
    if (public.choose_push_card(uid)->>'id')::uuid is distinct from overdue_id then
      raise exception 'FAIL: lapses/hard_count не ограничены пятью'; end if;
  end loop;

  -- Имитация удаления карточки между prepare и finish безопасна для FK и финализации.
  insert into public.notification_schedule(user_id, plan_date, slot, fire_at, status, claimed_at, card_id)
    values (uid, (now() at time zone 'UTC')::date, 5, now(), 'processing', now(), capped_id) returning id into next_id;
  delete from public.cards where id = capped_id;
  perform public.finish_push(next_id, now(), true);
  if not exists (select 1 from public.notification_schedule where id = next_id and status = 'sent' and card_id is null) then
    raise exception 'FAIL: удаление карточки сломало finish'; end if;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.cooldown_user'), true);
do $$ begin
  begin
    update public.cards set last_pushed_at = now() where user_id = auth.uid();
    raise exception 'FAIL: клиент может менять last_pushed_at';
  exception when insufficient_privilege then null; end;
  begin
    perform public.finish_push(gen_random_uuid(), now(), true);
    raise exception 'FAIL: клиент может подтверждать push';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
select 'OK: cooldown 6 часов, резервирование, успешный finish, тестовый обход, cap 5 и права проверены' as result;
rollback;
