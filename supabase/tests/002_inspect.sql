-- Только чтение. Ожидается 6 строк: RLS везде true,
-- client_policies = 4, кроме notification_schedule, где 0.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  (select count(*) from pg_catalog.pg_policies p
   where p.schemaname = 'public' and p.tablename = c.relname) as client_policies
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'decks', 'cards', 'review_logs', 'push_subscriptions',
    'notification_settings', 'notification_schedule'
  )
order by c.relname;
