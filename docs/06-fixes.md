# Исправления ревью — этап 1 (пункты 1–3)

Корень проекта: `/Users/roman/Documents/Codex/test/question-cards`.
Выполнен только первый этап. Пункты 4–6, затем 7–8, а также дополнительные 9–11 ещё не реализованы.
После установки и проверки этого этапа напиши **«готово»** — продолжим пункты 4–6.

## Статус и совместимость

Изменения подготовлены и проверены локально. **В рабочий Supabase эта миграция не применялась, функции не развёртывались.**
Секреты, реальные ключи и приватные файлы не читались и не изменялись.
Дизайн, тексты интерфейса, клиентский `record_review`, его параметры, Auth и service worker не менялись.
Ранее применённые миграции сохранены без изменений. Новые колонки допускают null, дополнительные JSON-поля не мешают старому PWA.

## Что изменено

1. `cards.last_pushed_at` меняется только при успешном `finish_push`, одновременно со статусом слота.
   Выбранный `card_id` сохраняется в расписании при `prepare_due_push`.
   Константа `c_push_cooldown` в SQL равна 6 часам: плановая отправка исключает карточку до истечения паузы.
   Тестовая кнопка обходит паузу и не меняет поле. Если кандидатов нет, слот — `skipped/no_cards`.
   В приоритете учитывается максимум 5 lapses и 5 hard_count, случайный множитель 0.8–1.2 сохранён.
   Параллельный выбор для одного пользователя сериализуется блокировкой настроек; уже подготовленная карточка зарезервирована через `processing/card_id`.
   Неудачный или зависший слот освобождает резерв, не начинает cooldown.
2. `PUSH_TTL_SECONDS = 900`: push-служба может держать сообщение 15 минут при коротком отсутствии связи.
   Правило сервера `late` при опоздании больше 5 минут сохранено: оно проверяется **до** отправки.
3. Каждое задание обрабатывается в собственном try/catch. После сбоя вызывается `finish_push(..., false)` в отдельном try/catch.
   Остальные задания продолжаются. Логи содержат только постоянные коды `push_job_failed`/`push_job_finish_failed`.
   Ответ отправителя сохраняет `ok`, `claimed`, `completed` и добавляет `failed` — число заданий с исключением обработки.
   Обычный `skipped/no_cards` не считается сбоем. Если все устройства отклонили доставку без исключения обработки, слот остаётся `skipped/delivery_failed`.

У старых отправок `card_id` неизвестен: миграция не восстанавливает историю по догадке.
Поэтому cooldown начинает действовать после первой успешной плановой отправки новой версии.
Несколько разных карточек с одинаковым текстом всё равно являются разными карточками; тестируй на различимых вопросах.

## Файлы

Все пути ниже — от корня проекта; полный код каждого нового/изменённого файла приведён в конце документа.

| Путь | Назначение |
| --- | --- |
| `supabase/migrations/20261116200118_push_review_stage_one.sql` | Новые колонки, индекс, замена трёх серверных RPC без смены сигнатур |
| `supabase/functions/_shared/push.ts` | TTL 900 секунд |
| `supabase/functions/_shared/batch.js` | Независимая обработка заданий |
| `supabase/functions/send-due-pushes/index.ts` | Вызов обработчика пачки |
| `supabase/functions/push_test.ts` | Проверка настоящего TTL в Web Push-запросе и шифрования |
| `supabase/functions/batch_test.ts` | Ошибки prepare, deliver, finish и продолжение пачки |
| `supabase/tests/005_push_cooldown.sql` | SQL-тест с полным откатом |
| `tests/push-batch.test.mjs` | Node-тест пачки и счётчиков ответа |
| `scripts/test-sql.mjs` | Воспроизводимый прогон SQL в изолированном PGlite |
| `supabase/rollbacks/006_push_stage_one.sql` | Код для новой миграции отката; данные не удаляет |
| `README.md`, `docs/04-push.md`, `docs/05-checklist.md` | Статус и описание изменённого поведения |
| `docs/06-fixes.md` | Этот документ |

## 1. Установи миграцию

1. В Supabase открой проект **question-cards → SQL Editor → New**.
2. Открой локальный файл `supabase/migrations/20261116200118_push_review_stage_one.sql`.
3. Скопируй **весь** файл, включая `begin;` и `commit;`, в SQL Editor. Нажми **Run**.
4. Если появилось подтверждение изменений, проверь имя проекта и SQL, затем **Run query**.
5. Ожидается успешное выполнение. Применяй миграцию один раз, не изменяй её после применения.
6. В новой вкладке SQL Editor вставь **весь** `supabase/tests/005_push_cooldown.sql` и нажми **Run**.
   Ожидается `OK: cooldown 6 часов, резервирование, успешный finish, тестовый обход, cap 5 и права проверены`.
   В конце тест откатывает все свои данные и не отправляет уведомлений.

