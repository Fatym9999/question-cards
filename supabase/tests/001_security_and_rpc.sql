-- Запускать целиком в SQL Editor ПОСЛЕ миграции, роль postgres.
-- Все тестовые пользователи и данные удаляются финальным ROLLBACK.
begin;

select set_config('test.user_a', gen_random_uuid()::text, true);
select set_config('test.user_b', gen_random_uuid()::text, true);
select set_config('test.deck_a', gen_random_uuid()::text, true);
select set_config('test.deck_b', gen_random_uuid()::text, true);
select set_config('test.card_a', gen_random_uuid()::text, true);
select set_config('test.card_b', gen_random_uuid()::text, true);

insert into auth.users(id, email) values
  (current_setting('test.user_a')::uuid, current_setting('test.user_a') || '@example.invalid'),
  (current_setting('test.user_b')::uuid, current_setting('test.user_b') || '@example.invalid');

insert into public.decks(id, user_id, name) values
  (current_setting('test.deck_a')::uuid, current_setting('test.user_a')::uuid, 'Тест A'),
  (current_setting('test.deck_b')::uuid, current_setting('test.user_b')::uuid, 'Тест B');
insert into public.cards(id, user_id, deck_id, question, answer) values
  (current_setting('test.card_a')::uuid, current_setting('test.user_a')::uuid,
   current_setting('test.deck_a')::uuid, 'Вопрос A', 'Ответ A'),
  (current_setting('test.card_b')::uuid, current_setting('test.user_b')::uuid,
   current_setting('test.deck_b')::uuid, 'Вопрос B', 'Ответ B');

-- Проверяем RLS и отсутствие политик расписания.
do $$
begin
  if (select count(*) from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relrowsecurity
        and c.relname in ('decks', 'cards', 'review_logs', 'push_subscriptions',
                         'notification_settings', 'notification_schedule')) <> 6 then
    raise exception 'FAIL: RLS должен быть включён на 6 таблицах';
  end if;
  if exists (select 1 from pg_catalog.pg_policies
             where schemaname = 'public' and tablename = 'notification_schedule') then
    raise exception 'FAIL: у расписания не должно быть клиентских политик';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.user_a'), true);
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.user_a'), 'role', 'authenticated')::text, true);

do $$
declare
  owned_deck uuid;
  owned_card uuid;
  reviewed public.cards%rowtype;
  changed integer;
begin
  if exists (select 1 from public.decks where id = current_setting('test.deck_b')::uuid)
     or exists (select 1 from public.cards where id = current_setting('test.card_b')::uuid) then
    raise exception 'FAIL: видны чужие данные';
  end if;

  insert into public.decks(name) values ('Проверка CRUD') returning id into owned_deck;
  insert into public.cards(deck_id, question, answer)
    values (owned_deck, 'Проверка', 'Работает') returning id into owned_card;
  update public.cards set favorite = true, question = 'Изменено' where id = owned_card;
  if not exists (select 1 from public.cards where id = owned_card
                 and user_id = auth.uid() and favorite and question = 'Изменено') then
    raise exception 'FAIL: создание или редактирование своей карточки';
  end if;
  delete from public.decks where id = owned_deck;
  if exists (select 1 from public.cards where id = owned_card) then
    raise exception 'FAIL: каскадное удаление карточек колоды';
  end if;

  begin
    insert into public.cards(deck_id, question, answer)
      values (current_setting('test.deck_b')::uuid, 'Чужая колода', 'Запрещено');
    raise exception 'FAIL: разрешено создание в чужой колоде';
  exception when foreign_key_violation then null;
  end;
  begin
    update public.cards set deck_id = current_setting('test.deck_b')::uuid
      where id = current_setting('test.card_a')::uuid;
    raise exception 'FAIL: разрешён перенос в чужую колоду';
  exception when foreign_key_violation then null;
  end;
  update public.cards set answer = 'Взлом' where id = current_setting('test.card_b')::uuid;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'FAIL: изменена чужая карточка'; end if;
  delete from public.cards where id = current_setting('test.card_b')::uuid;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'FAIL: удалена чужая карточка'; end if;

  begin
    update public.cards set interval_days = 999 where id = current_setting('test.card_a')::uuid;
    raise exception 'FAIL: поля повторения доступны напрямую';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.cards(deck_id, question, answer, interval_days)
      values (current_setting('test.deck_a')::uuid, 'Обход RPC', 'Запрещено', 999);
    raise exception 'FAIL: начальное повторение можно подменить';
  exception when insufficient_privilege then null;
  end;

  -- «Знаю»: значения имитируют результат будущего JS-модуля.
  select * into reviewed from public.record_review(
    current_setting('test.card_a')::uuid, 0, 'good', 3,
    now() + interval '3 days', 1, 0, 0, now()
  );
  if reviewed.interval_days <> 3 or reviewed.revision <> 1
     or reviewed.repetitions <> 1 or reviewed.last_reviewed_at <> now()
     or reviewed.due_at <> now() + interval '3 days' then
    raise exception 'FAIL: RPC не обновил карточку';
  end if;
  if not exists (select 1 from public.review_logs
    where card_id = reviewed.id and rating = 'good' and previous_interval = 0
      and new_interval = 3 and reviewed_at = now() and user_id = auth.uid()) then
    raise exception 'FAIL: RPC не создал журнал';
  end if;
  begin
    perform public.record_review(current_setting('test.card_a')::uuid, 0, 'good', 3,
      now() + interval '3 days', 1, 0, 0, now());
    raise exception 'FAIL: повторный запрос со старой версией принят';
  exception when serialization_failure then null;
  end;
  if (select count(*) from public.review_logs
      where card_id = current_setting('test.card_a')::uuid) <> 1 then
    raise exception 'FAIL: повторный запрос создал лишний журнал';
  end if;
  begin
    perform public.record_review(current_setting('test.card_b')::uuid, 0, 'good', 3,
      now() + interval '3 days', 1, 0, 0, now());
    raise exception 'FAIL: RPC разрешил ответить за другого пользователя';
  exception when no_data_found then null;
  end;
  begin
    perform public.record_review(current_setting('test.card_a')::uuid, 1, 'invalid', 3,
      now() + interval '3 days', 1, 0, 0, now());
    raise exception 'FAIL: принята неизвестная оценка';
  exception when invalid_parameter_value then null;
  end;
  begin
    insert into public.review_logs(card_id, rating, previous_interval, new_interval, reviewed_at)
      values (current_setting('test.card_a')::uuid, 'good', 0, 3, now());
    raise exception 'FAIL: разрешена прямая вставка журнала';
  exception when insufficient_privilege then null;
  end;

  insert into public.notification_settings(timezone) values ('Europe/Moscow');
  update public.notification_settings set per_day = 7 where user_id = auth.uid();
  begin
    update public.notification_settings set timezone = 'Mars/Olympus' where user_id = auth.uid();
    raise exception 'FAIL: принят несуществующий часовой пояс';
  exception when invalid_parameter_value then null;
  end;
  begin
    update public.notification_settings set quiet_start = '22:00' where user_id = auth.uid();
    raise exception 'FAIL: принят неполный интервал тишины';
  exception when check_violation then null;
  end;
  begin
    update public.notification_settings set user_id = current_setting('test.user_b')::uuid
      where user_id = auth.uid();
    raise exception 'FAIL: разрешена подмена владельца настроек';
  exception when insufficient_privilege then null;
  end;

  insert into public.push_subscriptions(endpoint, p256dh, auth)
    values ('https://push.example.invalid/test-a', 'test-key', 'test-auth');
  update public.push_subscriptions set user_agent = 'Тест' where user_id = auth.uid();
  begin
    insert into public.push_subscriptions(user_id, endpoint, p256dh, auth)
      values (current_setting('test.user_b')::uuid,
        'https://push.example.invalid/forged', 'test-key', 'test-auth');
    raise exception 'FAIL: разрешена чужая подписка';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.notification_schedule;
    raise exception 'FAIL: клиенту доступно расписание';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Искусственная ошибка журнала доказывает откат обновления карточки.
