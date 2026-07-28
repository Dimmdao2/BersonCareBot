#!/usr/bin/env bash
# Снимок фактов живой TEST-базы для агентов-аудиторов.
#
# Зачем: аудиторы раз за разом писали UNPROVEN там, где ответ лежит в базе, потому что песочница
# агента блокирует sudo (bwrap ставит no_new_privileges — это касается ЛЮБОЙ роли агента, смена
# роли джейл не снимает). Владелец 28.07: «запускай аудиторов не в песочнице — это двойная работа
# и тупо». Прямой путь (отдельная роль в базе только для чтения) требует решения владельца, поэтому
# пока — снимок: лид снимает факты сам и кладёт файл рядом с брифом.
#
# ЧТО ПОПАДАЕТ В СНИМОК: только метаданные — роли, гранты, владельцы таблиц, политики RLS,
# SECURITY DEFINER-функции, состояние журнала миграций, счётчики строк. НИКАКИХ значений полей,
# никаких персональных данных, никаких секретов.
#
# Использование: tools/db-facts-snapshot.sh [файл-назначения]
set -euo pipefail
DB=${BCB_DB:-bersoncarebot_test}
OUT=${1:-/tmp/bcb-db-facts.md}
q() { sudo -n -u postgres psql -d "$DB" -X -v ON_ERROR_STOP=1 "$@"; }

{
  echo "# Снимок фактов базы $DB — $(date '+%Y-%m-%d %H:%M')"
  echo
  echo "Снят лидом с живой базы. Метаданные, без значений полей и персональных данных."
  echo
  echo "## Login-роли и их свойства"
  echo '```'
  q -c "select rolname, rolcanlogin login, rolinherit inherit, rolbypassrls bypassrls, rolsuper super
        from pg_roles where rolname like 'app%' or rolname like 'bcb%' or rolname like '%owner%' order by 1"
  echo '```'
  echo "## Членство ролей"
  echo '```'
  q -c "select r.rolname member, g.rolname granted, m.inherit_option, m.set_option
        from pg_auth_members m join pg_roles r on r.oid=m.member join pg_roles g on g.oid=m.roleid order by 1,2"
  echo '```'
  echo "## Гранты на таблицы (кому что выдано)"
  echo '```'
  q -c "select grantee, table_schema||'.'||table_name tbl, string_agg(privilege_type,',' order by privilege_type) priv
        from information_schema.table_privileges
        where grantee not in ('postgres','PUBLIC') group by 1,2 order by 1,2"
  echo '```'
  echo "## Владельцы таблиц"
  echo '```'
  q -c "select tableowner, count(*) tables, string_agg(tablename,', ' order by tablename) list
        from pg_tables where schemaname in ('public','integrator','app') group by 1 order by 2 desc"
  echo '```'
  echo "## SECURITY DEFINER-функции во владении app_owner (гейт деплоя считает именно это)"
  echo '```'
  q -c "select count(*) as total from pg_proc p join pg_roles r on r.oid=p.proowner where p.prosecdef and r.rolname='app_owner'"
  q -c "select n.nspname||'.'||p.proname fn from pg_proc p join pg_roles r on r.oid=p.proowner
        join pg_namespace n on n.oid=p.pronamespace where p.prosecdef and r.rolname='app_owner' order by 1"
  echo '```'
  echo "## RLS: где включена и где FORCE"
  echo '```'
  q -c "select n.nspname||'.'||c.relname tbl, c.relrowsecurity rls, c.relforcerowsecurity force
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where c.relkind='r' and n.nspname in ('public','integrator')
          and (c.relrowsecurity or c.relforcerowsecurity) order by 1"
  echo '```'
  echo "## Политики RLS"
  echo '```'
  q -c "select schemaname||'.'||tablename tbl, policyname, cmd, roles::text from pg_policies order by 1,2"
  echo '```'
  echo "## Журнал миграций Drizzle: последние 12"
  echo '```'
  q -c "select id, hash, created_at from drizzle.__drizzle_migrations order by id desc limit 12" 2>/dev/null || echo "(таблица журнала недоступна)"
  echo '```'
  echo "## Размеры: сколько строк в ключевых таблицах"
  echo '```'
  q -c "select relname, n_live_tup rows from pg_stat_user_tables where n_live_tup > 0 order by n_live_tup desc limit 30"
  echo '```'
} > "$OUT"
echo "снимок записан: $OUT ($(wc -l < "$OUT") строк)"