RPC `choose_push_card`, `prepare_due_push` и `finish_push` заменяются через CREATE OR REPLACE с прежними параметрами.
`record_review` на этом этапе вообще не меняется.
[Инструкция Supabase по SQL-функциям](https://supabase.com/docs/guides/database/functions).

## 2. Разверни две Edge Functions

Нужно обновить **send-due-pushes** и **test-push**, потому что обе используют общий модуль отправки с TTL.
`plan-schedule` на этом этапе не меняется. Cron, Secrets и Vault оставь как есть.

Команда проверена по справке установленного Supabase CLI **3.1.0**. CLI находится на этом Mac в `/private/tmp/recard-devtools/supabase`:

```sh
cd /Users/roman/Documents/Codex/test/question-cards
/private/tmp/recard-devtools/supabase functions deploy send-due-pushes test-push --remote=nvirttjdirfzsormbcun --use-api --no-verify-jwt
```

Если CLI сообщает, что вход не выполнен, сначала:

```sh
/private/tmp/recard-devtools/supabase login
```

Затем повтори deploy. Если временный каталог уже очищен, установи Supabase CLI 3.1.0 обычным способом и замени путь на `supabase`.
`--no-verify-jwt` соответствует существующей конфигурации: отправитель проверяет cron secret, тест проверяет JWT через Auth внутри функции.
Не используй `--prune`. Не меняй секреты или VAPID.

В панели **Edge Functions** должны остаться те же три функции. У двух обновлённых функций появится новая версия.
Открой **send-due-pushes → Logs**: следующий cron-вызов должен завершиться 200; в ответе появилось `failed`.
Тело ответа не обязательно доступно в Logs, поэтому `failed` проверяется тестом обработчика, а результат доставки — статусами SQL.

CLI-команда развёртывания в этой среде не выполнялась: работающий сервер и установленное PWA не менялись автоматически.

## 3. Dev → main

Код сохранён в dev. Этот этап не меняет файлы интерфейса, так что переустановка PWA не нужна.
GitHub Pages не развёртывает Edge Functions и SQL: шаги выше обязательны отдельно.

1. GitHub → **question-cards → Pull requests → New pull request**.
2. **base: main**, **compare: dev → Create pull request**.
3. Проверь изменения → **Merge pull request → Confirm merge**.
4. В **Actions** дождись успешной публикации Pages.

## 4. Проверка на iPhone

1. Открой прежнюю установленную иконку, войди при необходимости. Убедись, что колоды и карточки доступны.
2. **Настройки → Уведомления**: прежнее включение, окно, тихие часы и колоды сохранены.
3. Нажми **Отправить тестовое уведомление**. Через минуту можно повторить: тест вправе выбрать тот же вопрос.
4. Нажми push: должна открыться нужная карточка. Раскрой ответ и поставь оценку — сразу открывается следующая.
5. Для проверки разнообразия оставь несколько карточек с разными вопросами, срок которых наступил, в участвующей колоде.
   Дождись двух плановых слотов. Успешно отправленная карточка не должна повториться в течение 6 часов.
6. Если подходит только одна карточка, после её первой успешной плановой отправки следующие слоты за эти 6 часов будут `skipped/no_cards`.
   Это ожидаемый результат, а не поломка push.
7. Проверь выход и повторный вход. На экране уведомлений при необходимости нажми существующую кнопку подключения устройства.

Прямые соседние слоты и точная граница 6 часов проверены SQL-тестом. Не нужно ждать 6 часов ради базовой проверки.
TTL 15 минут проверен по реальному заголовку в Deno-тесте; задержка доставки на физическом iPhone этим тестом не имитировалась.
Замена старого уведомления одной плашкой — будущий пункт 9; сейчас service worker не изменён.

## 5. Выполненные проверки

- 29 Node-тестов: алгоритм, PWA, подписки и новый обработчик пачки.
- 8 Deno-тестов: настоящие VAPID/RFC 8291, TTL 900, мёртвая подписка, Auth/CORS и сбои отдельных заданий.
- Deno check трёх entrypoint прошёл.
- SQL 001, 003 и новый 005 прошли в PostgreSQL 18.6 (PGlite 0.5.16). После каждого теста проверено отсутствие тестовых пользователей.
- Код отката применён к изолированной БД: прежние RPC восстановлены, колонки сохранены.
- Применённые миграции не редактировались. Файлы интерфейса не менялись.

Ограничения проверки: PGlite — изолированный PostgreSQL с тестовыми Auth-ролями, не настоящий Supabase Runtime.
В рабочей БД новая миграция/SQL-тест ещё не запускались. Настоящие push после изменения и проверку физического iPhone нужно выполнить по шагам выше.
Браузерный прогон на этом этапе не повторялся: изменён только сервер, существующие Node-тесты worker/ссылок прошли.

Команды тестов:

```sh
node --test tests/*.test.mjs
deno test --allow-env --config supabase/functions/deno.json supabase/functions/push_test.ts supabase/functions/batch_test.ts
deno check --config supabase/functions/deno.json supabase/functions/send-due-pushes/index.ts supabase/functions/test-push/index.ts supabase/functions/plan-schedule/index.ts
```

Для локального SQL нужен отдельный инструмент `@electric-sql/pglite@0.5.16`, приложение его не использует.
В этой среде полный прогон выполнен так:

```sh
PGLITE_MODULE=file:///private/tmp/recard-devtools/pglite/package/dist/index.js /Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node scripts/test-sql.mjs
```

Расширения cron/net в PGlite не эмулируются: скрипт пропускает только миграцию их включения.
Для настоящего Supabase используй SQL Editor и полный файл теста, как в шаге 1.

## 6. Откат без удаления данных

Не редактируй и не удаляй уже применённую миграцию.

1. Создай **новую** миграцию:

```sh
/private/tmp/recard-devtools/supabase migration new rollback_push_review_stage_one
```

2. В созданный файл с новой меткой времени скопируй весь код из `supabase/rollbacks/006_push_stage_one.sql`.
   Затем выполни весь новый файл через **SQL Editor → New → Run**.
   Он восстановит прежние три RPC, оставит новые колонки и сохранённую историю на месте.
3. Если нужно вернуть и прежний TTL/отправитель, восстанови только файлы функций и их прежний тест из исходного коммита:

```sh
git restore --source=c8d6307 -- supabase/functions/_shared/push.ts supabase/functions/send-due-pushes/index.ts supabase/functions/push_test.ts
/private/tmp/recard-devtools/supabase functions deploy send-due-pushes test-push --remote=nvirttjdirfzsormbcun --use-api --no-verify-jwt
```

4. Сохрани новую миграцию отката и восстановленные исходники отдельным коммитом в dev, затем слей dev → main обычным PR.
   Не делай git revert всей миграции: история уже применённых файлов должна остаться неизменной.
   Новый `batch.js` после такого отката не импортируется и не влияет на работу.

Старое поведение вновь допускает повтор одного вопроса. Новые колонки не удаляются, карточки/ответы/подписки не затрагиваются.
Если миграция ещё не применена и функции ещё не развёрнуты, серверу откат не требуется.

## Полный код файлов этапа 1

Ниже весь код новых/изменённых файлов; сам этот документ уже приведён выше.

### /Users/roman/Documents/Codex/test/question-cards/supabase/migrations/20261116200118_push_review_stage_one.sql

~~~~~sql
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
~~~~~

### /Users/roman/Documents/Codex/test/question-cards/supabase/functions/_shared/push.ts

~~~~~typescript
import { ApplicationServer, importVapidKeys, PushMessageError, Urgency } from 'jsr:@negrel/webpush@0.5.0';
import { admin, cardUrl, required } from './core.ts';
import { supportedPushEndpoint } from '../../../js/push-utils.js';

export interface Subscription { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }
export interface Card { id: string; question: string; deck_name: string }

export const allowedEndpoint = supportedPushEndpoint;
// Даём телефону до 15 минут на краткий обрыв связи. Проверка опоздания слота
// на сервере остаётся прежней: больше 5 минут — пропуск до отправки.
export const PUSH_TTL_SECONDS = 900;

// Библиотека использует глобальный Fetch API. Ограничение касается только её
// VAPID-запросов; запросы Supabase/Auth остаются обычными.
const fetchTransport = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  if (headers.get('Authorization')?.startsWith('vapid ')) {
    const endpoint = input instanceof Request ? input.url : String(input);
    if (!allowedEndpoint(endpoint)) return Promise.reject(new Error('unsupported_push_endpoint'));
    return fetchTransport(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(8_000) });
  }
  return fetchTransport(input, init);
};

let serverPromise: Promise<ApplicationServer> | null = null;
function server(): Promise<ApplicationServer> {
  serverPromise ??= (async () => {
    const privateKey = JSON.parse(required('VAPID_PRIVATE_JWK'));
    const publicKey = { kty: privateKey.kty, crv: privateKey.crv, x: privateKey.x, y: privateKey.y, key_ops: ['verify'], ext: true };
    const vapidKeys = await importVapidKeys({ publicKey, privateKey });
    return ApplicationServer.new({ contactInformation: required('VAPID_SUBJECT'), vapidKeys });
  })().catch(error => { serverPromise = null; throw error; });
  return serverPromise;
}

export function pushPayload(card: Card): string {
  const payload = { title: card.deck_name, body: card.question, url: cardUrl(card.id) };
  const bytes = () => new TextEncoder().encode(JSON.stringify(payload)).length;
  // Ограничение Web Push — байты UTF-8, а не число символов. Полный вопрос остаётся в приложении.
  if (bytes() > 3993) {
    payload.title = Array.from(payload.title).slice(0, 120).join('');
    const question = Array.from(payload.body);
    let low = 0, high = question.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      payload.body = question.slice(0, middle).join('') + '…';
      if (bytes() <= 3993) low = middle; else high = middle - 1;
    }
    payload.body = question.slice(0, low).join('') + '…';
  }
  return JSON.stringify(payload);
}

export async function deliver(card: Card, subscriptions: Subscription[], topic: string) {
  const application = await server();
  const message = pushPayload(card);
  let sent = 0, removed = 0;
  // Один payload для всех устройств. Одновременно не более четырёх отправок.
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, subscriptions.length) }, async () => {
    while (next < subscriptions.length) {
      const subscription = subscriptions[next++];
      try {
        if (!allowedEndpoint(subscription.endpoint)) continue;
        const subscriber = application.subscribe({ endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth } });
        await subscriber.pushTextMessage(message, { ttl: PUSH_TTL_SECONDS, urgency: Urgency.High, topic: topic.replace(/-/g, '').slice(0, 32) });
        sent += 1;
      } catch (error) {
        const status = error instanceof PushMessageError ? error.response.status : 0;
        if (status === 404 || status === 410) {
          const filters = new URLSearchParams({ id: `eq.${subscription.id}`, user_id: `eq.${subscription.user_id}`, endpoint: `eq.${subscription.endpoint}` });
          try {
            await admin(`push_subscriptions?${filters}`, { method: 'DELETE' });
            removed += 1;
          } catch { console.error('subscription_cleanup_failed'); }
        } else console.error('push_device_failed', status);
      }
    }
  }));
  return { sent, removed };
}
~~~~~

