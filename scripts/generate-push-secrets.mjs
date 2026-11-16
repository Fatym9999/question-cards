// Секреты сохраняются ВНЕ каталога статического сайта и не выводятся в терминал.
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { BASE_PATH, SUPABASE_URL } from '../js/config.js';

const privateDirectory = fileURLToPath(new URL('../../question-cards-private/', import.meta.url));
const secretFile = `${privateDirectory}push.env`;
await mkdir(privateDirectory, { recursive: true, mode: 0o700 });
await writeFile(`${privateDirectory}.gitignore`, '*\n');
let secrets;
try {
  secrets = await readFile(secretFile, 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const cronSecret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  secrets = `VAPID_PRIVATE_JWK=${JSON.stringify(privateJwk)}\nVAPID_SUBJECT=${new URL(BASE_PATH, 'https://fatym9999.github.io').href}\nCRON_SECRET=${cronSecret}\nAPP_ORIGIN=https://fatym9999.github.io\n`;
  await writeFile(secretFile, secrets, { mode: 0o600, flag: 'wx' });
}
const privateValue = secrets.split('\n').find(line => line.startsWith('VAPID_PRIVATE_JWK=')).slice('VAPID_PRIVATE_JWK='.length);
const privateKey = JSON.parse(privateValue);
const publicKey = Buffer.concat([Buffer.from([4]), Buffer.from(privateKey.x, 'base64url'), Buffer.from(privateKey.y, 'base64url')]).toString('base64url');
await writeFile(new URL('../js/push-config.js', import.meta.url), `// Публичный ключ VAPID. Приватный ключ находится только в Supabase Secrets.\nexport const VAPID_PUBLIC_KEY = '${publicKey}';\nexport const MIN_PUSH_CARDS = 3;\nexport const MAX_PUSH_PER_DAY = 50;\n`);
await chmod(secretFile, 0o600);
const cronSecret = secrets.split('\n').find(line => line.startsWith('CRON_SECRET=')).slice('CRON_SECRET='.length);
const cronSql = `-- ПРИВАТНЫЙ файл: не добавлять в Git и не публиковать. Выполнить после установки Edge Secrets.
begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare secret_id uuid;
begin
  select id into secret_id from vault.secrets where name = 'question_cards_cron_secret';
  if secret_id is null then
    perform vault.create_secret('${cronSecret}', 'question_cards_cron_secret');
  else
    perform vault.update_secret(secret_id, '${cronSecret}');
  end if;
  select id into secret_id from vault.secrets where name = 'question_cards_project_url';
  if secret_id is null then
    perform vault.create_secret('${SUPABASE_URL}', 'question_cards_project_url');
  else
    perform vault.update_secret(secret_id, '${SUPABASE_URL}');
  end if;
end;
$$;

revoke all on table net.http_request_queue from public, anon, authenticated;
revoke all on table net._http_response from public, anon, authenticated;

select cron.schedule('question-cards-plan', '*/5 * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'question_cards_project_url') || '/functions/v1/plan-schedule',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'question_cards_cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$job$);

select cron.schedule('question-cards-send', '* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'question_cards_project_url') || '/functions/v1/send-due-pushes',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'question_cards_cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$job$);
commit;
`;
await writeFile(`${privateDirectory}setup-push-cron.sql`, cronSql, { mode: 0o600 });
console.log('Ключи готовы. Закрытый файл: question-cards-private/push.env. Публичный ключ: js/push-config.js.');
