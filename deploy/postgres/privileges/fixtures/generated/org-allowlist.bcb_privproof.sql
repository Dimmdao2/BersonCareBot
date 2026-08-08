-- ============================================================================
-- СГЕНЕРИРОВАННЫЙ ФАЙЛ — НЕ РЕДАКТИРОВАТЬ РУКАМИ.
-- источник:   deploy/postgres/privileges/fixtures/proof-declaration.ts (tables[*].org === true, SCHEME §A.9)
-- генератор:  deploy/postgres/privileges/generate.mjs (версия 1)
-- база:       bcb_privproof
-- применение: psql -1 -v ON_ERROR_STOP=1 -f <файл>  (SCHEME §B шаг 6, ПОЛНОЕ переприменение)
-- ============================================================================

\set ON_ERROR_STOP on

CREATE TEMP TABLE bcb_allowlist_txn_guard ON COMMIT DROP AS SELECT 1 AS one;
DO $bcb$
BEGIN
  IF pg_catalog.to_regclass('pg_temp.bcb_allowlist_txn_guard') IS NULL THEN
    RAISE EXCEPTION 'allowlist применён НЕ одной транзакцией — нужен psql -1 (SCHEME §B)';
  END IF;
  IF pg_catalog.current_database() <> 'bcb_privproof' THEN
    RAISE EXCEPTION 'allowlist базы % применён к базе %', 'bcb_privproof', pg_catalog.current_database();
  END IF;
END
$bcb$;

WITH declared(schema_name, table_name) AS (VALUES
  ('public', 'be_organization_members')
),
inserted AS (
  INSERT INTO app_control.org_table_allowlist (schema_name, table_name)
  SELECT schema_name, table_name FROM declared
  ON CONFLICT (schema_name, table_name) DO NOTHING
  RETURNING 1
)
DELETE FROM app_control.org_table_allowlist a
 WHERE NOT EXISTS (SELECT 1 FROM declared d
                    WHERE d.schema_name = a.schema_name AND d.table_name = a.table_name);

-- конец сгенерированного артефакта.