### /Users/roman/Documents/Codex/test/question-cards/supabase/functions/_shared/batch.js

~~~~~javascript
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
~~~~~

### /Users/roman/Documents/Codex/test/question-cards/supabase/functions/send-due-pushes/index.ts

~~~~~typescript
import { authenticateCron, handler, rpc } from '../_shared/core.ts';
import { deliver } from '../_shared/push.ts';
import { processPushJobs } from '../_shared/batch.js';

Deno.serve(handler(async request => {
  await authenticateCron(request);
  const jobs = await rpc('claim_due_pushes', { p_limit: 20 });
  return processPushJobs(jobs, { rpc, deliver });
}));
~~~~~

### /Users/roman/Documents/Codex/test/question-cards/supabase/functions/push_test.ts

~~~~~typescript
// Проверка настоящего шифрования библиотеки. Сетевые запросы заменены тестовым fetch.
const calls: { url: string; init: RequestInit }[] = [];
let dead = false;
globalThis.fetch = (input, init = {}) => {
  const url = input instanceof Request ? input.url : String(input);
  calls.push({ url, init });
  if (url.startsWith('https://database.example/')) return Promise.resolve(new Response(null, { status: 204 }));
  return Promise.resolve(new Response(null, { status: dead && url.includes('dead') ? 410 : 201 }));
};
const vapid = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
Deno.env.set('VAPID_PRIVATE_JWK', JSON.stringify(await crypto.subtle.exportKey('jwk', vapid.privateKey)));
Deno.env.set('VAPID_SUBJECT', 'https://example.com');
Deno.env.set('APP_ORIGIN', 'https://example.com');
Deno.env.set('SUPABASE_URL', 'https://database.example');
Deno.env.set('SUPABASE_SECRET_KEYS', JSON.stringify({ default: 'test-secret' }));

const { deliver, pushPayload, PUSH_TTL_SECONDS } = await import('./_shared/push.ts');
const { handler, authenticatedUser } = await import('./_shared/core.ts');
const { decodeApplicationKey } = await import('../../js/push-utils.js');
function assert(value: unknown, message = 'assertion failed'): asserts value { if (!value) throw new Error(message); }
const encode = (value: Uint8Array) => btoa(String.fromCharCode(...value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
const auth = crypto.getRandomValues(new Uint8Array(16));
const card = { id: '22222222-2222-4222-8222-222222222222', question: 'Что такое угол сноса?', deck_name: 'Навигация' };
const subscription = { id: '33333333-3333-4333-8333-333333333333', user_id: 'user-a',
  endpoint: 'https://fcm.googleapis.com/fcm/send/test', p256dh: encode(uaPublic), auth: encode(auth) };

async function hkdf(key: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number) {
  const material = await crypto.subtle.importKey('raw', new Uint8Array(key), 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(salt), info: new Uint8Array(info) }, material, length * 8));
}
function concat(...parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length; } return result;
}

Deno.test('VAPID проверяется, payload расшифровывается как RFC 8291', async () => {
  const result = await deliver(card, [subscription], 'test-topic');
  assert(result.sent === 1);
  const sent = calls.find(call => call.url === subscription.endpoint)!;
  const headers = new Headers(sent.init.headers);
  assert(headers.get('Content-Encoding') === 'aes128gcm');
  assert(PUSH_TTL_SECONDS === 900 && headers.get('TTL') === '900');
  assert(sent.init.redirect === 'error');
  const authorization = headers.get('Authorization')!;
  const token = authorization.match(/t=([^,]+)/)![1];
  const [head, body, signature] = token.split('.');
  const claims = JSON.parse(new TextDecoder().decode(decodeApplicationKey(body)));
  assert(claims.aud === new URL(subscription.endpoint).origin);
  assert(claims.sub === 'https://example.com');
  assert(claims.exp * 1000 > Date.now() && claims.exp * 1000 < Date.now() + 24 * 3600_000);
  assert(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vapid.publicKey,
    decodeApplicationKey(signature), new TextEncoder().encode(`${head}.${body}`)));

  const encrypted = new Uint8Array(sent.init.body as ArrayBuffer);
  const salt = encrypted.slice(0, 16);
  const keyLength = encrypted[20];
  assert(keyLength === 65);
  const serverRaw = encrypted.slice(21, 21 + keyLength);
  const serverPublic = await crypto.subtle.importKey('raw', serverRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: serverPublic }, ua.privateKey, 256));
  const utf8 = new TextEncoder();
  const ikm = await hkdf(secret, auth, concat(utf8.encode('WebPush: info\0'), uaPublic, serverRaw), 32);
  const cek = await hkdf(ikm, salt, utf8.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(ikm, salt, utf8.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, encrypted.slice(21 + keyLength)));
  assert(plaintext.at(-1) === 2);
  const payload = JSON.parse(new TextDecoder().decode(plaintext.slice(0, -1)));
  assert(payload.title === card.deck_name && payload.body === card.question);
  assert(payload.url === `https://example.com/question-cards/?card=${card.id}&src=push`);
});

Deno.test('длинный кириллический вопрос укладывается в предел UTF-8 Web Push', () => {
  const payload = pushPayload({ ...card, question: 'Я🙂'.repeat(5000), deck_name: 'Колода'.repeat(500) });
  assert(new TextEncoder().encode(payload).length <= 3993);
  assert(JSON.parse(payload).body.endsWith('…'));
});

Deno.test('410 удаляет только конкретную подписку, успех другого устройства сохраняется', async () => {
  dead = true;
  const result = await deliver(card, [{ ...subscription, endpoint: subscription.endpoint + '-dead' }, subscription], 'next-topic');
  assert(result.sent === 1 && result.removed === 1);
  const deleted = calls.filter(call => call.init.method === 'DELETE').at(-1)!;
  const url = new URL(deleted.url);
  assert(url.searchParams.get('user_id') === 'eq.user-a');
  assert(url.searchParams.get('endpoint') === `eq.${subscription.endpoint}-dead`);
});

Deno.test('endpoint другого домена не получает ни запрос, ни VAPID', async () => {
  const before = calls.length;
  const result = await deliver(card, [{ ...subscription, endpoint: 'https://127.0.0.1/private' }], 'blocked');
  assert(result.sent === 0 && calls.length === before);
});

Deno.test('test-push требует JWT, CORS не открывает произвольный origin', async () => {
  const endpoint = handler(async request => ({ user: await authenticatedUser(request) }), true);
  const unauthorized = await endpoint(new Request('https://example.com', { method: 'POST' }));
  assert(unauthorized.status === 401);
  const cors = await endpoint(new Request('https://example.com', { method: 'OPTIONS', headers: { Origin: 'https://example.com' } }));
  assert(cors.status === 204 && cors.headers.get('Access-Control-Allow-Origin') === 'https://example.com');
  const blocked = await endpoint(new Request('https://example.com', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }));
  assert(blocked.status === 403);
});
~~~~~

### /Users/roman/Documents/Codex/test/question-cards/supabase/functions/batch_test.ts

~~~~~typescript
import { processPushJobs } from './_shared/batch.js';

function assert(value: unknown, message = 'assertion failed'): asserts value { if (!value) throw new Error(message); }
const jobs = Array.from({ length: 7 }, (_, index) => ({ id: String(index), claimed_at: '2026-11-16T12:00:00Z' }));