reset role;
create function app_private.test_reject_review_log()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Тестовая ошибка журнала' using errcode = '23514';
end;
$$;
create trigger test_reject_review_log before insert on public.review_logs
for each row execute function app_private.test_reject_review_log();

set local role authenticated;
do $$
begin
  begin
    perform public.record_review(current_setting('test.card_a')::uuid, 1, 'hard', 4,
      now() + interval '4 days', 2, 0, 1, now());
    raise exception 'FAIL: ожидалась ошибка журнала';
  exception when check_violation then null;
  end;
  if not exists (select 1 from public.cards where id = current_setting('test.card_a')::uuid
                 and revision = 1 and interval_days = 3 and hard_count = 0) then
    raise exception 'FAIL: карточка изменилась без записи журнала';
  end if;
end;
$$;
reset role;
drop trigger test_reject_review_log on public.review_logs;
drop function app_private.test_reject_review_log();

set local role authenticated;
do $$
declare
  reviewed public.cards%rowtype;
begin
  select * into reviewed from public.record_review(
    current_setting('test.card_a')::uuid, 1, 'hard', 4,
    now() + interval '4 days', 2, 0, 1, now());
  if reviewed.interval_days <> 4 or reviewed.revision <> 2 or reviewed.hard_count <> 1 then
    raise exception 'FAIL: не сохранена оценка «Сложно»';
  end if;
  select * into reviewed from public.record_review(
    current_setting('test.card_a')::uuid, 2, 'again', 0,
    now() + interval '10 minutes', 0, 1, 1, now());
  if reviewed.interval_days <> 0 or reviewed.revision <> 3
     or reviewed.repetitions <> 0 or reviewed.lapses <> 1 then
    raise exception 'FAIL: не сохранена оценка «Не знаю»';
  end if;
  if (select count(*) from public.review_logs where card_id = reviewed.id) <> 3 then
    raise exception 'FAIL: ожидалось три ответа в журнале';
  end if;
end;
$$;

-- Другой пользователь не видит журнал, настройки и подписки пользователя A.
select set_config('request.jwt.claim.sub', current_setting('test.user_b'), true);
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.user_b'), 'role', 'authenticated')::text, true);
do $$
begin
  if exists (select 1 from public.review_logs where user_id = current_setting('test.user_a')::uuid)
     or exists (select 1 from public.notification_settings where user_id = current_setting('test.user_a')::uuid)
     or exists (select 1 from public.push_subscriptions where user_id = current_setting('test.user_a')::uuid) then
    raise exception 'FAIL: другому пользователю видны журнал, настройки или подписки';
  end if;
end;
$$;

reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.cards;
    raise exception 'FAIL: карточки доступны без входа';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_review(current_setting('test.card_a')::uuid, 3, 'good', 3,
      now() + interval '3 days', 1, 1, 1, now());
    raise exception 'FAIL: RPC доступен без входа';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role service_role;
insert into public.notification_schedule(user_id, plan_date, slot, fire_at)
  values (current_setting('test.user_a')::uuid, current_date, 1, now());
do $$
begin
  if not exists (select 1 from public.notification_schedule
                 where user_id = current_setting('test.user_a')::uuid) then
    raise exception 'FAIL: service role не может работать с расписанием';
  end if;
end;
$$;
reset role;

select 'OK: RLS, права, чужие колоды, RPC, версии и атомарный откат проверены' as result;
rollback;
