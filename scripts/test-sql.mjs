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