Deno.test('сбой prepare одного задания не мешает остальной пачке; finish(false) вызывается', async () => {
  const finishes: Record<string, unknown>[] = [], logs: string[] = [], deliveries: string[] = [];
  const result = await processPushJobs(jobs, {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === 'finish_push') { finishes.push(args); return; }
      if (args.p_id === '0') throw new Error('PRIVATE: endpoint/card/secret');
      if (args.p_id === '1') return null;
      return { card: { id: args.p_id }, subscriptions: [] };
    },
    deliver: async (_card: unknown, _subscriptions: unknown, id: string) => { deliveries.push(id); return { sent: 1 }; },
    log: (code: string) => logs.push(code),
  });
  assert(result.claimed === 7 && result.completed === 5 && result.failed === 1);
  assert(deliveries.length === 5 && deliveries.includes('6'));
  assert(finishes.some(args => args.p_id === '0' && args.p_sent === false));
  assert(logs.join(',') === 'push_job_failed');
});

Deno.test('падение deliver и повторного finish не останавливает другие задания', async () => {
  const logs: string[] = [], attempts: Record<string, unknown>[] = [];
  const result = await processPushJobs(jobs, {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === 'prepare_due_push') return { card: { id: args.p_id }, subscriptions: [] };
      attempts.push(args);
      if (args.p_id === '0') throw new Error('PRIVATE database error');
    },
    deliver: async (card: { id: string }) => {
      if (card.id === '0') throw new Error('PRIVATE question');
      return { sent: 1 };
    },
    log: (code: string) => logs.push(code),
  });
  assert(result.completed === 6 && result.failed === 1);
  assert(attempts.some(args => args.p_id === '0' && args.p_sent === false));
  assert(logs.join(',') === 'push_job_failed,push_job_finish_failed');
});

Deno.test('сбой успешного finish вызывает защищённый finish(false), failed считается один раз', async () => {
  const calls: boolean[] = [];
  const result = await processPushJobs(jobs.slice(0, 1), {
    rpc: async (name: string, args: { p_sent?: boolean }) => {
      if (name === 'prepare_due_push') return { card: {}, subscriptions: [] };
      calls.push(args.p_sent!);
      if (args.p_sent) throw new Error('database response lost');
    },
    deliver: async () => ({ sent: 1 }), log: () => {},
  });
  assert(result.completed === 0 && result.failed === 1);
  assert(JSON.stringify(calls) === '[true,false]');
});
~~~~~

### /Users/roman/Documents/Codex/test/question-cards/supabase/tests/005_push_cooldown.sql

~~~~~sql
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
~~~~~

### /Users/roman/Documents/Codex/test/question-cards/tests/push-batch.test.mjs

~~~~~javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { processPushJobs } from '../supabase/functions/_shared/batch.js';

test('пачка продолжает работу после сбоя; failed не включает обычный skipped', async () => {
  const calls = [], logs = [];
  const jobs = Array.from({ length: 6 }, (_, id) => ({ id, claimed_at: 'claim-token' }));
  const result = await processPushJobs(jobs, {
    async rpc(name, args) {
      calls.push({ name, ...args });
      if (name === 'finish_push') return;
      if (args.p_id === 1) throw new Error('sensitive text');
      if (args.p_id === 2) return null;
      return { card: { id: args.p_id }, subscriptions: [] };
    },
    deliver: async () => ({ sent: 1 }), log: code => logs.push(code),
  });
  assert.deepEqual(result, { ok: true, claimed: 6, completed: 4, failed: 1 });
  assert(calls.some(call => call.name === 'finish_push' && call.p_id === 1 && call.p_sent === false && call.p_claimed_at === 'claim-token'));
  assert(calls.some(call => call.name === 'finish_push' && call.p_id === 5 && call.p_sent === true));
  assert.deepEqual(logs, ['push_job_failed']);
});

test('пустая пачка и нулевая доставка завершаются без исключений', async () => {
  const empty = await processPushJobs([], { rpc: () => assert.fail(), deliver: () => assert.fail() });
  assert.deepEqual(empty, { ok: true, claimed: 0, completed: 0, failed: 0 });
  const finishes = [];
  const result = await processPushJobs([{ id: 'a', claimed_at: 'c' }], {
    async rpc(name, args) {
      if (name === 'prepare_due_push') return { card: {}, subscriptions: [] };
      finishes.push(args);
    },
    deliver: async () => ({ sent: 0 }),
  });
  assert.equal(result.completed, 1);
  assert.equal(finishes[0].p_sent, false);
});
~~~~~

### /Users/roman/Documents/Codex/test/question-cards/scripts/test-sql.mjs

~~~~~javascript
// Изолированный PostgreSQL WASM. Никаких подключений к рабочему Supabase.
// PGlite 0.5.16 — только инструмент тестирования, не зависимость приложения.
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const root = new URL('../', import.meta.url);
const db = new PGlite();
try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
  for (const file of (await readdir(new URL('supabase/migrations/', root))).sort()) {
    if (!file.endsWith('.sql') || file.endsWith('_enable_push_cron.sql')) continue;
    await db.exec(await readFile(new URL(`supabase/migrations/${file}`, root), 'utf8'));
  }
  for (const file of ['001_security_and_rpc.sql', '003_push_schedule.sql', '005_push_cooldown.sql']) {
    const result = await db.exec(await readFile(new URL(`supabase/tests/${file}`, root), 'utf8'));
    for (const item of result) if (item.rows?.[0]?.result) console.log(item.rows[0].result);
    const { rows } = await db.query('select count(*)::int as count from auth.users');
    if (rows[0].count !== 0) throw new Error(`ROLLBACK не сработал: ${file}`);
  }
  console.log('PASS: все SQL-тесты откатились; тестовых пользователей не осталось.');
  // Неудаляющий откат тоже проверяется на изолированной БД.
  await db.exec(await readFile(new URL('supabase/rollbacks/006_push_stage_one.sql', root), 'utf8'));
  const { rows } = await db.query(`select prolang = (select oid from pg_language where lanname='sql') as restored
    from pg_proc where oid = 'public.choose_push_card(uuid,boolean,timestamptz)'::regprocedure`);
  if (!rows[0].restored) throw new Error('Откат не восстановил прежний выбор карточки');
  console.log('PASS: откат восстановил прежние RPC; новые колонки и данные сохранены.');
} finally {
  await db.close();
}
~~~~~

### /Users/roman/Documents/Codex/test/question-cards/supabase/rollbacks/006_push_stage_one.sql

~~~~~sql
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
~~~~~

### /Users/roman/Documents/Codex/test/question-cards/README.md

~~~~~markdown
# Карточки

Статичное приложение для карточек с интервальным повторением.
HTML + CSS + JavaScript ES-модули, без сборки. Бэкенд — Supabase.

Этап 1 (база, RLS, RPC) проверен в Supabase.
Этап 2 (интерфейс и повторение) реализован и проверен пользователем в браузере.
Этап 3 (PWA) проверен пользователем на iPhone.
Этап 4 (push) реализован: миграция применена, три Edge Functions развёрнуты.
Секрет cron проверен, задания планирования и отправки включены.
Интерфейс опубликован. Пользователь подтвердил настоящий push на iPhone,
открытие нужной карточки и переход к следующей после оценки.
Автоматическая отправка по случайному расписанию подтверждена на iPhone:
уведомления на скриншоте совпали с серверными слотами 16.11.2026 в 21:07 и 21:29 МСК.
Этап 5: чек-лист и диагностика готовы; Android, настоящий push на компьютере
и несколько физических устройств пока требуют ручной проверки.

Исправления ревью: подготовлен этап 1 (пункты 1–3) — cooldown карточки 6 часов,
TTL 15 минут и независимая обработка сбоев в пачке. Применение — по docs/06-fixes.md;
эта подготовка сама по себе не обновляет работающие функции или базу.

## Запуск

```sh
python3 /Users/roman/Documents/Codex/test/question-cards/scripts/serve.py
```

Открой <http://localhost:8000/question-cards/>.
Сборка и npm install не нужны. Сервер Python используется только для локального просмотра.

## Инструкции

