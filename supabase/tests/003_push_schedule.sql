-- Выполнить целиком после миграции push. В конце все тестовые данные откатываются.
begin;
select set_config('test.push_user', gen_random_uuid()::text, true);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
insert into auth.users(id, email) values (current_setting('test.push_user')::uuid,
  current_setting('test.push_user') || '@example.invalid');
insert into public.decks(user_id, name) values (current_setting('test.push_user')::uuid, 'Тест push');
insert into public.cards(user_id, deck_id, question, answer, due_at, lapses)
  select d.user_id, d.id, 'Тестовый вопрос ' || i, 'Ответ', '2026-11-15 00:00+00', i
  from public.decks d cross join generate_series(1, 3) i where d.user_id = current_setting('test.push_user')::uuid;
insert into public.notification_settings(user_id, enabled, timezone)
  values (current_setting('test.push_user')::uuid, true, 'Europe/Moscow');
insert into public.push_subscriptions(user_id, endpoint, p256dh, auth)
  values (current_setting('test.push_user')::uuid, 'https://fcm.googleapis.com/fcm/send/only-a-test', 'test-key', 'test-auth');

do $$ begin
  if (select count(*) from app_private.push_minutes('2026-03-08', 'America/New_York',
      '01:00', '04:00', null, null, '2026-03-07 00:00+00')) <> 120 then
    raise exception 'FAIL: весенний DST должен исключить несуществующий час';
  end if;
  if (select count(*) from app_private.push_minutes('2026-11-01', 'America/New_York',
      '01:00', '02:00', null, null, '2026-10-31 00:00+00')) <> 120 then
    raise exception 'FAIL: осенний повторяющийся час имеет два UTC-интервала';
  end if;
  if (select count(*) from app_private.push_minutes('2026-11-16', 'Europe/Moscow',
      '09:00', '20:00', '12:00', '14:00', '2026-11-15 00:00+00')) <> 540 then
    raise exception 'FAIL: не исключён режим тишины';
  end if;
  if (select count(*) from app_private.push_minutes('2026-11-16', 'Europe/Moscow',
      '22:00', '08:00', '23:00', '07:00', '2026-11-15 00:00+00')) <> 120 then
    raise exception 'FAIL: окно или тишина через полночь';
  end if;
end; $$;

set local role service_role;
do $$
declare
  uid uuid := current_setting('test.push_user')::uuid;
  count_inserted integer; first_job public.notification_schedule%rowtype;
  second_job public.notification_schedule%rowtype; prepared jsonb;
begin
  count_inserted := public.plan_push_schedule(uid, '2026-11-16 00:00+00');
  if count_inserted <> 10 then raise exception 'FAIL: должны планироваться сегодня и завтра'; end if;
  if public.plan_push_schedule(uid, '2026-11-16 00:00+00') <> 0 then
    raise exception 'FAIL: повторное планирование не идемпотентно';
  end if;
  if (select count(*) from public.notification_schedule where user_id = uid) <> 10 then
    raise exception 'FAIL: дубли расписания';
  end if;
  if exists (select 1 from public.notification_schedule n where n.user_id = uid
      and ((n.fire_at at time zone 'Europe/Moscow')::date <> n.plan_date
      or not app_private.in_push_window((n.fire_at at time zone 'Europe/Moscow')::time, '09:00', '20:00'))) then
    raise exception 'FAIL: неверная локальная дата или окно';
  end if;
  if exists (select 1 from public.notification_schedule where user_id = uid
      group by plan_date, fire_at having count(*) > 1) then
    raise exception 'FAIL: для одного пользователя выбрана одинаковая минута';
  end if;

  select * into first_job from public.notification_schedule where user_id = uid order by fire_at limit 1;
  select * into first_job from public.claim_due_pushes(1, first_job.fire_at);
  if first_job.id is null or first_job.status <> 'processing' then raise exception 'FAIL: claim'; end if;
  select * into second_job from public.claim_due_pushes(1, first_job.fire_at);
  if second_job.id = first_job.id then raise exception 'FAIL: processing взят повторно'; end if;
  prepared := public.prepare_due_push(first_job.id, first_job.claimed_at, first_job.fire_at);
  if prepared->'card'->>'id' is null or jsonb_array_length(prepared->'subscriptions') <> 1 then
    raise exception 'FAIL: выбор карточки и всех устройств';
  end if;
  perform public.finish_push(first_job.id, first_job.claimed_at, true);
  if not exists (select 1 from public.notification_schedule where id = first_job.id
      and status = 'sent' and sent_at is not null) then raise exception 'FAIL: статус sent'; end if;

  -- Настройки перестраивают только будущие/непопытавшиеся слоты, сохраняя уже отправленные.
  update public.notification_settings set quiet_start = '12:00', quiet_end = '14:00' where user_id = uid;
  perform public.plan_push_schedule(uid, '2026-11-16 00:00+00');
  if (select count(*) from public.notification_schedule where user_id = uid and plan_date = '2026-11-16') <> 5 then
    raise exception 'FAIL: дневной бюджет после изменения настроек';
  end if;
  if not exists (select 1 from public.notification_schedule where id = first_job.id and status = 'sent') then
    raise exception 'FAIL: отправленный слот удалён при перестроении';
  end if;
  if exists (select 1 from public.notification_schedule where user_id = uid and status = 'pending'
    and app_private.in_push_window((fire_at at time zone 'Europe/Moscow')::time, '12:00', '14:00')) then
    raise exception 'FAIL: новый план попал в тишину';
  end if;

  -- Зависший processing закрывается, повторного claim нет.
  update public.notification_schedule set status = 'processing', claimed_at = '2026-11-16 00:00+00'
    where user_id = uid and status = 'pending';
  perform public.claim_due_pushes(1, '2026-11-16 00:11+00');
  if exists (select 1 from public.notification_schedule where user_id = uid and status = 'processing'
      and claimed_at = '2026-11-16 00:00+00') then raise exception 'FAIL: зависшие строки не закрыты'; end if;
  if not exists (select 1 from public.notification_schedule where user_id = uid and skip_reason = 'stale_processing') then
    raise exception 'FAIL: отсутствует причина закрытия processing';
  end if;
  if not public.claim_test_push(uid) or public.claim_test_push(uid) then
    raise exception 'FAIL: ограничение тестового push';
  end if;
end; $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.push_user'), true);
do $$ begin
  begin
    perform public.claim_due_pushes();
    raise exception 'FAIL: клиенту доступен захват расписания';
  exception when insufficient_privilege then null; end;
  begin
    perform public.plan_push_schedule();
    raise exception 'FAIL: клиенту доступно планирование';
  exception when insufficient_privilege then null; end;
  begin
    perform public.claim_test_push(auth.uid());
    raise exception 'FAIL: клиент обходит ограничитель теста';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from app_private.push_test_limits;
    raise exception 'FAIL: приватный ограничитель доступен клиенту';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
select 'OK: DST, тихое окно, локальная дата, идемпотентность, claim, sent, stale и права проверены' as result;
rollback;
