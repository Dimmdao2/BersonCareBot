-- proof-snapshot.sql — детерминированный СНИМОК каталога прав (для доказательства идемпотентности
-- и атомарности). Каждая строка — один факт; порядок фиксирован сортировкой.
-- Классы совпадают с тем, что сверяет §F: ACL таблиц/колонок/схем/базы/функций/последовательностей,
-- RLS-флаги, политики, владельцы, дефолтные права, атрибуты и членства ролей.

SELECT 'relacl|' || n.nspname || '.' || c.relname || '|' || COALESCE(c.relacl::text, '<null>')
       || '|owner=' || pg_get_userbyid(c.relowner)
       || '|rls=' || c.relrowsecurity::text || '|force=' || c.relforcerowsecurity::text
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname IN ('public', 'app') AND c.relkind IN ('r', 'S', 'v', 'p')
UNION ALL
SELECT 'attacl|' || n.nspname || '.' || c.relname || '.' || a.attname || '|' || a.attacl::text
  FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE a.attacl IS NOT NULL AND n.nspname IN ('public', 'app')
UNION ALL
SELECT 'policy|' || schemaname || '.' || tablename || '|' || policyname || '|' || permissive
       || '|' || cmd || '|' || COALESCE(roles::text, '') || '|' || COALESCE(qual, '')
       || '|' || COALESCE(with_check, '')
  FROM pg_policies WHERE schemaname IN ('public', 'app')
UNION ALL
SELECT 'nspacl|' || n.nspname || '|' || COALESCE(n.nspacl::text, '<null>')
       || '|owner=' || pg_get_userbyid(n.nspowner)
  FROM pg_namespace n WHERE n.nspname IN ('public', 'app', 'app_control')
UNION ALL
SELECT 'datacl|' || d.datname || '|' || COALESCE(d.datacl::text, '<null>')
       || '|owner=' || pg_get_userbyid(d.datdba)
  FROM pg_database d WHERE d.datname = current_database()
UNION ALL
SELECT 'proacl|' || n.nspname || '.' || p.proname || '|' || COALESCE(p.proacl::text, '<null>')
       || '|owner=' || pg_get_userbyid(p.proowner) || '|secdef=' || p.prosecdef::text
       || '|proconfig=' || COALESCE(p.proconfig::text, '<null>')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app'
UNION ALL
SELECT 'defacl|' || pg_get_userbyid(defaclrole) || '|' || defaclobjtype::text || '|' || defaclacl::text
  FROM pg_default_acl
UNION ALL
SELECT 'role|' || rolname || '|login=' || rolcanlogin::text || '|super=' || rolsuper::text
       || '|bypassrls=' || rolbypassrls::text || '|inherit=' || rolinherit::text
       || '|createrole=' || rolcreaterole::text
       || '|rolconfig=' || COALESCE(rolconfig::text, '<null>')
  FROM pg_roles WHERE rolname NOT LIKE 'pg\_%'
UNION ALL
SELECT 'member|' || pg_get_userbyid(m.roleid) || '|' || pg_get_userbyid(m.member)
       || '|admin=' || m.admin_option::text || '|inherit=' || m.inherit_option::text || '|set=' || m.set_option::text
  FROM pg_auth_members m
 WHERE pg_get_userbyid(m.roleid) NOT LIKE 'pg\_%'
ORDER BY 1;