- [Этап 1: Supabase](docs/01-supabase.md)
- [Этап 2: запуск, проверка, GitHub Pages](docs/02-frontend.md)
- [Полный собственный код этапа 2](docs/02-full-code.md)
- [Этап 3: установка PWA](docs/03-pwa.md)
- [Полный собственный код этапа 3](docs/03-full-code.md)
- [Этап 4: ключи, cron и первый push](docs/04-push.md)
- [Полный собственный код этапа 4](docs/04-full-code.md)
- [Этап 5: устройства, расписание и типичные ошибки](docs/05-checklist.md)
- [SQL диагностики без изменения данных](supabase/tests/004_runtime_status.sql)
- [Исправления ревью: этапы, полный код, применение и откат](docs/06-fixes.md)
- [Исходные экраны](references/screens.html)
- [Правила дизайна](references/design-spec.md)

Единственная константа пути — BASE_PATH в js/config.js.
Project URL и предоставленный публичный publishable key сохранены там же.
Серверных ключей и паролей в проекте нет.
План переноса на moonhaze.ru — в инструкции этапа 1.

## Поведение

- «Учить» — карточки с наступившим сроком из всех колод.
- В колоде доступны «Все», «Новые», «К повторению», «Избранные».
- Ответ раскрывается сразу под вопросом; оценки доступны до раскрытия.
- После успешной записи оценки открывается следующий вопрос без промежуточного экрана.
- При ошибке связи карточка остаётся на экране.
- Алгоритм — отдельный чистый модуль js/algorithm.js.
- RPC обновляет карточку и журнал одной транзакцией; revision защищает от старого состояния.
- Новые определяются по отсутствию last_reviewed_at, а не по repetitions.
- Данные карточек не кешируются на устройстве; Auth хранит сессию SDK в localStorage.
- Только светлая тема. Lora, Manrope и SDK сохранены локально с лицензиями.
- Уведомления подключаются явным нажатием после создания трёх карточек.
- Вопрос выбирается при отправке, один payload идёт на все подписки пользователя.
- Расписание учитывает локальное окно, тихие часы и DST; серверные задачи защищены секретом.
- PWA устанавливается в отдельное окно. На iPhone есть инструкция Safari и определение standalone.
- Worker работает без офлайн-кеша; push открывает точную карточку в существующем или новом окне.

## Проверка

```sh
node --test tests/*.test.mjs
```

27 тестов алгоритма, режимов, путей, иконок, установки, service worker и подписок.
Ещё 5 Deno-тестов проверяют шифрование и транспорт Web Push; команды — в этапе 4.
Для tests/browser.mjs нужны Playwright и Chrome. Все запросы Supabase там перехватываются:
реальные аккаунты, письма и карточки не создаются.
Проверены CRUD, перенос, избранное, оценки, ошибки и конфликты,
ссылки карточек, восстановление сессии и пароля, настройки и размеры 320–1280 px.

Для проверки реальной базы пройди шаги инструкции этапа 2.
~~~~~

### /Users/roman/Documents/Codex/test/question-cards/docs/04-push.md

~~~~~markdown
# Этап 4. Push с вопросом

Корень проекта: `/Users/roman/Documents/Codex/test/question-cards`.
Полный код всех новых и изменённых файлов: [04-full-code.md](04-full-code.md).
PWA уже проверено пользователем на iPhone. К этапу 5 переходим после реального push.

## Что уже сделано

- Миграция `20261116165815_push_notifications.sql` применена в проекте `nvirttjdirfzsormbcun`.
- Развёрнуты `plan-schedule`, `send-due-pushes`, `test-push`.
- SQL-тест в настоящем Supabase завершился: `OK: DST, тихое окно, локальная дата, идемпотентность, claim, sent, stale и права проверены`. Тестовые данные откатились.
- Ключи VAPID созданы локально. В приложение помещён только публичный ключ.
- Пользователь сохранил secrets; вызов планировщика с cron secret вернул `200 OK`.
- Миграция `20261116171525_enable_push_cron.sql` включила pg_cron/pg_net и закрыла клиентский доступ к их служебным таблицам. Vault и два задания cron настроены отдельно, без секретов в истории миграций.
- Оба задания активны. Интерфейс опубликован. Пользователь подтвердил получение push на iPhone, открытие нужной карточки и следующую карточку после оценки. Повторять настройку не нужно.
- Проверка обычного расписания и остальных устройств: [этап 5](05-checklist.md).

## Файлы

Все пути ниже — от корня проекта.

| Путь | Назначение |
| --- | --- |
| `js/push-config.js` | Публичный VAPID, минимум 3 карточки для первого запроса, максимум 50 уведомлений в день |
| `js/push-utils.js` | Проверка ключа и адреса push-службы |
| `js/push.js` | Подписка текущего устройства, восстановление, отвязка при выходе |
| `js/api.js` | Сохранение подписки, вызов теста |
| `js/app.js` | Кнопки подключения, включения, теста |
| `js/view.js` | Состояния уведомлений и инструкции в прежнем дизайне |
| `scripts/generate-push-secrets.mjs` | Генерация ключей и приватного cron SQL |
| `supabase/config.toml` | Конфигурация трёх функций |
| `supabase/functions/deno.json` | Среда Deno |
| `supabase/functions/deno.lock` | Закреплённые версии зависимостей |
| `supabase/functions/_shared/core.ts` | Auth, REST, секретный заголовок, CORS, единый base path |
| `supabase/functions/_shared/push.ts` | Шифрование, отправка на устройства, удаление 404/410 |
| `supabase/functions/plan-schedule/index.ts` | Планирование |
| `supabase/functions/send-due-pushes/index.ts` | Атомарный захват и отправка |
| `supabase/functions/test-push/index.ts` | Тест для вошедшего пользователя |
| `supabase/migrations/20261116165815_push_notifications.sql` | Серверные RPC, защита прав, расписание |
| `supabase/migrations/20261116171525_enable_push_cron.sql` | Расширения pg_cron/pg_net и закрытие клиентского доступа |
| `supabase/tests/003_push_schedule.sql` | Проверка SQL с откатом |
| `supabase/functions/push_test.ts` | Проверка реального шифрования и транспортного поведения |
| `tests/push.test.mjs` | Проверка клиентской подписки |
| `tests/browser.mjs` | Проверка интерфейса с подменёнными Supabase и PushManager |

Приватные файлы находятся **вне сайта и репозитория**:

- `/Users/roman/Documents/Codex/test/question-cards-private/push.env`
- `/Users/roman/Documents/Codex/test/question-cards-private/setup-push-cron.sql`

Их содержимое нельзя загружать на GitHub или присылать в чат.

## 1. Добавь секреты

В текущем проекте уже выполнено. Инструкция сохранена для повторной настройки.

1. Открой [Secrets этого проекта](https://supabase.com/dashboard/project/nvirttjdirfzsormbcun/functions/secrets): **Edge Functions → Secrets**.
2. На Mac открой приватный `push.env` из пути выше.
3. Добавь четыре пары **Key / Value** из этого файла. Слева от первого `=` — Key, справа — весь Value. В JSON приватного ключа сохрани фигурные скобки и кавычки.
4. Для следующей пары нажимай **Add another**, затем **Save**. Панель также поддерживает вставку нескольких строк `KEY=VALUE` сразу.
5. В списке должны появиться `VAPID_PRIVATE_JWK`, `VAPID_SUBJECT`, `CRON_SECRET`, `APP_ORIGIN`.

`VAPID_SUBJECT` — контактный HTTPS-адрес, `APP_ORIGIN` — только origin без пути.
Ключи Supabase доступны серверным функциям автоматически; service role/secret key копировать во фронтенд не нужно.
Сохранённые secrets доступны без повторного развёртывания функций.
Это соответствует [текущей инструкции Supabase](https://supabase.com/docs/guides/functions/secrets).

Остановись и напиши **«готово»**. Дальше подключим cron.

## 2. Подключи cron после секретов

В текущем проекте уже выполнено и проверено: оба задания существуют и активны.

1. Открой приватный `setup-push-cron.sql`.
2. В Supabase: **SQL Editor → New**, вставь весь файл, нажми **Run**.
3. Если показано **Potential issue detected**, проверь, что вставлен именно этот файл. Он создаёт расширения, сохраняет секрет в Vault, закрывает доступ клиента к служебным таблицам и создаёт два задания. Подтверди **Run query**.
4. Ожидается успешное выполнение без ошибки. Повторный запуск обновляет те же Vault secrets и именованные задания.
5. В новой вкладке SQL Editor выполни эту полную проверку:

```sql
select jobname, schedule, active
from cron.job
where jobname in ('question-cards-plan', 'question-cards-send')
order by jobname;
```

Ожидается 2 строки: `question-cards-plan` — `*/5 * * * *`, `question-cards-send` — `* * * * *`, `active = true`.
Планировщик каждые 5 минут готовит сегодня и завтра, отправитель вызывается каждую минуту.
Cron хранит ссылку на секрет Vault, а не service role key в тексте задания.
Подход pg_cron + pg_net + Vault описан в [документации Supabase](https://supabase.com/docs/guides/functions/schedule-functions).

## 3. Опубликуй интерфейс

Код этапа загружается в **dev**. GitHub Pages публикует **main**, поэтому одного push в dev недостаточно для телефона.

1. GitHub → репозиторий **question-cards → Pull requests → New pull request**.
2. **base: main**, **compare: dev → Create pull request**.
3. После проверки: **Merge pull request → Confirm merge**.
4. В **Actions** дождись успешного `pages build and deployment`.
5. Открой приложение с установленной иконки, закрой и открой его ещё раз при необходимости обновления.

Сборки нет. Настройки Pages остаются **Settings → Pages → Deploy from a branch → main → /(root)**.
Auth: **Authentication → URL Configuration**, Site URL и Redirect URL — `https://fatym9999.github.io/question-cards/`.

## 4. Отправь первый тест

1. На iPhone нужны iOS 16.4+, установка через Safari → **Поделиться → На экран «Домой»** и запуск с иконки.
2. Войди и создай хотя бы **3 карточки**. В одной колоде оставь переключатель участия в уведомлениях включённым.
3. **Настройки → Уведомления → Вопросы в уведомлениях**. Разреши системный запрос.
4. Нажми **Отправить тестовое уведомление**. Повторный тест допускается через минуту.
5. Должны прийти название колоды и вопрос. Нажми push: откроется именно эта карточка, в том числе если приложение уже открыто.
6. Нажми любую оценку: ответ записывается обычным атомарным RPC, открывается следующий вопрос.

Тест выбирает карточку из участвующей колоды даже с будущим сроком: не нужно ждать наступления повторения.
Тест не меняет алгоритм, сроки или дневное расписание. Обычная отправка выбирает только `due_at <= now()`.
Системный режим «Фокусирование»/«Не беспокоить» телефона также влияет на показ.

На втором устройстве войди в тот же аккаунт и подключи это устройство кнопкой на экране уведомлений.
Один вопрос отправляется на все действующие подписки. Выход отвязывает только текущее устройство.
Общий переключатель выключает плановые уведомления аккаунта на всех устройствах.
При открытии проверяется `getSubscription()`; потерянная подписка восстанавливается при уже выданном разрешении.
Если браузер требует новое нажатие, доступна кнопка подключения. Автоматического запроса разрешения нет.

## 5. Проверь обычное расписание

1. Оставь уведомления включёнными, проверь часовой пояс и окно времени. Оно должно включать ближайшее время и не перекрываться целиком тихими часами.
2. Оставь хотя бы одну карточку, чей срок уже наступил. Новая карточка подходит сразу.
3. Планировщик создаст строки не позже следующего запуска через 5 минут. Моменты случайные: мгновенный push не обещается.
4. В **SQL Editor** можно посмотреть состояние без раскрытия секретов:

```sql
select plan_date, slot, fire_at, status, skip_reason, claimed_at, sent_at
from public.notification_schedule
where user_id = (select id from auth.users order by created_at limit 1)
order by plan_date, slot;
```

Запрос предназначен для твоего проекта с одним аккаунтом; при нескольких аккаунтах замени условие на свой UUID.
Ожидается `pending → processing → sent`. `skipped` с причиной допустим, если нет подходящих карточек/подписок/времени.
Локальная дата — `plan_date`, `fire_at` — абсолютное время timestamptz; панель может показывать его в UTC.

## Как устроена надёжность

- Время выбирается из реальных UTC-минут, которые попадают в локальное окно IANA timezone. Несуществующий весенний час исключён, повторяющийся осенний представлен двумя UTC-интервалами.
- Окно через полночь означает две части одной локальной календарной даты. Тихие часы тоже могут пересекать полночь. Конец окна не включён.
- В MVP — 1–50 слотов в день, разные минуты. Если оставшихся минут недостаточно, лишние слоты получают `skipped/no_window`.
- Повторное планирование использует блокировку настроек и `ON CONFLICT DO NOTHING`. Уже учтённые слоты не добавляются повторно.
- Изменение настроек удаляет будущие `pending` и `no_window`; уже отправленные и предпринятые попытки сохраняются в дневном бюджете.
- Отправитель забирает строки атомарным `UPDATE ... RETURNING` через `FOR UPDATE SKIP LOCKED`. Карточка выбирается при отправке по заданному приоритету с множителем 0.8–1.2.
- Опоздание больше 5 минут — `skipped/late`, чтобы не присылать накопившуюся пачку. Перед отправкой снова проверяются окно, тихие часы и включённость.
- `processing` старше 10 минут → `skipped/stale_processing`, **без повторной отправки**. После падения процесса неизвестно, приняла ли служба push. Выбран пропуск вместо риска дубля; гарантии exactly-once у внешней доставки нет.
- Успех хотя бы одной подписки даёт `sent`; 404/410 удаляет только её конкретную запись. Прочие ошибки сохраняют подписку. Если все попытки не удались — `skipped/delivery_failed`. Повтор на остальные устройства автоматически не делается.
- `sent` означает, что push-служба приняла сообщение, а не доказательство показа на экране. Исходный TTL этого этапа — 60 секунд; [исправления ревью, этап 1](06-fixes.md) меняют его на 900 секунд (15 минут). Сервер по-прежнему пропускает слот при опоздании больше 5 минут. Показ зависит от сети и настроек ОС.
- Большой payload ограничен 3993 байтами UTF-8: очень длинный вопрос сокращается с «…». Ссылка всегда открывает полный вопрос.
- Адреса служб ограничены Apple, FCM, Mozilla и Windows; перенаправления запрещены. Это защищает сервер от отправки запросов по произвольному клиентскому URL.
- Служебные RPC доступны только service role. У расписания и приватного ограничителя тестов RLS без клиентских политик — намеренно.
- `verify_jwt = false` не означает свободный доступ: планировщик и отправитель требуют `x-cron-secret`, тест проверяет пользовательский JWT через Supabase Auth. [Модель заголовков Supabase](https://supabase.com/docs/guides/functions/auth-headers).

## Библиотека и проверка

Выбрана фиксированная `jsr:@negrel/webpush@0.5.0`, зависимости закреплены в `deno.lock`.
Проверены [исходный код](https://github.com/negrel/webpush) и [поддержка Deno в JSR](https://jsr.io/@negrel/webpush/0.5.0): используются Fetch и Web Crypto, Node crypto не требуется.
В Deno выполнены проверка типов, подписи VAPID JWT, независимая расшифровка RFC 8291, тест 410 на одном из двух устройств, CORS/Auth и ограничение UTF-8.
Развёрнутый `test-push` возвращает 401 без JWT: модуль загружается в настоящем Supabase Runtime.
Это проверка совместимости и поведения, не независимый аудит криптографии библиотеки.
Стандарты: [RFC 8291](https://www.rfc-editor.org/rfc/rfc8291), [RFC 8292](https://www.rfc-editor.org/rfc/rfc8292).

Команды из корня проекта при установленных Node и Deno:

```sh
node --test tests/*.test.mjs
deno test --allow-env --config supabase/functions/deno.json supabase/functions/push_test.ts
deno check --config supabase/functions/deno.json supabase/functions/plan-schedule/index.ts supabase/functions/send-due-pushes/index.ts supabase/functions/test-push/index.ts
```

Пройдено 27 Node-тестов и 5 Deno-тестов. Браузерная проверка также прошла; запросы Supabase и PushManager там заменены тестовыми. Это не проверка реальной доставки iPhone.
SQL-тест `supabase/tests/003_push_schedule.sql` выполнен в Supabase в транзакции с откатом.

## Повторная генерация и перенос

Для создания ключей на новом компьютере:

```sh
node scripts/generate-push-secrets.mjs
```

Повторный запуск на этом Mac сохраняет существующий приватный ключ и cron secret. Сохрани приватный каталог в своём защищённом хранилище.
Не удаляй его ради обычного обновления: новая пара VAPID потребует пересоздать подписки.

При переезде:

1. Измени только `BASE_PATH` в `js/config.js` для нового пути. Worker/manifest/иконки и push URL строятся от этого пути; Edge Functions импортируют тот же файл.
2. Заново разверни три функции вместе с `js/config.js` и `js/push-utils.js`: изменение статичного файла на Pages само по себе не обновляет серверный bundle.
3. В Secrets измени `APP_ORIGIN` на `https://moonhaze.ru`. Он определяет URL push и CORS. Контакт `VAPID_SUBJECT` также можно обновить на новый адрес, сохранив пару ключей.
4. В Auth **URL Configuration** обнови Site URL и Redirect URLs на точный новый адрес, включая путь и завершающий `/`. Старые адреса убери после перехода.
5. На Nginx сохрани HTTPS и размещение manifest/sw внутри каталога приложения. Никакого специального разрешения worker на корень не требуется.
6. Удали старое установленное PWA, установи новое и заново разреши уведомления/создай подписку на каждом устройстве. Старые подписки останутся привязаны к старому адресу; до переезда лучше выйти из старого приложения на устройствах.
7. Supabase URL в Vault и расписания cron при том же проекте не меняются. Если меняешь cron secret — обнови его и в Secrets, и в Vault одним приватным setup SQL.

При реальном получении тестового вопроса и переходе на нужную карточку напиши **«готово, push пришёл»**.
~~~~~

### /Users/roman/Documents/Codex/test/question-cards/docs/05-checklist.md

~~~~~markdown
# Этап 5. Проверка устройств и типичные ошибки

Приложение: https://fatym9999.github.io/question-cards/.
Корень файлов: `/Users/roman/Documents/Codex/test/question-cards`.

Пользователь подтвердил на iPhone: установка PWA, получение настоящего push,
открытие нужной карточки и переход к следующей после оценки.
Автоматические уведомления тоже подтверждены: скриншот пользователя совпадает
со слотами расписания 16.11.2026 в 21:07 и 21:29 МСК; сервер записал для них `sent`.
Отдельно проверено, что сервер отправлял по расписанию, а не только по кнопке теста.
Android, настоящий push на компьютере и несколько физических устройств пока нужно проверить вручную.

## Файлы этапа

| Полный путь | Что содержит |
| --- | --- |
| `/Users/roman/Documents/Codex/test/question-cards/docs/05-checklist.md` | Этот чек-лист и разбор ошибок |
| `/Users/roman/Documents/Codex/test/question-cards/supabase/tests/004_runtime_status.sql` | Полный SQL диагностики: только чтение |
| `/Users/roman/Documents/Codex/test/question-cards/README.md` | Актуальный статус проекта и ссылки |

Новых файлов приложения, миграций и настроек Auth на этом этапе нет.
Полный код приложения уже сохранён в инструкциях этапов 2–4.

## 1. Общие проверки

- [ ] Регистрация, письмо подтверждения, вход, выход, восстановление пароля работают на опубликованном адресе.
- [ ] Колода создаётся, переименовывается и удаляется после подтверждения. `exam_date` сохраняется без влияния на алгоритм.
- [ ] Карточка создаётся, меняется, переносится между своими колодами и удаляется. Избранное сохраняется.
- [ ] «Все / Новые / К повторению / Избранные» дают ожидаемые списки. Карточка после «Не знаю» уже не новая.
- [ ] «Показать ответ» находится под вопросом. Все три оценки доступны без интервалов на кнопках.
- [ ] Любая оценка сразу показывает следующую карточку. При ошибке сохранения текущий вопрос остаётся; сообщение объясняет проблему.
- [ ] Повторное открытие приложения сохраняет данные аккаунта. Для загрузки и записи нужен интернет.
- [ ] Первый запрос разрешения появляется только после нажатия и при наличии хотя бы трёх карточек.

## 2. Устройства

На каждой платформе войди в один и тот же аккаунт, оставь включённой хотя бы одну колоду
с карточками и используй **Настройки → Уведомления**.

| Платформа | Действия | Ожидаемый результат |
| --- | --- | --- |
| iPhone, iOS 16.4+ | Открыть PWA с иконки. Включить уведомления или нажать «Подключить это устройство». Отправить тест | Вопрос на экране блокировки/в Центре уведомлений. Нажатие открывает нужную карточку |
| Android, обычный Chrome | Открыть HTTPS-сайт, установить через экран установки или меню Chrome. Запустить иконку, разрешить push явным нажатием, отправить тест | Установленное приложение открывается отдельно, вопрос приходит, нажатие ведёт к нужной карточке |
| Компьютер, Chrome или Edge | Открыть обычный профиль браузера, установить PWA при желании, разрешить уведомления сайту, отправить тест | Системное уведомление, точная карточка по нажатию; если окно приложения уже открыто, оно получает фокус |

На iPhone требование установки и поддержки с iOS 16.4 подтверждено [WebKit](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/).
На компьютере установка необязательна для первого теста push. Браузер/его фоновая служба и ОС должны позволять доставку;
полностью завершённый браузер не используй как обязательное условие успешного теста.
Chrome блокирует уведомления в инкогнито: используй обычный профиль.
[Chrome на компьютере](https://support.google.com/chrome/answer/3220216?hl=ru),
[Chrome на Android](https://support.google.com/chrome/answer/3220216?hl=ru&co=GENIE.Platform%3DAndroid).

Дополнительно на каждой платформе:

- [ ] Тест приходит, когда приложение свёрнуто.
- [ ] Push открывает нужную карточку при уже открытом приложении.
- [ ] После закрытия окна и нового запуска уведомления подключены. Если подписка потерялась, приложение пробует восстановить её при уже выданном разрешении.
- [ ] Повторный тест через минуту работает; немедленный повтор показывает ограничение частоты.

## 3. Главное: вопросы приходят сами

Это отдельная проверка после успешного тестового push.

1. Создай новую карточку с узнаваемым вопросом в колоде, включённой для уведомлений.
   Новая карточка сразу подходит по сроку. Не оценивай её до теста расписания.
2. В **Настройки → Уведомления** оставь общий переключатель включённым.
3. Выбери временное окно от текущего времени до времени через 30–40 минут.
   Поставь 2–3 уведомления в день; временно выключи «Не беспокоить» приложения.
4. Проверь указанный часовой пояс. Моменты выбираются по нему, а не по времени панели Supabase.
5. Сверни приложение. В течение 5 минут планировщик подготовит случайные моменты внутри оставшегося окна.
   Дождись одного из них; кнопка теста здесь не нужна. При необходимости посмотри `local_fire_at` в диагностике ниже.
6. Нажми пришедший вопрос и поставь оценку. Следующая плановая отправка должна выбирать карточку по актуальным срокам.
7. Верни удобное постоянное окно и дневное количество после проверки.

Ожидается хотя бы один плановый вопрос при наличии подходящих карточек, работающей сети и разрешений ОС.
Если сегодня уже израсходован дневной бюджет попыток, новые слоты не добавятся: смотри расписание или проверь на следующий день.
Если нет карточек с `due_at <= now()`, слот будет пропущен — это нормальное поведение.
Количество в настройках — число запланированных попыток, а не гарантия такого же числа показанных баннеров.

Тихие часы проверяются отдельно: включи их на часть окна, сохрани настройки,
после следующего планирования убедись, что `pending` не попадает внутрь тихого интервала.
Ночное окно может пересекать полночь. В базе `plan_date` всегда относится к локальной календарной дате.

## 4. Два устройства

1. Подключи уведомления и на телефоне, и на компьютере в одном аккаунте.
2. Отправь один тест. Должен прийти одинаковый вопрос на оба устройства.
3. Ответь на телефоне. На компьютере обнови приложение: срок и состояние карточки должны обновиться.
4. Если на другом устройстве уже открыт старый вопрос, попытка записать оценку должна показать конфликт и обновить данные.
5. Выйди на компьютере, оставив телефон подключённым. Следующий тест с телефона должен прийти на телефон;
   компьютер после выхода не получает новые отправки. Уже доставленные уведомления могут остаться в системном списке.

Общий переключатель уведомлений относится ко всему аккаунту. Для отключения только одного устройства используй выход на нём.
Подписка 404/410 удаляется отдельно; другая действующая подписка сохраняется.
Самостоятельно подделывать endpoint в базе для проверки не нужно — это уже покрыто серверным тестом.

## 5. Если что-то не работает

| Симптом | Что проверить |
| --- | --- |
| Переключатель недоступен | Созданы минимум три карточки? iPhone открыт с иконки? Адрес HTTPS? |
| «Подключить это устройство» | Нажми кнопку в установленном приложении. Разрешение после потери подписки могло потребовать нового жеста пользователя |
| Разрешение отклонено | Повторного системного запроса не будет. Разреши уведомления в настройках ОС/браузера, вернись в приложение и подключи устройство |
| «Тест можно отправлять не чаще раза в минуту» | Подожди минуту после предыдущей принятой попытки |
| «Включи хотя бы одну колоду…» | Включи колоду, где есть карточки. Пустая колода не подходит |
| Тест работает, плановые вопросы не приходят | Проверь общее включение, окно, тихие часы, timezone, наступившие сроки и оставшийся дневной бюджет. Подожди создания расписания до 5 минут |
| В таблице `sent`, но баннера нет | Push-служба приняла сообщение. Проверь разрешения, Центр уведомлений, Фокусирование/«Не беспокоить» и доставку по расписанию ОС. `sent` не доказывает показ |
| Давно выключенное устройство не получило старый вопрос | После применения этапа 1 ревью TTL — 15 минут (до него 60 секунд). После TTL сообщение больше не доставляется |
| Один вопрос приходит снова | После применения этапа 1 ревью успешная плановая отправка исключает эту карточку на 6 часов. Кнопка теста обходит этот запрет; если других подходящих карточек нет, плановый слот пропускается |
| Приходит на старую иконку/устройство | Возможно, осталось другое установленное PWA с подпиской. Открой старую установку и выйди из аккаунта; затем используй нужную |
| Текст вопроса сокращён | ОС ограничивает баннер, а очень большой payload сокращается приложением. По нажатию откроется полный вопрос |
| После обновления старый интерфейс | Закрой и открой приложение. Проверь **GitHub → Actions**, что Pages опубликованы из main; dev отдельно не публикуется |
| После переезда не работает ссылка/вход | Проверь BASE_PATH, новый bundle Edge Functions, APP_ORIGIN и разрешённые Auth URLs; переустанови PWA и подпишись заново |
| «Отправка уведомлений ещё не настроена…» | **Supabase → Edge Functions → Secrets**: четыре пары из приватного push.env. Пара ключей должна соответствовать публичному VAPID фронтенда |

Разрешения iPhone: **Настройки → Уведомления → Карточки** — разрешить уведомления, проверить способы показа,
доставку и настройки Фокусирования. Конкретные названия зависят от версии iOS.
[Справка Apple](https://support.apple.com/guide/iphone/change-notification-settings-iph7c3d96bab/ios).

Chrome на компьютере: **⋮ → Настройки → Конфиденциальность и безопасность → Настройки сайтов → Уведомления**.
На Android: в Chrome открой сайт → сведения о сайте слева от адреса → **Разрешения → Уведомления**;
также проверь системное разрешение уведомлений у Chrome/установленного приложения.
В Windows проверь **Параметры → Система → Уведомления** и «Не беспокоить».
[Справка Microsoft](https://support.microsoft.com/en-us/windows/experience/notifications-and-do-not-disturb-in-windows).

## 6. Диагностика Supabase без изменения данных

1. Открой **Supabase → SQL Editor → New**.
2. Вставь весь файл `supabase/tests/004_runtime_status.sql`, нажми **Run**.
3. Открой JSON `runtime_status`. Это только чтение; скрипт ничего не отправляет и не меняет расписание.

| Поле | Что ожидать |
| --- | --- |
| `cron` | Два активных задания: планирование `*/5 * * * *`, отправка `* * * * *`; последние запуски `succeeded` |
| `recent_http` | Ответы функций `200`, `timed_out = false`. Это последние запросы pg_net всего проекта; их нельзя считать доказательством доставки карточки |
| `accounts` | `enabled = true`, есть подписки, правильный `local_now`, есть `due_cards` для обычной отправки |
| `recent_schedule` | Состояния и локальное время `local_fire_at`. `pending → processing → sent` либо `skipped` с причиной |

`cron.succeeded` подтверждает постановку HTTP-запроса, поэтому проверяй и HTTP-ответ.
Тестовые push не добавляют строки в `notification_schedule`.

Причины `skip_reason`:

| Причина | Значение |
| --- | --- |
| `no_cards` | К моменту отправки нет карточек с наступившим сроком в участвующих колодах |
| `no_subscriptions` | Нет действующих записанных подписок |
| `no_window` | Не хватило свободных минут; в том числе сегодняшнее окно уже закончилось |
| `disabled` | Уведомления выключены к моменту обработки |
| `outside_window` / `wrong_day` | Обработка оказалась вне разрешённого локального времени/даты |
| `late` | Задержка отправителя больше 5 минут; пачка старых вопросов пропускается |
| `delivery_failed` | Ни одна push-служба не приняла сообщение |
| `stale_processing` | Процесс не завершил слот за 10 минут; повтор не делается, чтобы не создать дубликат |

Для ошибки функции: **Edge Functions → нужная функция → Logs**, выбери время теста и строку с ошибкой.
В актуальном интерфейсе там видны и HTTP-вызовы, и console-сообщения. В старом варианте панели вызовы находятся во вкладке **Invocations**.
401 у теста — проверь вход; 401 у cron — соответствие секрета в Secrets и Vault;
503 — отсутствующая конфигурация; 5xx — ищи безопасный код ошибки в логах.
[Инструкция Supabase](https://supabase.com/docs/guides/functions/logging).

Если нужна помощь, достаточно модели устройства, версии ОС/браузера, времени попытки,
текста ошибки и `status/skip_reason`. Не пересылай ключи, Authorization или адреса подписок.

## 7. Завершение

Для текущего iPhone основной сценарий и **автоматическая** доставка по расписанию подтверждены.
При использовании Android, компьютера или нескольких устройств пройди соответствующие проверки выше.
Статистика, CSV, AI, офлайн и FSRS остаются вне этого MVP.
Порядок переноса на moonhaze.ru сохранён в конце [этапа 4](04-push.md).
~~~~~
