#!/usr/bin/env node
/**
 * generate.mjs — ГЕНЕРАТОР слоя прав БД: декларация → детерминированный SQL (SCHEME §B).
 *
 * Вход  — `declaration.ts` (единственный источник истины, SCHEME §A).
 * Выход — по файлу на управляемую базу: `deploy/postgres/generated/privileges.<db>.sql`,
 *         применяется ОДНОЙ транзакцией: `psql -1 -v ON_ERROR_STOP=1 -f <файл>` (SCHEME §B).
 *
 * Свойства (SCHEME §B):
 *   • чистая функция: тот же вход ⇒ побайтно тот же выход (гейт `--check` в CLI);
 *   • подключение к БД для генерации НЕ нужно;
 *   • полное переприменение: REVOKE ALL со всех управляемых ролей → точные GRANT;
 *     DROP POLICY (все) → CREATE POLICY (объявленные);
 *   • статьи отсортированы (дифф читаем).
 *
 * ЧЕГО ГЕНЕРАТОР НЕ ЭМИТИТ (чужая власть — SCHEME §B, «два движка не спорят за одну статью»):
 *   • DDL схемы (CREATE SCHEMA/TABLE/FUNCTION …) — миграции;
 *   • объекты стены (`app_control`, event trigger, снятие материализованного PUBLIC EXECUTE
 *     со ВСЕХ функций §D.5) — шаг `wall-install` (§B шаг 3);
 *   • login-специфичные статьи (создание логинов, их пароли, членства, CONNECT,
 *     `ALTER ROLE … IN DATABASE … SET`) — рендер при применении из env-маппинга (§A.1);
 *     в закоммиченный артефакт они НЕ входят. См. `renderEnvSql()`.
 *
 * ПРОБЕЛЫ ДЕКЛАРАЦИИ — ГРОМКИЙ ОТКАЗ, НЕ ТИХИЙ ПРОПУСК. Незаполненное место (TODO-объект,
 * неразрешимый владелец, неизвестный грантополучатель, объявленная org-таблица без записи)
 * роняет генерацию целиком со списком мест. Тихий пропуск — ровно тот механизм, которым
 * нынешний бардак и вырос.
 */

import { createHash } from 'node:crypto';

export const GENERATOR_VERSION = 1;

/** Канонический порядок привилегий (стабильный дифф). */
const PRIV_ORDER = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
const MANAGED_APPLICATION_SCHEMAS = ['public', 'app', 'integrator', 'app_ext', 'app_control', 'drizzle'];

/** Ошибка «декларация неполна» — несёт перечень мест. */
export class DeclarationGapError extends Error {
  constructor(gaps) {
    const lines = gaps.map((g) => `  • ${g.site}: ${g.reason}`).join('\n');
    super(`декларация неполна — генерация отказана (${gaps.length} мест):\n${lines}`);
    this.name = 'DeclarationGapError';
    this.gaps = gaps;
  }
}

/* ─────────────────────────── примитивы SQL ─────────────────────────── */

/** Идентификатор в двойных кавычках. */
function q(name) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(`пустой идентификатор: ${JSON.stringify(name)}`);
  }
  return `"${name.replaceAll('"', '""')}"`;
}

/** Строковый литерал. */
function lit(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

/** Строковый литерал ВНУТРИ строкового литерала (аргумент format() в DO-блоке). */
function nestedLit(value) {
  return String(value).replaceAll("'", "''");
}

/** `public.be_appointments` → { schema, name, qualified }. */
function splitQualified(key, site) {
  const parts = key.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new DeclarationGapError([{ site, reason: `ключ '${key}' не в форме <схема>.<объект>` }]);
  }
  return { schema: parts[0], name: parts[1], qualified: `${q(parts[0])}.${q(parts[1])}` };
}

function sortedKeys(obj) {
  return Object.keys(obj ?? {}).sort();
}

function sortPrivs(list) {
  return [...new Set(list)].sort((a, b) => PRIV_ORDER.indexOf(a) - PRIV_ORDER.indexOf(b));
}

/**
 * Набор привилегий грантополучателя. Декларация несёт ДВЕ формы (обе живые):
 *   • массив: `app_staff: ['SELECT', …]`;
 *   • запись с обоснованием: `app_patient: { privs: [...], why: '…' }`.
 * Возвращает массив либо null, если форма не разобрана (вызывающий поднимает пробел).
 */
function grantPrivs(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && Array.isArray(value.privs)) return value.privs;
  return null;
}

/* ─────────────────────────── разбор декларации ─────────────────────────── */

/** Множества принципалов: канонические роли (артефакт) и логины (env-рендер). */
function principals(declaration) {
  const roles = new Map(Object.entries(declaration.cluster.roles));
  const logins = new Map();
  for (const [env, records] of Object.entries(declaration.envMapping ?? {})) {
    for (const [name, record] of Object.entries(records)) {
      if (!logins.has(name)) logins.set(name, { env, record });
    }
  }
  return { roles, logins };
}

function isSystemRole(name) {
  return typeof name === 'string' && name.startsWith('pg_');
}

/**
 * Роли, у которых генератор ОТЗЫВАЕТ права перед точными GRANT (SCHEME §B «REVOKE ALL … FROM
 * все управляемые роли»). Суперпользователь исключён (не управляется декларацией), владелец
 * объекта исключается вызывающим кодом — иначе REVOKE снёс бы владельцу его собственный ACL.
 */
function managedRoleNames(declaration) {
  return Object.entries(declaration.cluster.roles)
    .filter(([, decl]) => decl.kind !== 'superuser')
    .map(([name]) => name)
    .sort();
}

/** Exact application principals removed by the owner-ordered zero-state migration. */
export function zeroStateRoleNames(declaration) {
  const targetRoles = managedRoleNames(declaration);
  const targetLogins = Object.values(declaration.envMapping ?? {}).flatMap((records) => Object.keys(records));
  const legacyRoles = declaration.zeroState?.legacyRoles ?? [];
  const roles = [...new Set([...targetRoles, ...targetLogins, ...legacyRoles])].sort();
  for (const role of roles) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(role) || role === 'postgres' || isSystemRole(role)) {
      throw new DeclarationGapError([{
        site: 'zeroState.legacyRoles',
        reason: `unsafe application role identity '${role}'`,
      }]);
    }
  }
  return roles;
}

/** Literal declaration-owned identities used by both the landed zero artifact and
 * the post-zero installer precondition.  This intentionally is not derived from
 * pg_roles: after a successful cluster finalizer none of these roles exists. */
function zeroStateExpectedRoleSql(declaration) {
  return zeroStateRoleNames(declaration).map((role) => `(${lit(role)}::name)`).join(', ');
}

function functionExecute(db, fn) {
  const logins = fn.loginExecute ? db.database.connect ?? [] : [];
  return [...new Set([...fn.execute, ...logins])].sort();
}

function functionEntriesForDatabase(context, dbName) {
  return Object.entries(context?.functions ?? {})
    .filter(([, fn]) => !fn.databases || fn.databases.includes(dbName));
}

const PORT_CONTEXT_PURPOSE_RE = /^[a-z][a-z0-9._:-]{0,127}$/;

function deterministicCapabilityId(dbName, loginName, capabilityName) {
  const bytes = createHash('sha256')
    .update(`bcb-port-context-capability\0${dbName}\0${loginName}\0${capabilityName}`, 'utf8')
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function portContextLoginRecords(declaration, dbName) {
  const records = [];
  for (const [env, mapping] of Object.entries(declaration.envMapping ?? {})) {
    for (const [loginName, record] of Object.entries(mapping)) {
      if (record.port && record.connect?.includes(dbName)) records.push({ env, loginName, record });
    }
  }
  return records;
}

export function resolvePortContextCapabilities(declaration, dbName) {
  const context = declaration.portContext;
  if (!context) return [];
  const roles = declaration.cluster?.roles ?? {};
  const logins = portContextLoginRecords(declaration, dbName);
  const rows = [];
  const exact = new Set();
  const runtimeNames = new Set();
  const runtimeSources = new Set();
  for (const [name, capability] of Object.entries(context.capabilities ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    const site = `portContext.capabilities.${name}`;
    if (!['webapp', 'integrator'].includes(capability.port)) {
      throw new DeclarationGapError([{ site, reason: `unknown port '${capability.port}'` }]);
    }
    if (!roles[capability.sessionRole] || !roles[capability.targetRole]) {
      throw new DeclarationGapError([{ site, reason: 'sessionRole and targetRole must name declared roles' }]);
    }
    if (!context.classes.includes(capability.contextClass)) {
      throw new DeclarationGapError([{ site, reason: `unknown context class '${capability.contextClass}'` }]);
    }
    if (!PORT_CONTEXT_PURPOSE_RE.test(capability.purpose)) {
      throw new DeclarationGapError([{ site, reason: `invalid purpose '${capability.purpose}'` }]);
    }
    const runtimeName = capability.runtimeName ?? name;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(runtimeName)) {
      throw new DeclarationGapError([{ site, reason: `invalid runtime name '${runtimeName}'` }]);
    }
    const runtimeKey = `${capability.port}\0${runtimeName}`;
    if (runtimeNames.has(runtimeKey)) {
      throw new DeclarationGapError([{ site, reason: `duplicate ${capability.port} runtime name '${runtimeName}'` }]);
    }
    runtimeNames.add(runtimeKey);
    const isRelation = capability.purpose === 'relation';
    const hasFunctionIdentity = typeof capability.functionIdentity === 'string';
    if (isRelation === hasFunctionIdentity || (hasFunctionIdentity
      && !/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*\(.*\)$/.test(capability.functionIdentity))) {
      throw new DeclarationGapError([{
        site,
        reason: 'relation capability must omit functionIdentity; named root must declare an exact identity',
      }]);
    }
    if (capability.runtimeSources !== undefined && (!Array.isArray(capability.runtimeSources)
      || capability.runtimeSources.some((source) => typeof source !== 'string' || !source.trim()))) {
      throw new DeclarationGapError([{ site, reason: 'runtimeSources must contain exact non-empty strings' }]);
    }
    for (const source of capability.runtimeSources ?? []) {
      const sourceKey = `${capability.port}\0${source}`;
      if (runtimeSources.has(sourceKey)) {
        throw new DeclarationGapError([{ site, reason: `duplicate ${capability.port} runtime source '${source}'` }]);
      }
      runtimeSources.add(sourceKey);
    }
    const matches = logins.filter(({ record }) =>
      record.port === capability.port && record.canonicalRole === capability.sessionRole);
    if (matches.length !== 1) {
      throw new DeclarationGapError([{
        site,
        reason: `expected one ${capability.port} login with canonical role ${capability.sessionRole} for ${dbName}, got ${matches.length}`,
      }]);
    }
    const { loginName } = matches[0];
    const targetMemberships = matches[0].record.memberships.filter(
      (membership) => membership.role === capability.targetRole && membership.set,
    );
    if (targetMemberships.length !== 1) {
      throw new DeclarationGapError([{
        site,
        reason: `${loginName} must have exactly one SET-able membership in ${capability.targetRole}, got ${targetMemberships.length}`,
      }]);
    }
    const exactKey = [capability.port, loginName, capability.targetRole, capability.contextClass,
      capability.purpose, capability.functionIdentity ?? ''].join('\0');
    if (exact.has(exactKey)) {
      throw new DeclarationGapError([{ site, reason: 'duplicate exact capability tuple' }]);
    }
    exact.add(exactKey);
    rows.push({
      name,
      runtimeName,
      capabilityId: deterministicCapabilityId(dbName, loginName, name),
      sessionLogin: loginName,
      ...capability,
    });
  }
  return rows;
}

export function renderPortContextRuntimeEnv(declaration, env, dbName, port) {
  if (!declaration.envMapping?.[env]) throw new Error(`env '${env}' не объявлен в декларации`);
  if (!['webapp', 'integrator'].includes(port)) throw new Error(`unknown port '${port}'`);
  const rows = resolvePortContextCapabilities(declaration, dbName).filter((row) => row.port === port);
  const descriptors = Object.fromEntries(rows.map((row) => [row.runtimeName, {
    capabilityId: row.capabilityId,
    targetRole: row.targetRole,
    contextClass: row.contextClass,
    purpose: row.purpose,
    ...(row.functionIdentity ? { functionIdentity: row.functionIdentity } : {}),
    ...(row.runtimeSources?.length ? { runtimeSources: row.runtimeSources } : {}),
  }]));
  const key = port === 'webapp'
    ? 'WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON'
    : 'INTEGRATOR_PORT_CONTEXT_CAPABILITIES_JSON';
  return { key, value: JSON.stringify(descriptors) };
}

export function generatePortContextCapabilitySeedSql(declaration, dbName) {
  // A relation capability deliberately has no function identity.  It is no less a
  // capability than a named root: install_port_context compares the whole tuple
  // (including the NULL regprocedure), so omitting it here leaves a valid runtime
  // descriptor unable to install context after the cutover.
  const rows = resolvePortContextCapabilities(declaration, dbName);
  if (!declaration.portContext || rows.length === 0) return '';
  const values = rows.map((row) =>
    `  (${lit(row.capabilityId)}::uuid, ${lit(row.port)}::app.port_name, ${lit(row.sessionLogin)}::name, `
    + `${lit(row.targetRole)}::name, ${lit(row.contextClass)}::app.port_context_class, ${lit(row.purpose)}, `
    + `${row.functionIdentity ? `${lit(row.functionIdentity)}::regprocedure` : 'NULL::regprocedure'})`).join(',\n');
  return [
    '-- Declaration-owned production port-context capabilities: exact replacement of the whole DB-local catalog.',
    'CREATE TEMP TABLE bcb_declared_port_context_capabilities ON COMMIT DROP AS',
    'SELECT * FROM (VALUES',
    values,
    ') AS v(capability_id, port, session_login, target_role, context_class, purpose, function_identity);',
    '-- Cutover services are stopped. Transaction-bound accepted contexts must not survive a reseed.',
    'DELETE FROM app_ext.accepted_port_contexts;',
    'DELETE FROM app_ext.port_context_capabilities;',
    'INSERT INTO app_ext.port_context_capabilities',
    '  (capability_id, port, session_login, target_role, context_class, purpose, function_identity)',
    'SELECT capability_id, port, session_login, target_role, context_class, purpose, function_identity',
    '  FROM bcb_declared_port_context_capabilities',
    'ON CONFLICT (capability_id) DO UPDATE SET',
    '  port = EXCLUDED.port, session_login = EXCLUDED.session_login, target_role = EXCLUDED.target_role,',
    '  context_class = EXCLUDED.context_class, purpose = EXCLUDED.purpose,',
    '  function_identity = EXCLUDED.function_identity, active_from = clock_timestamp(), active_until = NULL;',
    'ALTER TABLE app_ext.port_context_capabilities',
    '  DROP CONSTRAINT IF EXISTS port_context_capabilities_port_session_login_target_role_co_key;',
    'ALTER TABLE app_ext.port_context_capabilities',
    '  DROP CONSTRAINT IF EXISTS port_context_capabilities_authority_tuple_key;',
    '',
  ].join('\n');
}

export function generatePortContextCapabilityVerifierSql(declaration, dbName) {
  const rows = resolvePortContextCapabilities(declaration, dbName);
  if (!declaration.portContext || rows.length === 0) return '';
  const values = rows.map((row) =>
    `  (${lit(row.capabilityId)}::uuid, ${lit(row.port)}::app.port_name, ${lit(row.sessionLogin)}::name, `
    + `${lit(row.targetRole)}::name, ${lit(row.contextClass)}::app.port_context_class, ${lit(row.purpose)}, `
    + `${row.functionIdentity ? `${lit(row.functionIdentity)}::regprocedure` : 'NULL::regprocedure'})`).join(',\n');
  const tupleMatch = [
    'actual.capability_id = expected.capability_id',
    'actual.port = expected.port',
    'actual.session_login = expected.session_login',
    'actual.target_role = expected.target_role',
    'actual.context_class = expected.context_class',
    'actual.purpose = expected.purpose',
    'actual.function_identity IS NOT DISTINCT FROM expected.function_identity',
    'actual.active_from <= pg_catalog.clock_timestamp()',
    'actual.active_until IS NULL',
  ].join(' AND ');
  return [
    '-- Bilateral exact catalog closure: missing, mutated and stale rows are all fatal.',
    'CREATE TEMP TABLE bcb_expected_port_context_capabilities ON COMMIT DROP AS',
    'SELECT * FROM (VALUES', values,
    ') AS v(capability_id, port, session_login, target_role, context_class, purpose, function_identity);',
    'DO $bcb$',
    'DECLARE missing_count integer; extra_count integer;',
    'BEGIN',
    '  SELECT count(*) INTO missing_count FROM bcb_expected_port_context_capabilities expected',
    `   WHERE NOT EXISTS (SELECT 1 FROM app_ext.port_context_capabilities actual WHERE ${tupleMatch});`,
    '  SELECT count(*) INTO extra_count FROM app_ext.port_context_capabilities actual',
    `   WHERE NOT EXISTS (SELECT 1 FROM bcb_expected_port_context_capabilities expected WHERE ${tupleMatch});`,
    '  IF missing_count <> 0 OR extra_count <> 0 THEN',
    "    RAISE EXCEPTION 'port-context capability catalog closure failed: missing/mutated=%, extra/stale/mutated=%', missing_count, extra_count;",
    '  END IF;',
    'END',
    '$bcb$;',
    `SELECT ${rows.length}::integer AS exact_declared_capability_count;`,
    '',
  ].join('\n');
}

function environmentLoginRecords(declaration, env, dbName) {
  const records = declaration.envMapping?.[env];
  if (!records) throw new DeclarationGapError([{ site: `envMapping.${env}`, reason: 'environment is absent' }]);
  const selected = Object.entries(records).filter(([, record]) => record.connect?.includes(dbName));
  if (selected.length !== 4) {
    throw new DeclarationGapError([{ site: `envMapping.${env}`, reason: `target ${dbName} must declare exactly four LOGIN shells, got ${selected.length}` }]);
  }
  if (selected.some(([, record]) => !record.port || !record.login)) {
    throw new DeclarationGapError([{ site: `envMapping.${env}`, reason: 'target shells must be declared application port logins' }]);
  }
  return selected.sort(([a], [b]) => a.localeCompare(b));
}

/** Read-only bidirectional closure for objects whose complete identity is carried by revision 11.
 * The org allowlist relation is declaration-derived infrastructure (`orgTableAllowlist`), while
 * transaction-private relations and every application routine are exact declaration entries. */
export function generateCatalogClosureVerifierSql(declaration, dbName) {
  const db = declaration.databases?.[dbName];
  if (!db) throw new DeclarationGapError([{ site: `databases.${dbName}`, reason: 'database is absent' }]);
  const relations = Object.entries(db.tables)
    .filter(([, table]) => table.disposition === 'ACTIVE')
    .map(([identity]) => identity);
  relations.push(...Object.keys(declaration.portContext?.privateRelations ?? {}));
  if (db.orgTableAllowlist) relations.push('app_control.org_table_allowlist');
  const exactRelations = [...new Set(relations)].sort();
  const functions = functionEntriesForDatabase(declaration.portContext, dbName)
    .map(([signature]) => signature)
    .sort();
  const relationRows = exactRelations.map((identity) => {
    const [schema, name] = identity.split('.');
    return `(${lit(schema)}::name,${lit(name)}::name)`;
  }).join(',\n');
  const functionRows = functions.map((signature) => `(${lit(signature)})`).join(',\n');
  return [
    '-- Bidirectional revision-11 catalog closure: no missing or undeclared managed relation/routine.',
    'DO $bcb$ DECLARE bad text; BEGIN',
    `  WITH expected(schema_name,relation_name) AS (VALUES ${relationRows})`,
    "  SELECT expected.schema_name || '.' || expected.relation_name INTO bad FROM expected",
    '   WHERE pg_catalog.to_regclass(pg_catalog.format(\'%I.%I\',expected.schema_name,expected.relation_name)) IS NULL LIMIT 1;',
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'declared managed relation missing: %',bad; END IF;",
    `  WITH expected(schema_name,relation_name) AS (VALUES ${relationRows})`,
    "  SELECT namespace.nspname || '.' || relation.relname INTO bad FROM pg_catalog.pg_class relation",
    '   JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace',
    "   WHERE namespace.nspname IN ('public','app','app_ext','integrator','drizzle','app_control')",
    "     AND relation.relkind IN ('r','p','v','m','f','S')",
    "     AND NOT (relation.relkind='S' AND EXISTS (SELECT 1 FROM pg_catalog.pg_depend dependency JOIN expected owner_relation ON dependency.refobjid=pg_catalog.to_regclass(pg_catalog.format('%I.%I',owner_relation.schema_name,owner_relation.relation_name)) WHERE dependency.classid='pg_class'::pg_catalog.regclass AND dependency.objid=relation.oid AND dependency.deptype IN ('a','i')))",
    '     AND NOT EXISTS (SELECT 1 FROM expected WHERE expected.schema_name=namespace.nspname AND expected.relation_name=relation.relname)',
    '   ORDER BY 1 LIMIT 1;',
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'undeclared managed relation: %',bad; END IF;",
    `  WITH expected(signature) AS (VALUES ${functionRows})`,
    '  SELECT expected.signature INTO bad FROM expected WHERE pg_catalog.to_regprocedure(expected.signature) IS NULL LIMIT 1;',
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'declared managed routine missing: %',bad; END IF;",
    `  WITH expected(signature) AS (VALUES ${functionRows})`,
    "  SELECT pg_catalog.format('%I.%I(%s)',namespace.nspname,routine.proname,pg_catalog.replace(pg_catalog.oidvectortypes(routine.proargtypes),', ',',')) INTO bad",
    '   FROM pg_catalog.pg_proc routine JOIN pg_catalog.pg_namespace namespace ON namespace.oid=routine.pronamespace',
    "   WHERE namespace.nspname IN ('public','app','app_ext','integrator')",
    "     AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend dependency WHERE dependency.classid='pg_proc'::pg_catalog.regclass AND dependency.objid=routine.oid AND dependency.deptype='e')",
    '     AND NOT EXISTS (SELECT 1 FROM expected WHERE routine.oid=pg_catalog.to_regprocedure(expected.signature))',
    '   ORDER BY 1 LIMIT 1;',
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'undeclared managed routine: %',bad; END IF;",
    `  RAISE NOTICE 'BCB_CATALOG_CLOSURE_VERIFIED database=${dbName} relations=${exactRelations.length} routines=${functions.length}';`,
    'END $bcb$;',
    '',
  ].join('\n');
}

/** Exact birth-wall registry for ordinary ACTIVE tables plus private relations
 * living in schemas guarded by the event trigger.  `app_control` is deliberately
 * excluded: the trigger does not govern its own closed metadata relations. */
export function generateRelationWallRegistrySeedSql(declaration, dbName) {
  const db = declaration.databases?.[dbName];
  if (!db) throw new DeclarationGapError([{ site: `databases.${dbName}`, reason: 'database is absent' }]);
  const guardedSchemas = new Set(['public', 'app', 'integrator', 'app_ext']);
  const rows = new Map();
  const add = (identity, cls, wall, expectedOwner, site) => {
    const { schema, name } = splitQualified(identity, site);
    if (!guardedSchemas.has(schema)) return;
    const row = { schema, name, cls, wall, expectedOwner };
    const previous = rows.get(identity);
    if (previous && JSON.stringify(previous) !== JSON.stringify(row)) {
      throw new DeclarationGapError([{ site, reason: `conflicting birth-wall registry row for '${identity}'` }]);
    }
    rows.set(identity, row);
  };
  for (const [identity, table] of Object.entries(db.tables)) {
    if (table.disposition !== 'ACTIVE') continue;
    add(
      identity,
      table.cls,
      table.wall,
      table.owner === 'migrator' ? 'app_object_owner' : table.owner,
      `databases.${dbName}.tables.${identity}`,
    );
  }
  for (const [identity, relation] of Object.entries(declaration.portContext?.privateRelations ?? {})) {
    add(identity, 'T', 'closed', relation.owner, `portContext.privateRelations.${identity}`);
  }
  const exactRows = [...rows.values()].sort((a, b) =>
    `${a.schema}.${a.name}`.localeCompare(`${b.schema}.${b.name}`));
  if (exactRows.length === 0) {
    throw new DeclarationGapError([{ site: `databases.${dbName}`, reason: 'birth-wall registry is empty' }]);
  }
  const values = exactRows.map((row) =>
    `  (${lit(row.schema)}::name, ${lit(row.name)}::name, ${lit(row.cls)}, ${lit(row.wall)}, ${lit(row.expectedOwner)}::name)`).join(',\n');
  const ownerReconciliation = exactRows.map((row) =>
    `ALTER TABLE ${q(row.schema)}.${q(row.name)} OWNER TO ${q(row.expectedOwner)};`).join('\n');
  return [
    '-- Exact declaration-derived relation birth-wall registry.',
    `-- target database: ${dbName}; guarded rows: ${exactRows.length}`,
    "DELETE FROM app_control.relation_wall_registry WHERE schema_name IN ('public','app','integrator','app_ext');",
    'INSERT INTO app_control.relation_wall_registry',
    '  (schema_name, table_name, data_class, wall, expected_owner)',
    'VALUES',
    values,
    'ON CONFLICT (schema_name, table_name) DO UPDATE SET',
    '  data_class=EXCLUDED.data_class, wall=EXCLUDED.wall, expected_owner=EXCLUDED.expected_owner;',
    '-- Reconcile restored --no-owner tables before any later table DDL.  Each ALTER',
    '-- is itself checked by the already-installed event trigger against the row above.',
    ownerReconciliation,
    '',
  ].join('\n');
}

/** Safe declaration-derived shells created before contract/object DDL. */
export function generateEnvLoginShellSql(declaration, env, dbName) {
  const records = environmentLoginRecords(declaration, env, dbName);
  const contractVariables = new Map([
    ['app_staff', 'app_staff_login'], ['app_patient', 'app_patient_login'],
    ['app_platform_settings', 'app_global_admin_login'], ['app_integrator_request', 'integrator_login'],
  ]);
  return [
    '-- Exact declaration-derived LOGIN shells; credentials/grants render last.',
    ...records.flatMap(([loginName]) => [
      `CREATE ROLE ${q(loginName)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;`,
      `ALTER ROLE ${q(loginName)} RESET ALL;`,
      `ALTER ROLE ${q(loginName)} IN DATABASE ${q(dbName)} RESET ALL;`,
    ]),
    ...records.map(([loginName, record]) => {
      const variable = contractVariables.get(record.canonicalRole);
      if (!variable) throw new DeclarationGapError([{ site: `envMapping.${env}.${loginName}`, reason: 'LOGIN shell lacks a contract canonical role' }]);
      return `\\set ${variable} ${loginName}`;
    }),
    '',
  ].join('\n');
}

/** Exact environment identity closure after the final password/grant render. */
export function generateEnvironmentVerifierSql(declaration, env, dbName) {
  const db = declaration.databases?.[dbName];
  if (!db) throw new DeclarationGapError([{ site: `databases.${dbName}`, reason: 'database is absent' }]);
  const records = environmentLoginRecords(declaration, env, dbName);
  const names = records.map(([name]) => name);
  const allDeclaredLoginNames = [...new Set(Object.values(declaration.envMapping ?? {})
    .flatMap((mapping) => Object.keys(mapping)))].sort();
  const foreignNames = allDeclaredLoginNames.filter((name) => !names.includes(name));
  const memberships = records.flatMap(([login, record]) => (record.memberships ?? []).map((m) =>
    `(${lit(login)}::name,${lit(m.role)}::name,${m.admin},${m.inherit},${m.set})`));
  const usages = records.flatMap(([login]) => Object.entries(db.schemas)
    .filter(([, schema]) => schema.present && (schema.usage ?? []).includes(login))
    .map(([schema]) => `(${lit(login)}::name,${lit(schema)}::name)`));
  const expectedMemberships = memberships.join(', ');
  const expectedNames = names.map(lit).join(', ');
  const allDeclaredNames = allDeclaredLoginNames.map(lit).join(', ');
  const foreignDeclaredNames = foreignNames.map(lit).join(', ');
  return [
    '-- Exact target environment verifier: three SCRAM LOGIN attrs, memberships, CONNECT and schema USAGE.',
    'DO $bcb$', 'DECLARE bad text;', 'BEGIN',
    `  SELECT rolname INTO bad FROM pg_catalog.pg_roles WHERE rolname=ANY(ARRAY[${expectedNames}]::name[]) AND (NOT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit) LIMIT 1;`,
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'environment login attributes mismatch: %', bad; END IF;",
    `  SELECT rolname INTO bad FROM pg_catalog.pg_authid WHERE rolname=ANY(ARRAY[${expectedNames}]::name[]) AND COALESCE(rolpassword, '') NOT LIKE 'SCRAM-SHA-256$%' LIMIT 1;`,
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'environment LOGIN lacks SCRAM verifier: %', bad; END IF;",
    `  SELECT rolname INTO bad FROM pg_catalog.pg_roles WHERE rolcanlogin AND rolname ~ '^(app_|bcb_|saas_|bersoncarebot_)' AND rolname <> ALL(ARRAY[${allDeclaredNames}]::name[]) LIMIT 1;`,
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'undeclared BCB LOGIN survived: %', bad; END IF;",
    `  SELECT expected.login_name::text || '->' || expected.role_name::text INTO bad FROM (VALUES ${expectedMemberships}) AS expected(login_name,role_name,admin_option,inherit_option,set_option) WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members membership JOIN pg_catalog.pg_roles role ON role.oid=membership.roleid JOIN pg_catalog.pg_roles member ON member.oid=membership.member WHERE member.rolname=expected.login_name AND role.rolname=expected.role_name AND membership.admin_option=expected.admin_option AND membership.inherit_option=expected.inherit_option AND membership.set_option=expected.set_option) LIMIT 1;`,
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'missing exact login membership: %', bad; END IF;",
    `  SELECT member.rolname || '->' || role.rolname INTO bad FROM pg_catalog.pg_auth_members membership JOIN pg_catalog.pg_roles role ON role.oid=membership.roleid JOIN pg_catalog.pg_roles member ON member.oid=membership.member WHERE member.rolname=ANY(ARRAY[${expectedNames}]::name[]) AND NOT EXISTS (SELECT 1 FROM (VALUES ${expectedMemberships}) AS expected(login_name,role_name,admin_option,inherit_option,set_option) WHERE expected.login_name=member.rolname AND expected.role_name=role.rolname AND expected.admin_option=membership.admin_option AND expected.inherit_option=membership.inherit_option AND expected.set_option=membership.set_option) LIMIT 1;`,
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'unexpected login membership: %', bad; END IF;",
    `  SELECT rolname INTO bad FROM pg_catalog.pg_roles WHERE rolname=ANY(ARRAY[${expectedNames}]::name[]) AND NOT has_database_privilege(rolname,${lit(dbName)},'CONNECT') LIMIT 1;`,
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'environment LOGIN lacks CONNECT: %', bad; END IF;",
    ...(foreignNames.length ? [
      `  SELECT rolname INTO bad FROM pg_catalog.pg_roles WHERE rolname=ANY(ARRAY[${foreignDeclaredNames}]::name[]) AND has_database_privilege(rolname,${lit(dbName)},'CONNECT') LIMIT 1;`,
      "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'foreign environment LOGIN can CONNECT: %', bad; END IF;",
      `  SELECT role_row.rolname || ':' || schema_row.nspname INTO bad FROM pg_catalog.pg_roles role_row CROSS JOIN pg_catalog.pg_namespace schema_row WHERE role_row.rolname=ANY(ARRAY[${foreignDeclaredNames}]::name[]) AND schema_row.nspname=ANY(ARRAY['app','app_ext','integrator','public']::name[]) AND has_schema_privilege(role_row.rolname,schema_row.oid,'USAGE') LIMIT 1;`,
      "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'foreign environment LOGIN has schema USAGE: %', bad; END IF;",
    ] : []),
    `  SELECT expected.login_name::text || ':' || expected.schema_name::text INTO bad FROM (VALUES ${usages.join(', ') || '(NULL::name,NULL::name)'}) AS expected(login_name,schema_name) WHERE expected.login_name IS NOT NULL AND NOT has_schema_privilege(expected.login_name,expected.schema_name,'USAGE') LIMIT 1;`,
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'environment LOGIN lacks schema USAGE: %', bad; END IF;",
    `  RAISE NOTICE 'BCB_ENVIRONMENT_VERIFIED env=${env} database=${dbName} logins=${names.length}';`,
    'END $bcb$;', '',
  ].join('\n');
}

/* ─────────────────────────── детектор пробелов ─────────────────────────── */

function isTodo(value) {
  return Boolean(value) && typeof value === 'object' && typeof value.todo === 'string';
}

/**
 * Перечисляет ВСЕ места декларации, которые генератор не может превратить в статью.
 * Возвращает массив `{ site, reason }`; пустой массив = декларация применима.
 */
export function collectGaps(declaration, dbName) {
  const gaps = [];
  const add = (site, reason) => gaps.push({ site, reason });
  const db = declaration.databases?.[dbName];
  if (!db) {
    add(`databases.${dbName}`, 'база не объявлена в декларации');
    return gaps;
  }
  const { roles, logins } = principals(declaration);
  const known = (name) => roles.has(name) || logins.has(name) || isSystemRole(name);

  const context = declaration.portContext;
  if (context) {
    for (const [name, relation] of Object.entries(context.privateRelations)) {
      if (!known(relation.owner)) add(`portContext.privateRelations.${name}`, `неизвестный владелец '${relation.owner}'`);
      if (relation.columns.length === 0) add(`portContext.privateRelations.${name}`, 'private relation has no exact columns');
    }
    for (const [signature, fn] of Object.entries(context.functions)) {
      if (!known(fn.owner)) add(`portContext.functions.${signature}`, `неизвестный владелец '${fn.owner}'`);
      for (const grantee of fn.execute) {
        if (!known(grantee)) add(`portContext.functions.${signature}`, `неизвестный EXECUTE grantee '${grantee}'`);
      }
      if (!fn.purpose || !Array.isArray(fn.typedArgs)) {
        add(`portContext.functions.${signature}`, 'function lacks purpose or typed-args recipe');
      }
      if (typeof fn.returns !== 'string' || fn.returns.length === 0) {
        add(`portContext.functions.${signature}`, 'function lacks exact result type');
      }
      if (!['DEFINER', 'INVOKER'].includes(fn.security)
        || !['IMMUTABLE', 'STABLE', 'VOLATILE'].includes(fn.volatility)
        || !['SAFE', 'RESTRICTED', 'UNSAFE'].includes(fn.parallel)
        || !Array.isArray(fn.proconfig)) {
        add(`portContext.functions.${signature}`, 'exact security/volatility/parallel/proconfig is required');
      }
      if (fn.databases) {
        if (fn.databases.length === 0 || new Set(fn.databases).size !== fn.databases.length) {
          add(`portContext.functions.${signature}.databases`, 'per-DB presence must be a non-empty unique list');
        }
        for (const database of fn.databases) {
          if (!declaration.databases[database]) add(`portContext.functions.${signature}.databases`, `неизвестная база '${database}'`);
        }
      }
      if (fn.invocation === 'trigger' && fn.execute.length !== 0) {
        add(`portContext.functions.${signature}.execute`, 'trigger root must not have a runtime EXECUTE grantee');
      }
      for (const [index, surface] of (fn.relationSurfaces ?? []).entries()) {
        const ssite = `portContext.functions.${signature}.relationSurfaces[${index}]`;
        if (!declaration.databases.bersoncarebot_test?.tables?.[surface.relation]
          && !context.privateRelations?.[surface.relation]) add(ssite, `unknown relation '${surface.relation}'`);
        if (surface.columns.length === 0 || surface.operations.length === 0) add(ssite, 'surface needs named columns and operations');
      }
      if (Array.isArray(fn.relationSurfaces) && fn.relationSurfaces.length === 0 && !(fn.delegatesTo?.length > 0)) {
        add(`portContext.functions.${signature}`, 'wrapper without a direct relation surface must name exact delegated roots');
      }
      for (const delegated of fn.delegatesTo ?? []) {
        if (!context.functions[delegated]) add(`portContext.functions.${signature}.delegatesTo`, `unknown delegated root '${delegated}'`);
      }
    }
  }

  /* — роли — */
  for (const name of sortedKeys(declaration.cluster.roles)) {
    const role = declaration.cluster.roles[name];
    if (role.kind !== 'superuser' && (role.login || role.superuser || role.bypassrls || role.inherit || role.createrole)) {
      add(`cluster.roles.${name}`, 'managed role must be NOLOGIN/NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION/NOBYPASSRLS/NOINHERIT');
    }
    for (const m of role.grantedTo ?? []) {
      if (!known(m.role)) add(`cluster.roles.${name}.grantedTo`, `неизвестный принципал '${m.role}'`);
    }
  }

  for (const [env, records] of Object.entries(declaration.envMapping ?? {})) {
    for (const [loginName, login] of Object.entries(records)) {
      if (login.superuser || login.bypassrls || login.inherit || login.createrole) {
        add(`envMapping.${env}.${loginName}`, 'application login has a prohibited role attribute');
      }
      for (const edge of login.memberships ?? (login.membership ? [login.membership] : [])) {
        if (!roles.has(edge.role) || edge.admin || edge.inherit || !edge.set) {
          add(`envMapping.${env}.${loginName}.memberships`, 'membership must name a declared role with ADMIN FALSE, INHERIT FALSE, SET TRUE');
        }
      }
    }
  }

  /* — база — */
  if (db.database.owner !== db.dbSettings?.datdba) {
    add(
      `databases.${dbName}.database.owner`,
      `владелец базы '${db.database.owner}' ≠ dbSettings.datdba '${db.dbSettings?.datdba}' — какой из двух истина?`,
    );
  }
  for (const grantee of db.database.connect ?? []) {
    if (!known(grantee)) add(`databases.${dbName}.database.connect`, `неизвестный принципал '${grantee}'`);
  }

  /* — схемы — */
  for (const schemaName of sortedKeys(db.schemas)) {
    const schema = db.schemas[schemaName];
    const site = `databases.${dbName}.schemas.${schemaName}`;
    for (const listName of ['usage', 'create']) {
      for (const grantee of schema[listName] ?? []) {
        if (grantee === '=PUBLIC') {
          if (schema.publicDefect !== true) {
            add(site, `'=PUBLIC' в ${listName} без publicDefect:true — это цель или дефект?`);
          }
          continue;
        }
        if (!known(grantee)) add(site, `неизвестный принципал '${grantee}' в ${listName}`);
      }
    }
    if (schema.present && !known(schema.owner)) add(site, `неизвестный владелец схемы '${schema.owner}'`);
  }

  /* — таблицы — */
  for (const tableKey of sortedKeys(db.tables)) {
    const table = db.tables[tableKey];
    const site = `databases.${dbName}.tables['${tableKey}']`;
    if (tableKey.split('.').length !== 2) add(site, 'ключ не в форме <схема>.<таблица>');
    if (table.rls === 'on' && !table.rlsWhy) add(site, "rls:'on' без rlsWhy (SCHEME §A.4 требует обоснование)");
    if (!['force', 'on', 'off', 'n/a'].includes(table.rls)) add(site, `неизвестный режим rls '${table.rls}'`);
    if (table.rls === 'n/a' && Object.keys(table.grants ?? {}).length > 0) {
      add(site, "rls:'n/a' (PENDING_REMOVAL) вместе с грантами — шаблон 'pending-removal' требует НОЛЬ грантов");
    }
    if (table.owner !== 'migrator' && !known(table.owner)) add(site, `неизвестный владелец '${table.owner}'`);
    if (!table.grants || typeof table.grants !== 'object') add(site, 'нет секции grants');
    for (const grantee of sortedKeys(table.grants)) {
      if (!known(grantee)) add(`${site}.grants`, `неизвестный принципал '${grantee}'`);
      const set = grantPrivs(table.grants[grantee]);
      if (!set) {
        add(`${site}.grants.${grantee}`, 'набор привилегий не разобран: ожидается массив либо { privs: [...] }');
        continue;
      }
      for (const entry of set) {
        if (typeof entry === 'string') {
          if (!PRIV_ORDER.includes(entry)) add(`${site}.grants.${grantee}`, `неизвестная привилегия '${entry}'`);
        } else if (entry && entry.kind === 'columns') {
          if (!PRIV_ORDER.includes(entry.priv)) {
            add(`${site}.grants.${grantee}`, `неизвестная привилегия '${entry.priv}'`);
          }
          if (!Array.isArray(entry.columns) || entry.columns.length === 0) {
            add(`${site}.grants.${grantee}`, 'колоночный грант без списка колонок');
          }
        } else {
          add(`${site}.grants.${grantee}`, `неразобранная запись гранта: ${JSON.stringify(entry)}`);
        }
      }
    }
    for (const [i, policy] of (table.policies ?? []).entries()) {
      const psite = `${site}.policies[${i}]`;
      if (isTodo(policy)) {
        add(psite, `TODO в декларации: ${policy.todo}`);
        continue;
      }
      if (!policy.name) add(psite, 'политика без имени');
      if (!['PERMISSIVE', 'RESTRICTIVE'].includes(policy.as)) add(psite, `неизвестный as '${policy.as}'`);
      if (!['ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE'].includes(policy.cmd)) {
        add(psite, `неизвестная команда '${policy.cmd}'`);
      }
      if (!Array.isArray(policy.to) || policy.to.length === 0) {
        add(psite, "пустой список ролей («дремлющая» политика §G.4) — цель не объявлена");
      } else {
        for (const grantee of policy.to) {
          if (grantee !== 'PUBLIC' && !known(grantee)) add(psite, `неизвестная роль '${grantee}'`);
        }
      }
    }
    if (table.disposition === 'ACTIVE') {
      const access = table.access;
      if (!access) {
        add(site, 'active relation has no executable access status (direct, named-seam, or no-runtime-surface)');
      } else if (access.kind === 'unresolved') {
        add(site, `unresolved access census: ${access.reason}${access.codePaths.length ? ` (${access.codePaths.join(', ')})` : ''}`);
      } else if (access.kind === 'direct') {
        if (!access.purpose || access.codePaths.length === 0 || access.grants.length === 0) {
          add(site, 'direct access lacks purpose, exact grant matrix, or code-path evidence');
        }
        if (Object.keys(table.grants ?? {}).length === 0) add(site, 'direct access has no declared exact grant');
        for (const expected of access.grants) {
          const actual = grantPrivs(table.grants?.[expected.role]) ?? [];
          for (const operation of expected.operations) {
            const matching = expected.columns === 'table'
              ? actual.includes(operation)
              : actual.some((entry) => entry && typeof entry === 'object' && entry.kind === 'columns'
                && entry.priv === operation && entry.columns.length === expected.columns.length
                && entry.columns.every((column) => expected.columns.includes(column)));
            if (!matching) add(site, `direct matrix grant missing: ${expected.role}/${operation}`);
          }
        }
        if (!Array.isArray(access.seams)) add(site, 'direct access must carry an explicit seam list');
        const directRoles = new Set(access.grants.map((grant) => grant.role));
        for (const grantee of Object.keys(table.grants ?? {})) {
          if (!directRoles.has(grantee) && !(access.seams ?? []).some((seam) => seam.owner === grantee)) {
            add(site, `table grant '${grantee}' is absent from the direct/seam matrix`);
          }
        }
      } else if (access.kind === 'named-seams') {
        if (!Array.isArray(access.seams) || access.seams.length === 0 || !access.purpose) {
          add(site, 'named-seams access needs a purpose and at least one exact seam');
        }
        const seen = new Set();
        for (const [index, named] of (access.seams ?? []).entries()) {
          const nsite = `${site}.access.seams[${index}]`;
          if (seen.has(named.regprocedure)) add(nsite, `duplicate seam '${named.regprocedure}'`);
          seen.add(named.regprocedure);
          const seam = context?.functions?.[named.regprocedure];
          if (!seam) add(nsite, `named seam '${named.regprocedure}' is not in the exact function census`);
          if (seam?.databases && !seam.databases.includes(dbName)) add(nsite, `named seam is absent from ${dbName}`);
          if (!known(named.owner) || seam?.owner !== named.owner || named.columns.length === 0
            || named.operations.length === 0 || !named.purpose) add(nsite, 'named seam lacks exact owner/columns/operations/purpose');
          if (named.invocation === 'runtime') {
            if (!Array.isArray(named.callers) || named.callers.length === 0
              || named.callers.some((caller) => !known(caller))
              || !seam || seam.execute.length !== named.callers.length
              || seam.execute.some((caller) => !named.callers.includes(caller))) {
              add(nsite, 'runtime seam caller set is absent, unknown, or differs from declared EXECUTE');
            }
          } else if (named.invocation === 'trigger') {
            if (named.callers.length !== 0 || seam?.execute.length !== 0 || seam?.invocation !== 'trigger') {
              add(nsite, 'trigger seam must be caller-free and non-runtime');
            }
          } else if (named.invocation === 'internal') {
            if (named.callers.length !== 0 || seam?.execute.length !== 0 || seam?.invocation !== 'internal') {
              add(nsite, 'internal delegated seam must be caller-free and non-runtime');
            }
          } else add(nsite, `unknown invocation '${named.invocation}'`);
          const surface = seam?.relationSurfaces?.find((candidate) => candidate.relation === tableKey);
          if (!surface || named.columns.some((column) => !surface.columns.includes(column))
            || named.operations.some((operation) => !surface.operations.includes(operation))) {
            add(nsite, `relation surface does not match function census for '${tableKey}'`);
          }
        }
      } else if (access.kind === 'no-runtime-surface' && (!access.purpose || access.evidence.length === 0)) {
        add(site, 'no-runtime-surface lacks purpose or absence evidence');
      }
      const policies = table.policies ?? [];
      const exactNamedRootGate = (access?.kind === 'direct' || access?.kind === 'named-seams')
        && access.seams.length > 0
        && policies.some((policy) => !isTodo(policy)
          && policy.as === 'RESTRICTIVE'
          && String(policy.note ?? '').startsWith('exact named roots independently verify'));
      const restrictiveContext = exactNamedRootGate || policies.some((policy) => !isTodo(policy)
        && policy.as === 'RESTRICTIVE'
        && (context
          ? (String(policy.using ?? '').includes('app.require_accepted_context(')
              && String(policy.withCheck ?? '').includes('app.require_accepted_context('))
          : String(policy.using ?? '').includes('app.current_org_id()')
            && String(policy.withCheck ?? '').includes('app.current_org_id()')));
      if (!restrictiveContext) add(site, 'active relation lacks the restrictive transaction-context gate');
      const permissiveBusiness = policies.some((policy) => !isTodo(policy) && policy.as === 'PERMISSIVE');
      if (!permissiveBusiness) add(site, 'active relation lacks a declared permissive business policy');
      for (const policy of policies) {
        if (context && !isTodo(policy) && policy.as === 'PERMISSIVE'
          && (String(policy.using ?? '').trim() === 'true' || String(policy.withCheck ?? '').trim() === 'true')) {
          add(site, `permissive policy '${policy.name}' uses unconditional true`);
        }
      }
    }
  }

  /* — последовательности (явные записи) — */
  for (const seqKey of sortedKeys(db.sequences?.examples)) {
    for (const grantee of sortedKeys(db.sequences.examples[seqKey])) {
      const ssite = `databases.${dbName}.sequences.examples['${seqKey}']`;
      if (!known(grantee)) add(ssite, `неизвестный принципал '${grantee}'`);
      for (const priv of db.sequences.examples[seqKey][grantee]) {
        if (!['USAGE', 'SELECT', 'UPDATE'].includes(priv)) add(ssite, `неизвестная привилегия '${priv}'`);
      }
    }
  }

  /* — функции/представления — */
  const views = db.functionsViews?.views;
  if (isTodo(views)) {
    add(`databases.${dbName}.functionsViews.views`, `TODO в декларации: ${views.todo}`);
  } else {
    for (const viewKey of sortedKeys(views)) {
      const view = views[viewKey];
      const vsite = `databases.${dbName}.functionsViews.views['${viewKey}']`;
      if (view.securityInvoker !== true) add(vsite, 'представление без securityInvoker:true (§G.6)');
      if (Array.isArray(view.execute) && view.execute.length > 0) {
        add(vsite, 'поле execute у ПРЕДСТАВЛЕНИЯ: грамматика ACL представления в декларации не определена '
          + '(EXECUTE к представлению неприменим, нужен табличный грант) — генератор не выдумывает');
      }
    }
  }

  /* — definer-исключения — */
  const definer = db.definerExceptions;
  if (!definer?.defaults) {
    add(`databases.${dbName}.definerExceptions.defaults`, 'нет правила по умолчанию');
  } else if (!known(definer.defaults.owner)) {
    add(`databases.${dbName}.definerExceptions.defaults.owner`, `неизвестная роль '${definer.defaults.owner}'`);
  }
  for (const sig of sortedKeys(definer?.proconfigExceptions)) {
    const fn = definer.proconfigExceptions[sig];
    const fsite = `databases.${dbName}.definerExceptions.proconfigExceptions['${sig}']`;
    if (!known(fn.owner)) add(fsite, `неизвестный владелец '${fn.owner}'`);
    for (const grantee of fn.execute ?? []) {
      if (!known(grantee)) add(fsite, `неизвестный грантополучатель EXECUTE '${grantee}'`);
    }
  }
  const ownership = definer?.ownershipExceptions;
  for (const owner of sortedKeys(ownership?.intentional)) {
    const entry = ownership.intentional[owner];
    const osite = `databases.${dbName}.definerExceptions.ownershipExceptions.intentional.${owner}`;
    if (isTodo(entry.functions)) {
      add(osite, `TODO в декларации: ${entry.functions.todo}`);
    } else if (!Array.isArray(entry.functions) || entry.functions.length !== entry.count) {
      add(osite, `перечислено ${entry.functions?.length ?? 0} функций против count=${entry.count}`);
    }
  }
  for (const owner of sortedKeys(ownership?.drift)) {
    const entry = ownership.drift[owner];
    const osite = `databases.${dbName}.definerExceptions.ownershipExceptions.drift.${owner}`;
    if (entry.todo) add(osite, `TODO в декларации: ${entry.todo}`);
    if ((entry.known?.length ?? 0) !== entry.count) {
      add(osite, `поимённо известно ${entry.known?.length ?? 0} функций против count=${entry.count} — `
        + 'неназванную функцию нельзя ни привести к владельцу, ни объявить исключением');
    }
  }

  /* — создатели — */
  for (const creator of db.creators ?? []) {
    if (!known(creator)) add(`databases.${dbName}.creators`, `неизвестная роль '${creator}'`);
  }

  /* — типы — */
  for (const typeKey of sortedKeys(db.types)) {
    for (const grantee of db.types[typeKey].usage ?? []) {
      if (!known(grantee)) add(`databases.${dbName}.types['${typeKey}']`, `неизвестный принципал '${grantee}'`);
    }
  }

  /* — org-allowlist: выводится из tables[*].org, поэтому обязан СХОДИТЬСЯ с tables — */
  const allowlist = db.orgTableAllowlist;
  if (allowlist) {
    const declaredOrg = sortedKeys(db.tables).filter((k) => db.tables[k].org === true);
    const asite = `databases.${dbName}.orgTableAllowlist`;
    for (const named of allowlist.named ?? []) {
      if (!db.tables[named]) {
        add(`${asite}.named`, `org-таблица '${named}' названа переписью, но записи в tables нет — `
          + 'событийный триггер §E получил бы allowlist без прав на неё');
      } else if (db.tables[named].org !== true) {
        add(`${asite}.named`, `'${named}' объявлена org:false, но перечислена в allowlist`);
      }
    }
    if (typeof allowlist.fullCountLive === 'number' && allowlist.fullCountLive !== declaredOrg.length) {
      add(`${asite}.fullCountLive`,
        `перепись насчитала ${allowlist.fullCountLive} org-таблиц, в tables объявлено ${declaredOrg.length}`);
    }
    if (allowlist.todo) add(`${asite}.todo`, `TODO в декларации: ${allowlist.todo}`);
  }

  /* — per-db настройки — */
  for (const login of sortedKeys(db.dbSettings?.perRoleInDatabase)) {
    if (!known(login)) add(`databases.${dbName}.dbSettings.perRoleInDatabase`, `неизвестный принципал '${login}'`);
  }

  return gaps;
}

/* ─────────────────────────── статьи ─────────────────────────── */

const ROLCONFIG_SAFE = /^[A-Za-z0-9_ ,.$-]+$/u;

function roleAttributeClause(decl) {
  return [
    decl.login ? 'LOGIN' : 'NOLOGIN',
    decl.superuser ? 'SUPERUSER' : 'NOSUPERUSER',
    'NOCREATEDB',
    decl.bypassrls ? 'BYPASSRLS' : 'NOBYPASSRLS',
    decl.inherit ? 'INHERIT' : 'NOINHERIT',
    decl.createrole ? 'CREATEROLE' : 'NOCREATEROLE',
    'NOREPLICATION',
  ].join(' ');
}

function emitRolconfig(out, roleName, rolconfig, site) {
  out.push(`ALTER ROLE ${q(roleName)} RESET ALL;`);
  for (const entry of rolconfig ?? []) {
    const eq = entry.indexOf('=');
    if (eq <= 0) throw new DeclarationGapError([{ site, reason: `rolconfig '${entry}' не в форме name=value` }]);
    const name = entry.slice(0, eq);
    const value = entry.slice(eq + 1);
    if (!ROLCONFIG_SAFE.test(value)) {
      throw new DeclarationGapError([{
        site,
        reason: `значение rolconfig '${value}' требует правил цитирования, которых генератор не реализует`,
      }]);
    }
    out.push(`ALTER ROLE ${q(roleName)} SET ${q(name)} TO ${value};`);
  }
}

function isSeamOwnerName(roleName) {
  return /^app_seam_.+_owner$/.test(roleName)
    || roleName === 'saas_telemetry_owner'
    || roleName === 'saas_system_health_owner';
}

function emitMembershipRevokeToEmpty(out, roleName, bothDirections = false, preservedMembers = []) {
  const preserved = preservedMembers.length > 0
    ? ` AND pg_catalog.pg_get_userbyid(am.member) <> ALL(ARRAY[${preservedMembers.map(lit).join(', ')}]::name[])`
    : '';
  out.push(
    'DO $bcb$',
    'DECLARE m record;',
    'BEGIN',
    '  FOR m IN SELECT pg_catalog.pg_get_userbyid(am.member) AS member',
    '             FROM pg_catalog.pg_auth_members am',
    `            WHERE am.roleid = ${lit(roleName)}::regrole${preserved} ORDER BY 1 LOOP`,
    `    EXECUTE pg_catalog.format('REVOKE %I FROM %I', ${lit(roleName)}, m.member);`,
    '  END LOOP;',
    'END',
    '$bcb$;',
  );
  if (bothDirections) {
    out.push(
      'DO $bcb$',
      'DECLARE m record;',
      'BEGIN',
      '  FOR m IN SELECT pg_catalog.pg_get_userbyid(am.roleid) AS granted_role',
      '             FROM pg_catalog.pg_auth_members am',
      `            WHERE am.member = ${lit(roleName)}::regrole ORDER BY 1 LOOP`,
      `    EXECUTE pg_catalog.format('REVOKE %I FROM %I', m.granted_role, ${lit(roleName)});`,
      '  END LOOP;',
      'END',
      '$bcb$;',
    );
  }
}

function revokeList(names) {
  return names.map(q).join(', ');
}

/* ─────────────────────────── точка ноль ─────────────────────────── */

function zeroStateHeader(dbName, source) {
  return [
    '-- ============================================================================',
    '-- СГЕНЕРИРОВАННАЯ МИГРАЦИЯ ТОЧКИ НОЛЬ — НЕ ДОБАВЛЯЕТ НИ ОДНОГО GRANT.',
    `-- источник:   ${source}`,
    `-- генератор:  deploy/postgres/privileges/generate.mjs (версия ${GENERATOR_VERSION})`,
    `-- база:       ${dbName}`,
    '-- применение: psql -1 -X -v ON_ERROR_STOP=1 -f <этот файл>',
    '-- порядок:    OWNER_DECISIONS.md пункты 4–5; до target roles/grants.',
    '-- ============================================================================',
    '',
    '\\set ON_ERROR_STOP on',
    '',
  ];
}

/**
 * Revoke-only, catalog-driven zero state for one database. It deliberately does not call collectGaps:
 * an incomplete future grant matrix must never prevent removal of the old access layer.
 */
export function generateZeroStateSql(declaration, dbName, options = {}) {
  const source = options.source ?? 'deploy/postgres/privileges/declaration.ts';
  const db = declaration.databases?.[dbName];
  if (!db) throw new DeclarationGapError([{ site: `databases.${dbName}`, reason: 'database is absent' }]);
  const roles = zeroStateRoleNames(declaration);
  const roleArray = `ARRAY[${roles.map(lit).join(', ')}]::name[]`;
  const out = zeroStateHeader(dbName, source);

  out.push(
    'CREATE TEMP TABLE bcb_zero_state_txn_guard ON COMMIT DROP AS SELECT 1 AS one;',
    '-- Expected identities stay literal even when cluster zero already dropped them.',
    'CREATE TEMP TABLE bcb_zero_state_roles (role_name name PRIMARY KEY) ON COMMIT DROP;',
    `INSERT INTO bcb_zero_state_roles (role_name) VALUES ${zeroStateExpectedRoleSql(declaration)};`,
    '-- Existing identities are a separate working set used only for destructive DDL.',
    'CREATE TEMP TABLE bcb_zero_state_existing_roles (role_name name PRIMARY KEY) ON COMMIT DROP;',
    'CREATE TEMP TABLE bcb_zero_state_grantees (role_oid oid PRIMARY KEY, grantee_sql text NOT NULL) ON COMMIT DROP;',
    'DO $bcb$',
    'BEGIN',
    "  IF pg_catalog.to_regclass('pg_temp.bcb_zero_state_txn_guard') IS NULL THEN",
    "    RAISE EXCEPTION 'zero-state must run in one transaction (psql -1)';",
    '  END IF;',
    `  IF pg_catalog.current_database() <> ${lit(dbName)} THEN`,
    `    RAISE EXCEPTION 'zero-state for % applied to %', ${lit(dbName)}, pg_catalog.current_database();`,
    '  END IF;',
    `  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ANY (${roleArray}) AND rolsuper) THEN`,
    "    RAISE EXCEPTION 'an application identity is SUPERUSER; zero-state refuses a silent exclusion';",
    '  END IF;',
    'END',
    '$bcb$;',
    `INSERT INTO bcb_zero_state_existing_roles SELECT rolname FROM pg_catalog.pg_roles WHERE rolname = ANY (${roleArray});`,
    "INSERT INTO bcb_zero_state_grantees VALUES (0, 'PUBLIC');",
    "INSERT INTO bcb_zero_state_grantees SELECT oid, pg_catalog.format('%I', rolname) FROM pg_catalog.pg_roles WHERE rolname <> 'postgres';",
    '',
    '-- Stop every non-superuser session in this database. Cluster role attributes and memberships are untouched.',
    'SELECT pg_catalog.pg_terminate_backend(activity.pid)',
    '  FROM pg_catalog.pg_stat_activity activity',
    '  JOIN pg_catalog.pg_roles session_role ON session_role.rolname = activity.usename',
    ' WHERE activity.datname = pg_catalog.current_database()',
    '   AND activity.pid <> pg_catalog.pg_backend_pid() AND NOT session_role.rolsuper;',
    '-- A prior revision-11 install may already have the target-local birth wall.  Remove only',
    '-- that event trigger before the neutral-owner pass; the install transaction recreates it.',
    'DROP EVENT TRIGGER IF EXISTS bcb_relation_birth_wall;',
    'DO $bcb$ DECLARE target record; BEGIN',
    '  FOR target IN SELECT role_name FROM bcb_zero_state_existing_roles ORDER BY role_name LOOP',
    `    EXECUTE pg_catalog.format('ALTER ROLE %I IN DATABASE %I RESET ALL', target.role_name, ${lit(dbName)});`,
    '  END LOOP;',
    'END $bcb$;',
    '',
    '-- Preserve every object, but remove ownership, ACL and default-ACL dependencies of retired identities.',
    `ALTER DATABASE ${q(dbName)} OWNER TO postgres;`,
    `REVOKE ALL PRIVILEGES ON DATABASE ${q(dbName)} FROM PUBLIC;`,
    '-- REASSIGN OWNED / DROP OWNED are intentionally forbidden here: PostgreSQL also applies',
    '-- them to shared database objects and would revoke or rewrite the sibling database.  The',
    '-- catalog-driven owner/ACL/default-ACL passes below are exact to current_database().',
    '',
    '-- One neutral DBA owner remains; every non-system schema and object is preserved.',
    'DO $bcb$ DECLARE object record; BEGIN',
    '  FOR object IN SELECT nspname FROM pg_catalog.pg_namespace',
    "                 WHERE nspname <> 'information_schema' AND nspname !~ '^pg_' ORDER BY nspname LOOP",
    "    EXECUTE pg_catalog.format('ALTER SCHEMA %I OWNER TO postgres', object.nspname);",
    '  END LOOP;',
    '  FOR object IN SELECT namespace.nspname, relation.relname, relation.relkind',
    '                  FROM pg_catalog.pg_class relation',
    '                  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace',
    "                 WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_'",
    "                   AND relation.relkind IN ('r','p','v','m','f','S') ORDER BY 1, 2 LOOP",
    "    EXECUTE pg_catalog.format('ALTER %s %I.%I OWNER TO postgres', CASE object.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' WHEN 'S' THEN 'SEQUENCE' ELSE 'TABLE' END, object.nspname, object.relname);",
    '  END LOOP;',
    '  FOR object IN SELECT namespace.nspname, routine.proname, routine.prokind,',
    '                       pg_catalog.pg_get_function_identity_arguments(routine.oid) AS args',
    '                  FROM pg_catalog.pg_proc routine',
    '                  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = routine.pronamespace',
    "                 WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_' ORDER BY 1, 2, 4 LOOP",
    "    EXECUTE pg_catalog.format('ALTER %s %I.%I(%s) OWNER TO postgres', CASE object.prokind WHEN 'a' THEN 'AGGREGATE' ELSE 'ROUTINE' END, object.nspname, object.proname, object.args);",
    '  END LOOP;',
    '  FOR object IN SELECT namespace.nspname, object_type.typname',
    '                  FROM pg_catalog.pg_type object_type',
    '                  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = object_type.typnamespace',
    "                 WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_'",
    "                   AND object_type.typtype IN ('b','c','d','e','r','m') AND object_type.typelem = 0",
    "                   AND (object_type.typrelid = 0 OR EXISTS (SELECT 1 FROM pg_catalog.pg_class composite WHERE composite.oid = object_type.typrelid AND composite.relkind = 'c'))",
    '                 ORDER BY 1, 2 LOOP',
    "    EXECUTE pg_catalog.format('ALTER TYPE %I.%I OWNER TO postgres', object.nspname, object.typname);",
    '  END LOOP;',
    '  FOR object IN SELECT namespace.nspname, object_collation.collname',
    '                  FROM pg_catalog.pg_collation object_collation',
    '                  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = object_collation.collnamespace',
    "                 WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_' ORDER BY 1, 2 LOOP",
    "    EXECUTE pg_catalog.format('ALTER COLLATION %I.%I OWNER TO postgres', object.nspname, object.collname);",
    '  END LOOP;',
    '  FOR object IN SELECT oid FROM pg_catalog.pg_largeobject_metadata ORDER BY oid LOOP',
    "    EXECUTE pg_catalog.format('ALTER LARGE OBJECT %s OWNER TO postgres', object.oid);",
    '  END LOOP;',
    '  FOR object IN SELECT fdwname FROM pg_catalog.pg_foreign_data_wrapper ORDER BY fdwname LOOP',
    "    EXECUTE pg_catalog.format('ALTER FOREIGN DATA WRAPPER %I OWNER TO postgres', object.fdwname);",
    '  END LOOP;',
    '  FOR object IN SELECT srvname FROM pg_catalog.pg_foreign_server ORDER BY srvname LOOP',
    "    EXECUTE pg_catalog.format('ALTER SERVER %I OWNER TO postgres', object.srvname);",
    '  END LOOP;',
    "  FOR object IN SELECT lanname FROM pg_catalog.pg_language WHERE lanname <> 'internal' ORDER BY lanname LOOP",
    "    EXECUTE pg_catalog.format('ALTER LANGUAGE %I OWNER TO postgres', object.lanname);",
    '  END LOOP;',
    'END $bcb$;',
    '',
    '-- Remove every old grant, including unknown non-application grantees; roles themselves are not inferred or dropped.',
    'DO $bcb$ DECLARE grantee record; object record; schema_name name; BEGIN',
    '  FOR grantee IN SELECT grantee_sql FROM bcb_zero_state_grantees ORDER BY role_oid LOOP',
    `    EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM %s', ${lit(dbName)}, grantee.grantee_sql);`,
    '    FOR schema_name IN SELECT nspname FROM pg_catalog.pg_namespace',
    "                        WHERE nspname <> 'information_schema' AND nspname !~ '^pg_' ORDER BY nspname LOOP",
    "      EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON SCHEMA %I FROM %s', schema_name, grantee.grantee_sql);",
    "      EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I FROM %s', schema_name, grantee.grantee_sql);",
    "      EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I FROM %s', schema_name, grantee.grantee_sql);",
    "      EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA %I FROM %s', schema_name, grantee.grantee_sql);",
    '    END LOOP;',
    '  END LOOP;',
    '  FOR object IN SELECT lanname FROM pg_catalog.pg_language WHERE lanpltrusted ORDER BY lanname LOOP',
    '    FOR grantee IN SELECT grantee_sql FROM bcb_zero_state_grantees ORDER BY role_oid LOOP',
    "      EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON LANGUAGE %I FROM %s', object.lanname, grantee.grantee_sql);",
    '    END LOOP;',
    '  END LOOP;',
    'END $bcb$;',
    'DO $bcb$ DECLARE column_acl record; BEGIN',
    '  FOR column_acl IN',
    '    SELECT acl.privilege_type, attribute.attname, namespace.nspname, relation.relname, grantee.grantee_sql',
    '      FROM pg_catalog.pg_attribute attribute',
    '      JOIN pg_catalog.pg_class relation ON relation.oid = attribute.attrelid',
    '      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace',
    '      CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) acl',
    '      JOIN bcb_zero_state_grantees grantee ON grantee.role_oid = acl.grantee',
    "     WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_'",
    '       AND attribute.attnum > 0 AND NOT attribute.attisdropped ORDER BY 3, 4, 2, 1',
    '  LOOP',
    "    EXECUTE pg_catalog.format('REVOKE %s (%I) ON TABLE %I.%I FROM %s', column_acl.privilege_type, column_acl.attname, column_acl.nspname, column_acl.relname, column_acl.grantee_sql);",
    '  END LOOP;',
    'END $bcb$;',
    'DO $bcb$ DECLARE object record; grantee record; BEGIN',
    '  FOR object IN SELECT namespace.nspname, object_type.typname',
    '                  FROM pg_catalog.pg_type object_type',
    '                  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = object_type.typnamespace',
    "                 WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_'",
    "                   AND object_type.typtype IN ('b','c','d','e','r','m') AND object_type.typelem = 0",
    "                   AND (object_type.typrelid = 0 OR EXISTS (SELECT 1 FROM pg_catalog.pg_class composite WHERE composite.oid = object_type.typrelid AND composite.relkind = 'c'))",
    '                 ORDER BY 1, 2 LOOP',
    '    FOR grantee IN SELECT grantee_sql FROM bcb_zero_state_grantees ORDER BY role_oid LOOP',
    "      EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON TYPE %I.%I FROM %s', object.nspname, object.typname, grantee.grantee_sql);",
    '    END LOOP;',
    '  END LOOP;',
    '  FOR object IN SELECT oid FROM pg_catalog.pg_largeobject_metadata ORDER BY oid LOOP',
    '    FOR grantee IN SELECT grantee_sql FROM bcb_zero_state_grantees ORDER BY role_oid LOOP',
    "      EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON LARGE OBJECT %s FROM %s', object.oid, grantee.grantee_sql);",
    '    END LOOP;',
    '  END LOOP;',
    '  FOR object IN SELECT fdwname FROM pg_catalog.pg_foreign_data_wrapper ORDER BY fdwname LOOP',
    '    FOR grantee IN SELECT grantee_sql FROM bcb_zero_state_grantees ORDER BY role_oid LOOP',
    "      EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON FOREIGN DATA WRAPPER %I FROM %s', object.fdwname, grantee.grantee_sql);",
    '    END LOOP;',
    '  END LOOP;',
    '  FOR object IN SELECT srvname FROM pg_catalog.pg_foreign_server ORDER BY srvname LOOP',
    '    FOR grantee IN SELECT grantee_sql FROM bcb_zero_state_grantees ORDER BY role_oid LOOP',
    "      EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON FOREIGN SERVER %I FROM %s', object.srvname, grantee.grantee_sql);",
    '    END LOOP;',
    '  END LOOP;',
    'END $bcb$;',
    '',
    '-- Existing and future PostgreSQL-created objects are deny-by-default for PUBLIC.',
    'DO $bcb$ DECLARE default_acl record; BEGIN',
    '  FOR default_acl IN',
    '    SELECT DISTINCT owner_role.rolname, namespace.nspname, grantee.grantee_sql, stored_default.defaclobjtype',
    '      FROM pg_catalog.pg_default_acl stored_default',
    '      JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = stored_default.defaclrole',
    '      LEFT JOIN pg_catalog.pg_namespace namespace ON namespace.oid = stored_default.defaclnamespace',
    '      CROSS JOIN LATERAL pg_catalog.aclexplode(stored_default.defaclacl) acl',
    '      JOIN bcb_zero_state_grantees grantee ON grantee.role_oid = acl.grantee',
    '     WHERE acl.grantee <> stored_default.defaclrole ORDER BY 1, 2 NULLS FIRST, 4',
    '  LOOP',
    "    EXECUTE pg_catalog.format('ALTER DEFAULT PRIVILEGES FOR ROLE %I%s REVOKE ALL PRIVILEGES ON %s FROM %s',",
    '      default_acl.rolname, CASE WHEN default_acl.nspname IS NULL THEN \'\' ELSE pg_catalog.format(\' IN SCHEMA %I\', default_acl.nspname) END,',
    "      CASE default_acl.defaclobjtype WHEN 'r' THEN 'TABLES' WHEN 'S' THEN 'SEQUENCES' WHEN 'f' THEN 'ROUTINES' WHEN 'T' THEN 'TYPES' WHEN 'n' THEN 'SCHEMAS' ELSE 'TABLES' END, default_acl.grantee_sql);",
    '  END LOOP;',
    'END $bcb$;',
    'ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;',
    'ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC;',
    'ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE ALL PRIVILEGES ON ROUTINES FROM PUBLIC;',
    'ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE ALL PRIVILEGES ON TYPES FROM PUBLIC;',
    'ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE ALL PRIVILEGES ON SCHEMAS FROM PUBLIC;',
  );
  out.push(
    'DO $bcb$ DECLARE schema_name name; object_type text; BEGIN',
    '  FOR schema_name IN SELECT nspname FROM pg_catalog.pg_namespace',
    "                      WHERE nspname <> 'information_schema' AND nspname !~ '^pg_' ORDER BY nspname LOOP",
    "    FOREACH object_type IN ARRAY ARRAY['TABLES','SEQUENCES','ROUTINES','TYPES'] LOOP",
    "      EXECUTE pg_catalog.format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA %I REVOKE ALL PRIVILEGES ON %s FROM PUBLIC', schema_name, object_type);",
    '    END LOOP;',
    '  END LOOP;',
    'END $bcb$;',
    '',
    '-- No policy survives; every base/partitioned table has native FORCE RLS default deny.',
    'DO $bcb$ DECLARE object record; BEGIN',
    '  FOR object IN SELECT namespace.nspname, relation.relname, policy.polname',
    '                  FROM pg_catalog.pg_policy policy',
    '                  JOIN pg_catalog.pg_class relation ON relation.oid = policy.polrelid',
    '                  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace',
    "                 WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_' ORDER BY 1, 2, 3 LOOP",
    "    EXECUTE pg_catalog.format('DROP POLICY %I ON %I.%I', object.polname, object.nspname, object.relname);",
    '  END LOOP;',
    '  FOR object IN SELECT namespace.nspname, relation.relname',
    '                  FROM pg_catalog.pg_class relation',
    '                  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace',
    "                 WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_'",
    "                   AND relation.relkind IN ('r','p') ORDER BY 1, 2 LOOP",
    "    EXECUTE pg_catalog.format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', object.nspname, object.relname);",
    "    EXECUTE pg_catalog.format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', object.nspname, object.relname);",
    '  END LOOP;',
    'END $bcb$;',
    '',
    '-- Per-database zero-state verifier: ACL, ownership, defaults, policies and FORCE RLS.',
    'DO $bcb$ DECLARE bad text; BEGIN',
    '  SELECT namespace.nspname || \'.\' || relation.relname INTO bad',
    '    FROM pg_catalog.pg_class relation JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace',
    "   WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_' AND relation.relkind IN ('r','p')",
    '     AND (NOT relation.relrowsecurity OR NOT relation.relforcerowsecurity) LIMIT 1;',
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'zero-state table is not FORCE RLS: %', bad; END IF;",
    '  SELECT namespace.nspname || \'.\' || relation.relname || \':\' || policy.polname INTO bad',
    '    FROM pg_catalog.pg_policy policy JOIN pg_catalog.pg_class relation ON relation.oid = policy.polrelid',
    '    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace',
    "   WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_' LIMIT 1;",
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'zero-state policy survived: %', bad; END IF;",
    '  WITH acl(grantee, owner_oid, object_name) AS (',
    `    SELECT acl.grantee, database.datdba, 'database:' || database.datname FROM pg_catalog.pg_database database CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(database.datacl, pg_catalog.acldefault('d', database.datdba))) acl WHERE database.datname = ${lit(dbName)}`,
    "    UNION ALL SELECT acl.grantee, namespace.nspowner, 'schema:' || namespace.nspname FROM pg_catalog.pg_namespace namespace CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(namespace.nspacl, pg_catalog.acldefault('n', namespace.nspowner))) acl",
    "      WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_'",
    "    UNION ALL SELECT acl.grantee, relation.relowner, 'relation:' || namespace.nspname || '.' || relation.relname FROM pg_catalog.pg_class relation JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace",
    "      CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(relation.relacl, pg_catalog.acldefault(CASE WHEN relation.relkind = 'S' THEN 'S'::\"char\" ELSE 'r'::\"char\" END, relation.relowner))) acl",
    "      WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_' AND relation.relkind IN ('r','p','v','m','f','S')",
    "    UNION ALL SELECT acl.grantee, relation.relowner, 'column:' || namespace.nspname || '.' || relation.relname || '.' || attribute.attname FROM pg_catalog.pg_attribute attribute JOIN pg_catalog.pg_class relation ON relation.oid = attribute.attrelid JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) acl",
    "      WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_' AND attribute.attnum > 0 AND NOT attribute.attisdropped",
    "    UNION ALL SELECT acl.grantee, routine.proowner, 'routine:' || namespace.nspname || '.' || routine.proname FROM pg_catalog.pg_proc routine JOIN pg_catalog.pg_namespace namespace ON namespace.oid = routine.pronamespace CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(routine.proacl, pg_catalog.acldefault('f', routine.proowner))) acl",
    "      WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_'",
    "    UNION ALL SELECT acl.grantee, object.typowner, 'type:' || namespace.nspname || '.' || object.typname FROM pg_catalog.pg_type object JOIN pg_catalog.pg_namespace namespace ON namespace.oid = object.typnamespace CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(object.typacl, pg_catalog.acldefault('T', object.typowner))) acl",
    "      WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_' AND object.typtype IN ('b','c','d','e','r','m') AND object.typelem = 0 AND (object.typrelid = 0 OR EXISTS (SELECT 1 FROM pg_catalog.pg_class composite WHERE composite.oid = object.typrelid AND composite.relkind = 'c'))",
    "    UNION ALL SELECT acl.grantee, object.lomowner, 'large_object:' || object.oid::text FROM pg_catalog.pg_largeobject_metadata object CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(object.lomacl, pg_catalog.acldefault('L', object.lomowner))) acl",
    "    UNION ALL SELECT acl.grantee, wrapper.fdwowner, 'fdw:' || wrapper.fdwname FROM pg_catalog.pg_foreign_data_wrapper wrapper CROSS JOIN LATERAL pg_catalog.aclexplode(wrapper.fdwacl) acl",
    "    UNION ALL SELECT acl.grantee, server.srvowner, 'server:' || server.srvname FROM pg_catalog.pg_foreign_server server CROSS JOIN LATERAL pg_catalog.aclexplode(server.srvacl) acl",
    "    UNION ALL SELECT acl.grantee, language.lanowner, 'language:' || language.lanname FROM pg_catalog.pg_language language CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(language.lanacl, pg_catalog.acldefault('l', language.lanowner))) acl WHERE language.lanpltrusted",
    "    UNION ALL SELECT acl.grantee, defaults.defaclrole, 'default_acl:' || owner_role.rolname FROM pg_catalog.pg_default_acl defaults JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = defaults.defaclrole CROSS JOIN LATERAL pg_catalog.aclexplode(defaults.defaclacl) acl",
    '  ) SELECT object_name INTO bad FROM acl WHERE grantee <> owner_oid LIMIT 1;',
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'zero-state ACL survived: %', bad; END IF;",
    '  WITH owner_ref(owner_oid, object_name) AS (',
    `    SELECT database.datdba, 'database:' || database.datname FROM pg_catalog.pg_database database WHERE database.datname = ${lit(dbName)}`,
    "    UNION ALL SELECT namespace.nspowner, 'schema:' || namespace.nspname FROM pg_catalog.pg_namespace namespace WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_'",
    "    UNION ALL SELECT relation.relowner, 'relation:' || namespace.nspname || '.' || relation.relname FROM pg_catalog.pg_class relation JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_'",
    "    UNION ALL SELECT routine.proowner, 'routine:' || namespace.nspname || '.' || routine.proname FROM pg_catalog.pg_proc routine JOIN pg_catalog.pg_namespace namespace ON namespace.oid = routine.pronamespace WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_'",
    "    UNION ALL SELECT object.typowner, 'type:' || namespace.nspname || '.' || object.typname FROM pg_catalog.pg_type object JOIN pg_catalog.pg_namespace namespace ON namespace.oid = object.typnamespace WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_' AND object.typtype IN ('b','c','d','e','r','m') AND object.typelem = 0 AND (object.typrelid = 0 OR EXISTS (SELECT 1 FROM pg_catalog.pg_class composite WHERE composite.oid = object.typrelid AND composite.relkind = 'c'))",
    "    UNION ALL SELECT object.collowner, 'collation:' || namespace.nspname || '.' || object.collname FROM pg_catalog.pg_collation object JOIN pg_catalog.pg_namespace namespace ON namespace.oid = object.collnamespace WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_'",
    "    UNION ALL SELECT object.lomowner, 'large_object:' || object.oid::text FROM pg_catalog.pg_largeobject_metadata object",
    "    UNION ALL SELECT object.fdwowner, 'fdw:' || object.fdwname FROM pg_catalog.pg_foreign_data_wrapper object",
    "    UNION ALL SELECT object.srvowner, 'server:' || object.srvname FROM pg_catalog.pg_foreign_server object",
    "    UNION ALL SELECT object.lanowner, 'language:' || object.lanname FROM pg_catalog.pg_language object WHERE object.lanname <> 'internal'",
    '  ) SELECT object_name INTO bad FROM owner_ref JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = owner_ref.owner_oid',
    "     WHERE owner_role.rolname <> 'postgres' LIMIT 1;",
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'zero-state non-DBA owner survived: %', bad; END IF;",
    `  RAISE NOTICE 'BCB_ZERO_STATE_VERIFIED database=${dbName}';`,
    'END $bcb$;',
    '',
    '-- end zero-state database migration.',
  );
  return `${out.join('\n')}\n`;
}

/** Legacy-only cluster cleanup. Shared target roles and declared runtime logins are never candidates.
 * A legacy role is removed only when the cluster catalog proves that no database, membership or
 * active backend still depends on it; otherwise it remains inert for a later target cutover. */
export function generateZeroStateClusterSql(declaration, options = {}) {
  const source = options.source ?? 'deploy/postgres/privileges/declaration.ts';
  const managed = new Set(managedRoleNames(declaration));
  const declaredLogins = new Set(Object.values(declaration.envMapping ?? {}).flatMap((records) => Object.keys(records)));
  const roles = [...new Set(declaration.zeroState?.legacyRoles ?? [])]
    .filter((role) => !managed.has(role) && !declaredLogins.has(role))
    .sort();
  if (roles.length === 0) throw new DeclarationGapError([{ site: 'zeroState.legacyRoles', reason: 'no legacy-only roles declared' }]);
  const roleArray = `ARRAY[${roles.map(lit).join(', ')}]::name[]`;
  const out = [
    '-- ============================================================================',
    '-- СГЕНЕРИРОВАННАЯ УБОРКА LEGACY ROLES — SHARED TARGET ROLES НЕ УДАЛЯЕТ.',
    `-- источник:   ${source}`,
    '-- безопасно повторять после per-database zero; роли с зависимостями остаются до следующего target.',
    '-- ============================================================================',
    '',
    '\\set ON_ERROR_STOP on',
    '',
    'CREATE TEMP TABLE bcb_zero_state_cluster_guard ON COMMIT DROP AS SELECT 1;',
    'CREATE TEMP TABLE bcb_zero_state_cluster_roles (role_name name PRIMARY KEY) ON COMMIT DROP;',
    `INSERT INTO bcb_zero_state_cluster_roles SELECT rolname FROM pg_catalog.pg_roles WHERE rolname = ANY (${roleArray});`,
    'DO $bcb$ DECLARE target record; dependency_count bigint; membership_count bigint; backend_count bigint; BEGIN',
    `  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ANY (${roleArray}) AND rolsuper) THEN`,
    "    RAISE EXCEPTION 'application identity is SUPERUSER; cluster zero-state refused';",
    '  END IF;',
    '  FOR target IN SELECT role_name FROM bcb_zero_state_cluster_roles ORDER BY role_name LOOP',
    '    SELECT count(*) INTO dependency_count FROM pg_catalog.pg_shdepend dependency',
    "     WHERE dependency.refclassid = 'pg_authid'::pg_catalog.regclass",
    '       AND dependency.refobjid = target.role_name::regrole;',
    '    SELECT count(*) INTO membership_count FROM pg_catalog.pg_auth_members membership',
    '     WHERE membership.roleid = target.role_name::regrole OR membership.member = target.role_name::regrole;',
    '    SELECT count(*) INTO backend_count FROM pg_catalog.pg_stat_activity activity WHERE activity.usename = target.role_name;',
    '    IF dependency_count = 0 AND membership_count = 0 AND backend_count = 0 THEN',
    "      EXECUTE pg_catalog.format('DROP ROLE %I', target.role_name);",
    '    ELSE',
    "      RAISE NOTICE 'legacy role % retained: dependencies=%, memberships=%, backends=%', target.role_name, dependency_count, membership_count, backend_count;",
    '    END IF;',
    '  END LOOP;',
    'END $bcb$;',
    'DO $bcb$ BEGIN',
    "  RAISE NOTICE 'BCB_LEGACY_ROLE_CLEANUP_RECONCILED';",
    'END $bcb$;',
    '',
    '-- end legacy-only cluster cleanup.',
  ];
  return `${out.join('\n')}\n`;
}

/** Idempotent shared role baseline. It never drops a role and keeps every declared login-to-role
 * edge, including a sibling environment that has already completed its cutover. */
export function generateSharedRoleBaselineSql(declaration) {
  const managed = managedRoleNames(declaration);
  const expectedMemberships = [];
  for (const [roleName, role] of Object.entries(declaration.cluster.roles)) {
    if (role.kind === 'superuser') continue;
    for (const membership of role.grantedTo ?? []) {
      expectedMemberships.push([roleName, membership.role, membership.admin, membership.inherit, membership.set]);
    }
  }
  for (const records of Object.values(declaration.envMapping ?? {})) {
    for (const [loginName, record] of Object.entries(records)) {
      for (const membership of record.memberships ?? []) {
        expectedMemberships.push([
          membership.role, loginName, membership.admin, membership.inherit, membership.set,
        ]);
      }
    }
  }
  const rows = expectedMemberships
    .sort(([aRole, aMember], [bRole, bMember]) => `${aRole}:${aMember}`.localeCompare(`${bRole}:${bMember}`))
    .map(([role, member, admin, inherit, set]) => `(${lit(role)}::name,${lit(member)}::name,${admin},${inherit},${set})`);
  const expectedSql = rows.length > 0 ? rows.join(',\n') : "(''::name,''::name,false,false,false)";
  const out = [
    '-- Idempotent shared target-role baseline; no DROP ROLE and no per-database object DDL.',
    'CREATE TEMP TABLE bcb_expected_shared_memberships(role_name name, member_name name, admin_option boolean, inherit_option boolean, set_option boolean) ON COMMIT DROP;',
    `INSERT INTO bcb_expected_shared_memberships VALUES ${expectedSql};`,
  ];
  for (const roleName of managed) {
    const role = declaration.cluster.roles[roleName];
    out.push(
      'DO $bcb$', 'BEGIN',
      `  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=${lit(roleName)}) THEN CREATE ROLE ${q(roleName)} NOLOGIN; END IF;`,
      'END', '$bcb$;',
      `ALTER ROLE ${q(roleName)} ${roleAttributeClause(role)};`,
    );
    emitRolconfig(out, roleName, role.rolconfig, `cluster.roles.${roleName}.rolconfig`);
  }
  out.push(
    'DO $bcb$ DECLARE edge record; BEGIN',
    '  FOR edge IN SELECT granted.rolname AS role_name, member.rolname AS member_name',
    '    FROM pg_catalog.pg_auth_members membership',
    '    JOIN pg_catalog.pg_roles granted ON granted.oid=membership.roleid',
    '    JOIN pg_catalog.pg_roles member ON member.oid=membership.member',
    `   WHERE (granted.rolname=ANY(ARRAY[${managed.map(lit).join(', ')}]::name[]) OR member.rolname=ANY(ARRAY[${managed.map(lit).join(', ')}]::name[]))`,
    '     AND NOT EXISTS (SELECT 1 FROM bcb_expected_shared_memberships expected WHERE expected.role_name=granted.rolname AND expected.member_name=member.rolname AND expected.admin_option=membership.admin_option AND expected.inherit_option=membership.inherit_option AND expected.set_option=membership.set_option)',
    '   ORDER BY 1,2 LOOP',
    "    EXECUTE pg_catalog.format('REVOKE %I FROM %I',edge.role_name,edge.member_name);",
    '  END LOOP;',
    'END $bcb$;',
    'DO $bcb$ DECLARE edge record; BEGIN',
    '  FOR edge IN SELECT expected.* FROM bcb_expected_shared_memberships expected',
    '   WHERE EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=expected.role_name)',
    '     AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=expected.member_name)',
    '   ORDER BY expected.role_name,expected.member_name LOOP',
    "    EXECUTE pg_catalog.format('GRANT %I TO %I WITH ADMIN %s, INHERIT %s, SET %s',edge.role_name,edge.member_name,CASE WHEN edge.admin_option THEN 'TRUE' ELSE 'FALSE' END,CASE WHEN edge.inherit_option THEN 'TRUE' ELSE 'FALSE' END,CASE WHEN edge.set_option THEN 'TRUE' ELSE 'FALSE' END);",
    '  END LOOP;',
    'END $bcb$;',
    "DO $bcb$ BEGIN RAISE NOTICE 'BCB_SHARED_ROLE_BASELINE_RECONCILED'; END $bcb$;",
    '',
  );
  return out.join('\n');
}

/** Drop only the selected environment's login shells after the target database is proven zero.
 * Legacy roles are opportunistic: they are removed only after the same cross-database dependency
 * proof, and otherwise retained for the sibling database's later cutover. */
export function generateTargetLoginCleanupSql(declaration, env, dbName) {
  const records = environmentLoginRecords(declaration, env, dbName);
  const targetLogins = records.map(([name]) => name);
  const managed = new Set(managedRoleNames(declaration));
  const declaredLogins = new Set(Object.values(declaration.envMapping ?? {}).flatMap((mapping) => Object.keys(mapping)));
  const legacy = [...new Set(declaration.zeroState?.legacyRoles ?? [])]
    .filter((name) => !managed.has(name) && !declaredLogins.has(name))
    .sort();
  const candidates = [
    ...targetLogins.map((name) => `(${lit(name)}::name,true)`),
    ...legacy.map((name) => `(${lit(name)}::name,false)`),
  ].join(',\n');
  return [
    '-- Cross-database dependency-gated cleanup for one target environment.',
    'CREATE TEMP TABLE bcb_target_login_cleanup(role_name name PRIMARY KEY, required_target boolean) ON COMMIT DROP;',
    `INSERT INTO bcb_target_login_cleanup VALUES ${candidates};`,
    'DO $bcb$ DECLARE candidate record; edge record; role_oid oid; dependency_count bigint; membership_count bigint; backend_count bigint; BEGIN',
    `  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datname=${lit(dbName)}) THEN RAISE EXCEPTION 'target database does not exist: %',${lit(dbName)}; END IF;`,
    '  FOR candidate IN SELECT * FROM bcb_target_login_cleanup ORDER BY required_target DESC,role_name LOOP',
    '    SELECT oid INTO role_oid FROM pg_catalog.pg_roles WHERE rolname=candidate.role_name;',
    '    IF role_oid IS NULL THEN CONTINUE; END IF;',
    '    SELECT count(*) INTO dependency_count FROM pg_catalog.pg_shdepend dependency',
    "     WHERE dependency.refclassid='pg_authid'::pg_catalog.regclass AND dependency.refobjid=role_oid;",
    '    SELECT count(*) INTO membership_count FROM pg_catalog.pg_auth_members membership',
    '     WHERE membership.roleid=role_oid OR membership.member=role_oid;',
    '    SELECT count(*) INTO backend_count FROM pg_catalog.pg_stat_activity activity WHERE activity.usesysid=role_oid;',
    '    IF dependency_count <> 0 OR (NOT candidate.required_target AND membership_count <> 0) OR backend_count <> 0 THEN',
    '      IF candidate.required_target THEN',
    "        RAISE EXCEPTION 'target login % has cross-database/cluster dependencies: dependencies=%, memberships=%, backends=%',candidate.role_name,dependency_count,membership_count,backend_count;",
    '      END IF;',
    "      RAISE NOTICE 'legacy role % retained: dependencies=%, memberships=%, backends=%',candidate.role_name,dependency_count,membership_count,backend_count;",
    '      CONTINUE;',
    '    END IF;',
    '    IF candidate.required_target THEN',
    '      PERFORM pg_catalog.pg_terminate_backend(pid) FROM pg_catalog.pg_stat_activity WHERE usesysid=role_oid AND pid<>pg_catalog.pg_backend_pid();',
    '      FOR edge IN SELECT granted.rolname AS role_name,member.rolname AS member_name FROM pg_catalog.pg_auth_members membership JOIN pg_catalog.pg_roles granted ON granted.oid=membership.roleid JOIN pg_catalog.pg_roles member ON member.oid=membership.member WHERE membership.roleid=role_oid OR membership.member=role_oid LOOP',
    "        EXECUTE pg_catalog.format('REVOKE %I FROM %I',edge.role_name,edge.member_name);",
    '      END LOOP;',
    '    END IF;',
    "    EXECUTE pg_catalog.format('DROP ROLE %I',candidate.role_name);",
    '  END LOOP;',
    'END $bcb$;',
    `DO $bcb$ DECLARE bad name; BEGIN SELECT rolname INTO bad FROM pg_catalog.pg_roles WHERE rolname=ANY(ARRAY[${targetLogins.map(lit).join(', ')}]::name[]) LIMIT 1; IF bad IS NOT NULL THEN RAISE EXCEPTION 'target login cleanup incomplete: %',bad; END IF; RAISE NOTICE 'BCB_TARGET_LOGIN_CLEANUP_VERIFIED env=${env} database=${dbName}'; END $bcb$;`,
    '',
  ].join('\n');
}

/** Read-only per-database post-zero precondition used by the single-target installer.
 * Shared cluster roles and sibling-environment logins may legitimately remain. */
export function generateZeroStateVerifierSql(declaration, dbName) {
  if (!declaration.databases?.[dbName]) {
    throw new DeclarationGapError([{ site: `databases.${dbName}`, reason: 'database is absent' }]);
  }
  return [
    '-- Declaration-owned per-database post-zero verifier (read-only).',
    'DO $bcb$', 'DECLARE bad text;', 'BEGIN',
    "  SELECT namespace.nspname || '.' || relation.relname INTO bad FROM pg_catalog.pg_class relation JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_' AND relation.relkind IN ('r','p') AND (NOT relation.relrowsecurity OR NOT relation.relforcerowsecurity) LIMIT 1;",
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'zero-state table is not FORCE RLS: %', bad; END IF;",
    "  SELECT namespace.nspname || '.' || relation.relname || ':' || policy.polname INTO bad FROM pg_catalog.pg_policy policy JOIN pg_catalog.pg_class relation ON relation.oid=policy.polrelid JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_' LIMIT 1;",
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'zero-state policy survived: %', bad; END IF;",
    "  SELECT namespace.nspname || '.' || relation.relname INTO bad FROM pg_catalog.pg_class relation JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(relation.relacl,pg_catalog.acldefault(CASE WHEN relation.relkind='S' THEN 'S'::\"char\" ELSE 'r'::\"char\" END,relation.relowner))) acl WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_' AND relation.relkind IN ('r','p','v','m','f','S') AND acl.grantee <> relation.relowner LIMIT 1;",
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'zero-state relation ACL survived: %', bad; END IF;",
    "  SELECT namespace.nspname || '.' || relation.relname || '.' || attribute.attname INTO bad FROM pg_catalog.pg_attribute attribute JOIN pg_catalog.pg_class relation ON relation.oid=attribute.attrelid JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) acl WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_' AND attribute.attnum>0 AND NOT attribute.attisdropped AND acl.grantee <> relation.relowner LIMIT 1;",
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'zero-state column ACL survived: %', bad; END IF;",
    "  SELECT namespace.nspname || '.' || routine.proname INTO bad FROM pg_catalog.pg_proc routine JOIN pg_catalog.pg_namespace namespace ON namespace.oid=routine.pronamespace CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(routine.proacl,pg_catalog.acldefault('f',routine.proowner))) acl WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_' AND acl.grantee <> routine.proowner LIMIT 1;",
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'zero-state routine ACL survived: %', bad; END IF;",
    "  SELECT namespace.nspname INTO bad FROM pg_catalog.pg_namespace namespace CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(namespace.nspacl,pg_catalog.acldefault('n',namespace.nspowner))) acl WHERE namespace.nspname <> 'information_schema' AND namespace.nspname !~ '^pg_' AND acl.grantee <> namespace.nspowner LIMIT 1;",
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'zero-state schema ACL survived: %', bad; END IF;",
    "  SELECT 'PUBLIC database ACL' INTO bad FROM pg_catalog.pg_database database CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(database.datacl,pg_catalog.acldefault('d',database.datdba))) acl WHERE database.datname=current_database() AND acl.grantee=0 LIMIT 1;",
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'zero-state PUBLIC ACL survived: %', bad; END IF;",
    "  RAISE NOTICE 'BCB_ZERO_STATE_VERIFIED database=" + dbName + "';", 'END $bcb$;', '',
  ].join('\n');
}

function emitTableGrants(out, targetSql, grants, granteeFilter) {
  for (const grantee of sortedKeys(grants)) {
    if (!granteeFilter(grantee)) continue;
    const set = grantPrivs(grants[grantee]) ?? [];
    const tableLevel = sortPrivs(set.filter((e) => typeof e === 'string'));
    if (tableLevel.length > 0) {
      out.push(`GRANT ${tableLevel.join(', ')} ON TABLE ${targetSql} TO ${q(grantee)};`);
    }
    const columnGrants = set.filter((e) => e && typeof e === 'object' && e.kind === 'columns');
    columnGrants.sort((a, b) => PRIV_ORDER.indexOf(a.priv) - PRIV_ORDER.indexOf(b.priv));
    for (const cg of columnGrants) {
      const cols = [...cg.columns].sort().map(q).join(', ');
      const grantOption = cg.grantable === true ? ' WITH GRANT OPTION' : '';
      out.push(`GRANT ${cg.priv} (${cols}) ON TABLE ${targetSql} TO ${q(grantee)}${grantOption};`);
    }
  }
}

/* ─────────────────────────── генерация SQL ─────────────────────────── */

/**
 * Exact per-database function closure. It is exported separately so a disposable PostgreSQL 16
 * catalog can prove the census even while unrelated relation-access gaps keep the full artifact
 * fail-closed.
 */
export function generateFunctionCensusSql(declaration, dbName) {
  const db = declaration.databases?.[dbName];
  const context = declaration.portContext;
  if (!db || !context) throw new DeclarationGapError([{ site: `databases.${dbName}`, reason: 'database or port context is absent' }]);
  const dbLogins = Object.entries(declaration.envMapping ?? {}).flatMap(([, mapping]) =>
    Object.entries(mapping).filter(([, login]) => login.connect?.includes(dbName)).map(([name]) => name));
  const managed = managedRoleNames(declaration);
  const revokeTargets = (owner) => [...new Set([...managed, ...dbLogins])].filter((role) => role !== owner).sort();
  const databaseFunctions = functionEntriesForDatabase(context, dbName).sort(([a], [b]) => a.localeCompare(b));
  const seamOwners = [...new Set(databaseFunctions
    .filter(([, fn]) => fn.security === 'DEFINER')
    .map(([, fn]) => fn.owner)
    .filter(isSeamOwnerName))].sort();
  const managedSchemasSql = MANAGED_APPLICATION_SCHEMAS.map(lit).join(', ');
  const declaredFunctionValues = databaseFunctions.map(([signature]) => `(${lit(signature)})`).join(',\n');
  const out = [
    '-- Exact per-database function census: revoke first, then restore only declared identities.',
    '-- Retired SECURITY DEFINER routines are a second door; remove them before the exact census.',
    'DO $bcb$', 'DECLARE f record;', 'BEGIN',
    '  FOR f IN WITH expected(sig) AS (VALUES', declaredFunctionValues,
    '    ) SELECT n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS args',
    '        FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace',
    `       WHERE p.prosecdef AND n.nspname IN (${managedSchemasSql})`,
    "         AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend d WHERE d.classid='pg_proc'::pg_catalog.regclass AND d.objid=p.oid AND d.deptype='e')",
    '         AND NOT EXISTS (SELECT 1 FROM expected e WHERE p.oid=pg_catalog.to_regprocedure(e.sig))',
    '       ORDER BY 1,2,3 LOOP',
    "    EXECUTE pg_catalog.format('DROP ROUTINE %I.%I(%s)',f.nspname,f.proname,f.args);",
    '  END LOOP;', 'END', '$bcb$;', '',
    'DO $bcb$', 'DECLARE f record; r record;', 'BEGIN',
    "  FOR f IN SELECT n.nspname, p.proname, p.proowner, pg_catalog.pg_get_function_identity_arguments(p.oid) AS args FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace",
    `            WHERE n.nspname IN (${managedSchemasSql})`,
    "              AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend d WHERE d.classid = 'pg_proc'::pg_catalog.regclass AND d.objid = p.oid AND d.deptype = 'e') ORDER BY 1, 2, 3 LOOP",
    "    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC', f.nspname, f.proname, f.args);",
    '    FOR r IN SELECT rolname FROM pg_catalog.pg_roles WHERE oid <> f.proowner ORDER BY rolname LOOP',
    "      EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM %I', f.nspname, f.proname, f.args, r.rolname);",
    '    END LOOP;', '  END LOOP;', 'END', '$bcb$;', '',
  ];
  for (const owner of seamOwners) emitMembershipRevokeToEmpty(out, owner, true);
  if (seamOwners.length > 0) out.push('');
  for (const [signature, fn] of databaseFunctions) {
    out.push(`ALTER FUNCTION ${signature} OWNER TO ${q(fn.owner)};`);
    out.push(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC;`);
    const targets = revokeTargets(fn.owner);
    if (targets.length > 0) out.push(`REVOKE ALL ON FUNCTION ${signature} FROM ${targets.map(q).join(', ')};`);
    const execute = functionExecute(db, fn);
    if (execute.length > 0) out.push(`GRANT EXECUTE ON FUNCTION ${signature} TO ${execute.map(q).join(', ')};`);
    out.push(`ALTER FUNCTION ${signature} ${fn.security === 'DEFINER' ? 'SECURITY DEFINER' : 'SECURITY INVOKER'};`);
    out.push(`ALTER FUNCTION ${signature} ${fn.volatility};`);
    out.push(`ALTER FUNCTION ${signature} PARALLEL ${fn.parallel};`);
    out.push(`ALTER FUNCTION ${signature} RESET ALL;`);
    for (const config of fn.proconfig) {
      const eq = config.indexOf('=');
      if (eq <= 0) throw new DeclarationGapError([{ site: `portContext.functions.${signature}.proconfig`, reason: `invalid setting '${config}'` }]);
      out.push(`ALTER FUNCTION ${signature} SET ${q(config.slice(0, eq))} TO ${config.slice(eq + 1)};`);
    }
  }
  const rows = databaseFunctions.map(([signature, fn]) =>
    `(${lit(signature)}, ${lit(fn.owner)}, ${lit(fn.returns)}, ${fn.security === 'DEFINER' ? 'true' : 'false'}, ${lit({ IMMUTABLE: 'i', STABLE: 's', VOLATILE: 'v' }[fn.volatility])}, ${lit({ SAFE: 's', RESTRICTED: 'r', UNSAFE: 'u' }[fn.parallel])}, ARRAY[${fn.proconfig.map(lit).join(', ')}]::text[], ARRAY[${functionExecute(db, fn).map(lit).join(', ')}]::name[])`);
  out.push(
    '-- Bilateral catalog check for every declared signature, every direct EXECUTE grantee, and every managed-schema definer.',
    'DO $bcb$', 'DECLARE bad text;', 'BEGIN',
    '  WITH expected(sig, owner_name, result_type, is_definer, volatility, parallelism, config, execute_roles) AS (VALUES',
    rows.map((row) => `    ${row}`).join(',\n'),
    '  ) SELECT e.sig INTO bad FROM expected e LEFT JOIN pg_catalog.pg_proc p ON p.oid = pg_catalog.to_regprocedure(e.sig)',
    '      WHERE p.oid IS NULL OR pg_catalog.pg_get_userbyid(p.proowner) <> e.owner_name OR pg_catalog.format_type(p.prorettype, NULL) <> e.result_type OR p.prosecdef <> e.is_definer',
    '         OR p.provolatile <> e.volatility OR p.proparallel <> e.parallelism',
    "         OR coalesce(p.proconfig, ARRAY[]::text[]) IS DISTINCT FROM e.config",
    "         OR EXISTS (SELECT 1 FROM unnest(e.execute_roles) r WHERE r <> e.owner_name::name AND NOT EXISTS (SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a JOIN pg_catalog.pg_roles granted ON granted.oid = a.grantee WHERE a.privilege_type = 'EXECUTE' AND granted.rolname = r))",
    "         OR EXISTS (SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a LEFT JOIN pg_catalog.pg_roles granted ON granted.oid = a.grantee WHERE a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner AND (a.grantee = 0 OR granted.rolname IS NULL OR NOT granted.rolname = ANY(e.execute_roles)))",
    '       LIMIT 1;',
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'function census catalog mismatch: %', bad; END IF;",
    "  WITH expected(sig) AS (VALUES",
    databaseFunctions.map(([signature]) => `    (${lit(signature)})`).join(',\n'),
    "  ) SELECT pg_catalog.format('%I.%I(%s)', n.nspname, p.proname, pg_catalog.replace(pg_catalog.oidvectortypes(p.proargtypes), ', ', ',')) INTO bad",
    '      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace',
    `     WHERE p.prosecdef AND n.nspname IN (${managedSchemasSql})`,
    "       AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend d WHERE d.classid = 'pg_proc'::pg_catalog.regclass AND d.objid = p.oid AND d.deptype = 'e')",
    "       AND NOT EXISTS (SELECT 1 FROM expected e WHERE p.oid = pg_catalog.to_regprocedure(e.sig))",
    '     LIMIT 1;',
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'undeclared SECURITY DEFINER function: %', bad; END IF;",
    'END', '$bcb$;', '',
  );
  return out.join('\n');
}

/**
 * Декларация + имя базы → текст SQL-артефакта (SCHEME §B, «выход №1»).
 * Чистая функция: ни подключения, ни времени, ни окружения в выходе.
 * @throws {DeclarationGapError} если декларация неполна (громкий отказ вместо тихого пропуска)
 */
export function generatePrivilegesSql(declaration, dbName, options = {}) {
  const source = options.source ?? 'deploy/postgres/privileges/declaration.ts';
  const gaps = collectGaps(declaration, dbName);
  if (gaps.length > 0) throw new DeclarationGapError(gaps);

  const db = declaration.databases[dbName];
  const { roles, logins } = principals(declaration);
  const dbLogins = Object.entries(declaration.envMapping ?? {}).flatMap(([, mapping]) =>
    Object.entries(mapping).filter(([, login]) => login.connect?.includes(dbName)).map(([name]) => name));
  const allDeclaredLoginNames = [...new Set(Object.values(declaration.envMapping ?? {})
    .flatMap((mapping) => Object.keys(mapping)))].sort();
  const managed = managedRoleNames(declaration);
  const dbOwner = db.database.owner;
  const isLogin = (name) => logins.has(name) && !roles.has(name);
  const isRole = (name) => roles.has(name);
  const resolveOwner = (declared) => (declared === 'migrator' ? dbOwner : declared);
  /** Управляемые роли, у которых безопасно отзывать права на объекте с владельцем `owner`. */
  const revokeTargets = (owner) => [...new Set([...managed, ...dbLogins])].filter((r) => r !== owner).sort();

  const out = [];

  /* — шапка — */
  out.push(
    '-- ============================================================================',
    '-- СГЕНЕРИРОВАННЫЙ ФАЙЛ — НЕ РЕДАКТИРОВАТЬ РУКАМИ.',
    `-- источник:   ${source}`,
    `-- генератор:  deploy/postgres/privileges/generate.mjs (версия ${GENERATOR_VERSION})`,
    `-- база:       ${dbName}`,
    '-- применение: psql -1 -v ON_ERROR_STOP=1 -f <этот файл>   (ОДНА транзакция, SCHEME §B)',
    '-- канон:      docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/SCHEME.md §A/§B/§D',
    '--',
    '-- ЗДЕСЬ НЕТ (чужая власть, SCHEME §B):',
    '--   • DDL схемы (CREATE SCHEMA/TABLE/FUNCTION/VIEW) — миграции;',
    '--   • объекты стены (app_control, event trigger, §D.5 снятие PUBLIC EXECUTE со всех',
    '--     функций) — шаг wall-install (§B шаг 3);',
    '--   • логины: создание, пароли, членства, CONNECT, ALTER ROLE … IN DATABASE … SET —',
    '--     рендер из env-маппинга в момент применения (§A.1), в артефакт не входит.',
    '-- ============================================================================',
    '',
    '\\set ON_ERROR_STOP on',
    '',
    '-- § предохранитель: артефакт обязан применяться ОДНОЙ транзакцией (SCHEME §B, FACTS §4.1).',
    '-- Временная таблица ON COMMIT DROP переживает следующий оператор только внутри',
    '-- транзакционного блока; в autocommit она умирает сразу — и проверка ниже кричит.',
    'CREATE TEMP TABLE bcb_privileges_txn_guard ON COMMIT DROP AS SELECT 1 AS one;',
    'DO $bcb$',
    'BEGIN',
    "  IF pg_catalog.to_regclass('pg_temp.bcb_privileges_txn_guard') IS NULL THEN",
    "    RAISE EXCEPTION 'артефакт прав применён НЕ одной транзакцией — нужен psql -1 -v ON_ERROR_STOP=1 (SCHEME §B)';",
    '  END IF;',
    `  IF pg_catalog.current_database() <> ${lit(dbName)} THEN`,
    `    RAISE EXCEPTION 'артефакт базы % применён к базе %', ${lit(dbName)}, pg_catalog.current_database();`,
    '  END IF;',
    'END',
    '$bcb$;',
    '',
  );

  /* — 1. канонические роли — */
  out.push('-- ─────────── 1. КАНОНИЧЕСКИЕ РОЛИ (SCHEME §A.1, кластерный уровень) ───────────', '');
  for (const roleName of sortedKeys(declaration.cluster.roles)) {
    const role = declaration.cluster.roles[roleName];
    if (role.kind === 'superuser') {
      out.push(`-- роль ${roleName}: kind=superuser — объявлена для сверки §F, декларацией НЕ управляется.`, '');
      continue;
    }
    out.push(
      'DO $bcb$',
      'BEGIN',
      `  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ${lit(roleName)}) THEN`,
      `    CREATE ROLE ${q(roleName)} NOLOGIN;`,
      '  END IF;',
      'END',
      '$bcb$;',
      `ALTER ROLE ${q(roleName)} ${roleAttributeClause(role)};`,
    );
    emitRolconfig(out, roleName, role.rolconfig, `cluster.roles.${roleName}.rolconfig`);
    out.push('');
  }

  /* — 1a. ordinary ownership baseline — */
  // This pass intentionally precedes all exact seam reconciliation.  A restore performed with
  // --no-owner --role=app_object_owner must leave ordinary objects there; narrow owners below are
  // the final authority for their relations and signatures.
  out.push(
    '-- ─────────── 1a. OWNERSHIP BASELINE: ordinary application objects ───────────',
    'DO $bcb$', 'DECLARE o record;', 'BEGIN',
    "  FOR o IN SELECT c.relkind, n.nspname, c.relname FROM pg_catalog.pg_class c",
    '             JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace',
    "            WHERE n.nspname IN ('public', 'app', 'integrator', 'app_ext', 'drizzle')",
    "              AND c.relkind IN ('v', 'm') ORDER BY n.nspname, c.relname LOOP",
    `    EXECUTE pg_catalog.format('ALTER %s %I.%I OWNER TO %I', CASE o.relkind WHEN 'v' THEN 'VIEW' ELSE 'MATERIALIZED VIEW' END, o.nspname, o.relname, ${lit('app_object_owner')});`,
    '  END LOOP;',
    "  FOR o IN SELECT n.nspname, t.typname FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace",
    "            WHERE n.nspname IN ('public', 'app', 'integrator', 'app_ext', 'drizzle') AND t.typtype IN ('b', 'c', 'd', 'e', 'r') AND t.typelem = 0 AND t.typrelid = 0 ORDER BY 1, 2 LOOP",
    `    EXECUTE pg_catalog.format('ALTER TYPE %I.%I OWNER TO %I', o.nspname, o.typname, ${lit('app_object_owner')});`,
    '  END LOOP;',
    "  FOR o IN SELECT n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS args FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace",
    "            WHERE n.nspname IN ('app', 'app_ext') AND NOT p.prosecdef ORDER BY 1, 2, 3 LOOP",
    `    EXECUTE pg_catalog.format('ALTER FUNCTION %I.%I(%s) OWNER TO %I', o.nspname, o.proname, o.args, ${lit('app_object_owner')});`,
    '  END LOOP;',
    'END', '$bcb$;', '',
  );

  /* — 1b. private transaction context — */
  const portContext = declaration.portContext;
  if (portContext) {
    out.push('-- ─────────── 1b. REVISION-10 PRIVATE PORT CONTEXT ───────────', '');
    out.push(generateFunctionCensusSql(declaration, dbName));
    for (const [identity, relation] of Object.entries(portContext.privateRelations).sort(([a], [b]) => a.localeCompare(b))) {
      const { qualified } = splitQualified(identity, `portContext.privateRelations.${identity}`);
      out.push(`ALTER TABLE ${qualified} OWNER TO ${q(relation.owner)};`);
      out.push(`REVOKE ALL PRIVILEGES ON TABLE ${qualified} FROM PUBLIC;`);
      const targets = revokeTargets(relation.owner);
      if (targets.length > 0) out.push(`REVOKE ALL PRIVILEGES ON TABLE ${qualified} FROM ${revokeList(targets)};`);
    }
    out.push(generatePortContextCapabilitySeedSql(declaration, dbName));
    out.push('');
  }

  /* — 2. членства канонических ролей — */
  out.push(
    '-- ─────────── 2. ЧЛЕНСТВА КАНОНИЧЕСКИХ РОЛЕЙ (SCHEME §A.1) ───────────',
    '-- Членств ЛОГИНОВ здесь нет: их рендерит roles-install из env-маппинга (§A.1).',
    '',
  );
  for (const roleName of sortedKeys(declaration.cluster.roles)) {
    const role = declaration.cluster.roles[roleName];
    if (role.kind === 'superuser') continue;
    if (Array.isArray(role.members) && role.members.length === 0) {
      out.push(`-- ${roleName}: members: [] — ноль членов в стационаре (SCHEME §C/§E).`);
      emitMembershipRevokeToEmpty(out, roleName, isSeamOwnerName(roleName), allDeclaredLoginNames);
    }
    for (const m of [...(role.grantedTo ?? [])].sort((a, b) => a.role.localeCompare(b.role))) {
      if (isLogin(m.role)) {
        out.push(`-- ${roleName} → ${m.role}: грантополучатель — ЛОГИН, статья в env-рендере (§A.1).`);
        continue;
      }
      out.push(
        `GRANT ${q(roleName)} TO ${q(m.role)} WITH ADMIN ${m.admin ? 'TRUE' : 'FALSE'}, `
        + `INHERIT ${m.inherit ? 'TRUE' : 'FALSE'}, SET ${m.set ? 'TRUE' : 'FALSE'};`,
      );
    }
  }
  out.push('');

  /* — 3. база — */
  out.push('-- ─────────── 3. БАЗА: владелец, ACL, per-db настройки (SCHEME §A.3/§A.10/§D.1) ───────────', '');
  out.push(`ALTER DATABASE ${q(dbName)} OWNER TO ${q(dbOwner)};`);
  out.push(`REVOKE ALL ON DATABASE ${q(dbName)} FROM PUBLIC;`);
  const dbRevoke = revokeTargets(dbOwner);
  if (dbRevoke.length > 0) out.push(`REVOKE ALL ON DATABASE ${q(dbName)} FROM ${revokeList(dbRevoke)};`);
  for (const grantee of [...(db.database.connect ?? [])].sort()) {
    if (isLogin(grantee)) {
      out.push(`-- CONNECT ${grantee}: логин — статья в env-рендере (§A.1/§D.1).`);
      continue;
    }
    if (grantee === dbOwner) continue;
    out.push(`GRANT CONNECT ON DATABASE ${q(dbName)} TO ${q(grantee)};`);
  }
  out.push(`ALTER DATABASE ${q(dbName)} RESET ALL;`);
  for (const entry of (db.dbSettings?.databaseLevel?.[dbName] ?? []).slice().sort()) {
    const eq = entry.indexOf('=');
    out.push(`ALTER DATABASE ${q(dbName)} SET ${q(entry.slice(0, eq))} TO ${entry.slice(eq + 1)};`);
  }
  for (const login of sortedKeys(db.dbSettings?.perRoleInDatabase)) {
    out.push(`-- ALTER ROLE ${login} IN DATABASE ${dbName} SET …: рендер из env-маппинга (§A.10/§B).`);
  }
  out.push('');

  /* — 4. схемы — */
  out.push('-- ─────────── 4. СХЕМЫ (SCHEME §A.3/§D.2) ───────────', '');
  for (const schemaName of sortedKeys(db.schemas)) {
    const schema = db.schemas[schemaName];
    if (!schema.present) {
      out.push(
        `-- схема ${schemaName}: present:false — её создаёт и закрывает шаг wall-install (§B шаг 3);`,
        '--   генератор ACL этой схемы не трогает (одна власть).',
        '',
      );
      continue;
    }
    out.push(`ALTER SCHEMA ${q(schemaName)} OWNER TO ${q(schema.owner)};`);
    out.push(`REVOKE ALL ON SCHEMA ${q(schemaName)} FROM PUBLIC;`);
    const schemaRevoke = revokeTargets(schema.owner);
    if (schemaRevoke.length > 0) out.push(`REVOKE ALL ON SCHEMA ${q(schemaName)} FROM ${revokeList(schemaRevoke)};`);
    const usageRoles = (schema.usage ?? []).filter((g) => isRole(g) && g !== schema.owner).sort();
    if (usageRoles.length > 0) out.push(`GRANT USAGE ON SCHEMA ${q(schemaName)} TO ${usageRoles.map(q).join(', ')};`);
    const createRoles = (schema.create ?? []).filter((g) => isRole(g) && g !== schema.owner).sort();
    if (createRoles.length > 0) out.push(`GRANT CREATE ON SCHEMA ${q(schemaName)} TO ${createRoles.map(q).join(', ')};`);
    const loginGrantees = [...new Set([...(schema.usage ?? []), ...(schema.create ?? [])].filter(isLogin))].sort();
    for (const login of loginGrantees) {
      out.push(`-- схема ${schemaName}: грант логину ${login} — статья в env-рендере (§A.1).`);
    }
    out.push('');
  }

  /* — 5. hardening дефолтных прав создателей — */
  out.push(
    '-- ─────────── 5. HARDENING ДЕФОЛТНЫХ ПРАВ СОЗДАТЕЛЕЙ (SCHEME §B/§D.3) ───────────',
    '-- Дефолты живут ПО-СОЗДАЮЩЕЙ-РОЛИ и членством не наследуются (evidence/12 §3b).',
    '',
  );
  for (const creator of [...(db.creators ?? [])].sort()) {
    for (const objType of ['TABLES', 'SEQUENCES', 'FUNCTIONS', 'TYPES']) {
      out.push(`ALTER DEFAULT PRIVILEGES FOR ROLE ${q(creator)} REVOKE ALL ON ${objType} FROM PUBLIC;`);
    }
  }
  out.push('');

  /* — 6. таблицы — */
  out.push('-- ─────────── 6. ТАБЛИЦЫ: владелец, RLS-флаги, ACL, политики (SCHEME §A.4/§B) ───────────', '');
  for (const tableKey of sortedKeys(db.tables)) {
    const table = db.tables[tableKey];
    const { schema, name, qualified } = splitQualified(tableKey, `databases.${dbName}.tables['${tableKey}']`);
    const owner = resolveOwner(table.owner);
    const tableRevoke = revokeTargets(owner);
    out.push(`-- ── ${tableKey} (org=${table.org}, rls=${table.rls}) ──`);
    if (table.rls === 'n/a') {
      // A PENDING_REMOVAL relation may already be physically absent in one managed database.
      // If it still exists, strip every ACL/policy; if it is gone, the same declaration remains
      // idempotent and never recreates the legacy object merely to revoke it.
      out.push(
        `-- RLS: 'n/a' — PENDING_REMOVAL; revoke in place when present, never recreate.`,
        'DO $bcb$',
        'DECLARE relation_oid regclass;',
        'DECLARE policy_row record;',
        'BEGIN',
        `  relation_oid := pg_catalog.to_regclass(${lit(`${schema}.${name}`)});`,
        '  IF relation_oid IS NULL THEN RETURN; END IF;',
        "  EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON TABLE %s FROM PUBLIC', relation_oid);",
        ...(tableRevoke.length > 0
          ? [`  EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON TABLE %s FROM ${nestedLit(revokeList(tableRevoke))}', relation_oid);`]
          : []),
        '  FOR policy_row IN SELECT policyname FROM pg_catalog.pg_policies',
        `    WHERE schemaname = ${lit(schema)} AND tablename = ${lit(name)} ORDER BY policyname LOOP`,
        `    EXECUTE pg_catalog.format('DROP POLICY %I ON %s', policy_row.policyname, relation_oid);`,
        '  END LOOP;',
        'END',
        '$bcb$;',
        '',
      );
      continue;
    }
    out.push(`ALTER TABLE ${qualified} OWNER TO ${q(owner)};`);
    if (table.rls === 'off') {
      out.push(`ALTER TABLE ${qualified} NO FORCE ROW LEVEL SECURITY;`);
      out.push(`ALTER TABLE ${qualified} DISABLE ROW LEVEL SECURITY;`);
    } else {
      out.push(`ALTER TABLE ${qualified} ENABLE ROW LEVEL SECURITY;`);
      out.push(`ALTER TABLE ${qualified} ${table.rls === 'force' ? 'FORCE' : 'NO FORCE'} ROW LEVEL SECURITY;`);
    }
    out.push(`REVOKE ALL PRIVILEGES ON TABLE ${qualified} FROM PUBLIC;`);
    if (tableRevoke.length > 0) {
      out.push(`REVOKE ALL PRIVILEGES ON TABLE ${qualified} FROM ${revokeList(tableRevoke)};`);
    }
    emitTableGrants(out, qualified, table.grants, isRole);
    for (const grantee of sortedKeys(table.grants)) {
      if (isLogin(grantee)) out.push(`-- ${tableKey}: грант логину ${grantee} — статья в env-рендере (§A.1).`);
    }

    // последовательности таблицы — правило SCHEME §A.4
    const seqRoles = sortedKeys(table.grants).filter((g) => isRole(g) && (grantPrivs(table.grants[g]) ?? []).some(
      (e) => (typeof e === 'string'
        ? e === 'INSERT' || e === 'UPDATE'
        : e?.kind === 'columns' && (e.priv === 'INSERT' || e.priv === 'UPDATE')),
    ));
    if (seqRoles.length > 0) {
      out.push(
        `-- последовательности ${tableKey}: правило §A.4 (INSERT/UPDATE ⇒ USAGE,SELECT на её последовательностях)`,
        'DO $bcb$',
        'DECLARE s regclass;',
        'BEGIN',
        '  FOR s IN SELECT DISTINCT d.objid::regclass',
        '             FROM pg_catalog.pg_depend d',
        "             JOIN pg_catalog.pg_class c ON c.oid = d.objid AND c.relkind = 'S'",
        `            WHERE d.refobjid = ${lit(`${schema}.${name}`)}::regclass`,
        "              AND d.classid = 'pg_class'::regclass AND d.refclassid = 'pg_class'::regclass",
        "              AND d.deptype IN ('a', 'i')",
        '            ORDER BY 1 LOOP',
        "    EXECUTE pg_catalog.format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC', s);",
        ...(tableRevoke.length > 0
          ? [`    EXECUTE pg_catalog.format('REVOKE ALL ON SEQUENCE %s FROM ${nestedLit(revokeList(tableRevoke))}', s);`]
          : []),
        ...seqRoles.map(
          (r) => `    EXECUTE pg_catalog.format('GRANT USAGE, SELECT ON SEQUENCE %s TO ${nestedLit(q(r))}', s);`,
        ),
        '  END LOOP;',
        'END',
        '$bcb$;',
      );
    }

    // политики: полное переприменение — снять ВСЕ, поставить объявленные
    out.push(
      'DO $bcb$',
      'DECLARE p record;',
      'BEGIN',
      '  FOR p IN SELECT policyname FROM pg_catalog.pg_policies',
      `            WHERE schemaname = ${lit(schema)} AND tablename = ${lit(name)} ORDER BY policyname LOOP`,
      `    EXECUTE pg_catalog.format('DROP POLICY %I ON %I.%I', p.policyname, ${lit(schema)}, ${lit(name)});`,
      '  END LOOP;',
      'END',
      '$bcb$;',
    );
    for (const policy of [...(table.policies ?? [])].sort((a, b) => a.name.localeCompare(b.name))) {
      const to = [...policy.to].sort().map((r) => (r === 'PUBLIC' ? 'PUBLIC' : q(r))).join(', ');
      let statement = `CREATE POLICY ${q(policy.name)} ON ${qualified} AS ${policy.as} FOR ${policy.cmd} TO ${to}`;
      if (policy.using) statement += ` USING (${policy.using})`;
      if (policy.withCheck) statement += ` WITH CHECK (${policy.withCheck})`;
      out.push(`${statement};`);
    }
    out.push('');
  }

  /* — 7. явные последовательности — */
  const seqExamples = db.sequences?.examples ?? {};
  out.push('-- ─────────── 7. ЯВНЫЕ ПОСЛЕДОВАТЕЛЬНОСТИ (SCHEME §A.4, исключения из правила) ───────────', '');
  if (sortedKeys(seqExamples).length === 0) {
    out.push('-- явных записей последовательностей нет — действует правило §A.4 (блоки выше).', '');
  } else {
    for (const seqKey of sortedKeys(seqExamples)) {
      const { qualified } = splitQualified(seqKey, `databases.${dbName}.sequences.examples['${seqKey}']`);
      out.push(`REVOKE ALL ON SEQUENCE ${qualified} FROM PUBLIC;`);
      const seqRevoke = revokeTargets(dbOwner);
      if (seqRevoke.length > 0) out.push(`REVOKE ALL ON SEQUENCE ${qualified} FROM ${revokeList(seqRevoke)};`);
      for (const grantee of sortedKeys(seqExamples[seqKey])) {
        if (isLogin(grantee)) {
          out.push(`-- ${seqKey}: грант логину ${grantee} — статья в env-рендере (§A.1).`);
          continue;
        }
        out.push(`GRANT ${[...seqExamples[seqKey][grantee]].sort().join(', ')} ON SEQUENCE ${qualified} TO ${q(grantee)};`);
      }
      out.push('');
    }
  }

  /* — 8. definer-исключения — */
  out.push(
    '-- ─────────── 8. DEFINER-ИСКЛЮЧЕНИЯ: владелец + ACL (SCHEME §A.7/§B) ───────────',
    '-- proconfig (SET search_path) НЕ эмитится: его применяет тело функции в миграции (§B).',
    '',
  );
  const proconfigExceptions = db.definerExceptions?.proconfigExceptions ?? {};
  const intentional = db.definerExceptions?.ownershipExceptions?.intentional ?? {};
  const namedExceptions = new Set(sortedKeys(proconfigExceptions));
  for (const owner of sortedKeys(intentional)) {
    for (const sig of intentional[owner].functions) namedExceptions.add(sig);
  }
  for (const sig of sortedKeys(proconfigExceptions)) {
    const fn = proconfigExceptions[sig];
    out.push(`ALTER FUNCTION ${sig} OWNER TO ${q(fn.owner)};`);
    out.push(`REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC;`);
    const fnRevoke = revokeTargets(fn.owner);
    if (fnRevoke.length > 0) out.push(`REVOKE ALL ON FUNCTION ${sig} FROM ${revokeList(fnRevoke)};`);
    const executeRoles = (fn.execute ?? []).filter((r) => isRole(r) && r !== fn.owner).sort();
    if (executeRoles.length > 0) out.push(`GRANT EXECUTE ON FUNCTION ${sig} TO ${executeRoles.map(q).join(', ')};`);
    for (const login of (fn.execute ?? []).filter(isLogin).sort()) {
      out.push(`-- ${sig}: EXECUTE логину ${login} — статья в env-рендере (§A.1).`);
    }
  }
  for (const owner of sortedKeys(intentional)) {
    for (const sig of [...intentional[owner].functions].sort()) {
      out.push(`ALTER FUNCTION ${sig} OWNER TO ${q(owner)};`);
      out.push(`REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC;`);
    }
  }
  if (portContext) {
    const exactDefiners = functionEntriesForDatabase(portContext, dbName)
      .filter(([, fn]) => fn.security === 'DEFINER')
      .map(([signature]) => lit(signature)).sort();
    out.push(
      '-- SECURITY DEFINER has no fallback owner: every live signature must be declared exactly.',
      'DO $bcb$', 'DECLARE f text;', 'BEGIN',
      '  SELECT pg_catalog.format(\'%I.%I(%s)\', n.nspname, p.proname,',
      "           pg_catalog.replace(pg_catalog.oidvectortypes(p.proargtypes), ', ', ',')) INTO f",
      '    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace',
      `   WHERE p.prosecdef AND n.nspname IN (${MANAGED_APPLICATION_SCHEMAS.map(lit).join(', ')})`,
      "     AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend d WHERE d.classid = 'pg_proc'::pg_catalog.regclass AND d.objid = p.oid AND d.deptype = 'e')",
      ...(exactDefiners.length > 0 ? [`     AND pg_catalog.format('%I.%I(%s)', n.nspname, p.proname, pg_catalog.replace(pg_catalog.oidvectortypes(p.proargtypes), ', ', ',')) NOT IN (${exactDefiners.join(', ')})`] : []),
      '   LIMIT 1;',
      "  IF f IS NOT NULL THEN RAISE EXCEPTION 'undeclared SECURITY DEFINER function: %', f; END IF;",
      'END', '$bcb$;', '',
    );
  }
  out.push('');

  /* — 9. представления — */
  const views = db.functionsViews?.views ?? {};
  out.push('-- ─────────── 9. ПРЕДСТАВЛЕНИЯ (SCHEME §A.5/§G.6) ───────────', '');
  if (sortedKeys(views).length === 0) out.push('-- объявленных представлений нет.');
  for (const viewKey of sortedKeys(views)) {
    const { qualified } = splitQualified(viewKey, `databases.${dbName}.functionsViews.views['${viewKey}']`);
    out.push(`ALTER VIEW ${qualified} SET (security_invoker = true);`);
    out.push(`REVOKE ALL PRIVILEGES ON TABLE ${qualified} FROM PUBLIC;`);
    const viewRevoke = revokeTargets(dbOwner);
    if (viewRevoke.length > 0) out.push(`REVOKE ALL PRIVILEGES ON TABLE ${qualified} FROM ${revokeList(viewRevoke)};`);
  }
  out.push('');

  /* — 10. типы — */
  out.push('-- ─────────── 10. ПОЛЬЗОВАТЕЛЬСКИЕ ТИПЫ (SCHEME §A.6) ───────────', '');
  if (sortedKeys(db.types).length === 0) out.push('-- объявленных типов нет (ноль CREATE TYPE в миграциях).');
  for (const typeKey of sortedKeys(db.types)) {
    const { qualified } = splitQualified(typeKey, `databases.${dbName}.types['${typeKey}']`);
    out.push(`REVOKE ALL ON TYPE ${qualified} FROM PUBLIC;`);
    const usageRoles = (db.types[typeKey].usage ?? []).filter(isRole).sort();
    if (usageRoles.length > 0) out.push(`GRANT USAGE ON TYPE ${qualified} TO ${usageRoles.map(q).join(', ')};`);
  }
  out.push('', '-- конец сгенерированного артефакта.');

  return `${out.join('\n')}\n`;
}

/**
 * Org-allowlist (SCHEME §A.9/§B шаг 6) — ПОЛНОЕ переприменение `app_control.org_table_allowlist`.
 * Отдельный артефакт: §B перечисляет содержимое `privileges.<db>.sql` без allowlist, а снятие
 * строк привязано к шагу 6 (там финальное состояние известно).
 */
export function generateOrgAllowlistSql(declaration, dbName, options = {}) {
  const source = options.source ?? 'deploy/postgres/privileges/declaration.ts';
  const gaps = collectGaps(declaration, dbName);
  if (gaps.length > 0) throw new DeclarationGapError(gaps);
  const db = declaration.databases[dbName];
  const rows = sortedKeys(db.tables)
    .filter((k) => db.tables[k].org === true)
    .map((k) => {
      const { schema, name } = splitQualified(k, `databases.${dbName}.tables['${k}']`);
      return `  (${lit(schema)}, ${lit(name)})`;
    });
  const out = [
    '-- ============================================================================',
    '-- СГЕНЕРИРОВАННЫЙ ФАЙЛ — НЕ РЕДАКТИРОВАТЬ РУКАМИ.',
    `-- источник:   ${source} (tables[*].org === true, SCHEME §A.9)`,
    `-- генератор:  deploy/postgres/privileges/generate.mjs (версия ${GENERATOR_VERSION})`,
    `-- база:       ${dbName}`,
    '-- применение: psql -1 -v ON_ERROR_STOP=1 -f <файл>  (SCHEME §B шаг 6, ПОЛНОЕ переприменение)',
    '-- ============================================================================',
    '',
    '\\set ON_ERROR_STOP on',
    '',
    'CREATE TEMP TABLE bcb_allowlist_txn_guard ON COMMIT DROP AS SELECT 1 AS one;',
    'DO $bcb$',
    'BEGIN',
    "  IF pg_catalog.to_regclass('pg_temp.bcb_allowlist_txn_guard') IS NULL THEN",
    "    RAISE EXCEPTION 'allowlist применён НЕ одной транзакцией — нужен psql -1 (SCHEME §B)';",
    '  END IF;',
    `  IF pg_catalog.current_database() <> ${lit(dbName)} THEN`,
    `    RAISE EXCEPTION 'allowlist базы % применён к базе %', ${lit(dbName)}, pg_catalog.current_database();`,
    '  END IF;',
    'END',
    '$bcb$;',
    '',
  ];
  if (rows.length === 0) {
    out.push('DELETE FROM app_control.org_table_allowlist;');
  } else {
    out.push(
      'WITH declared(schema_name, table_name) AS (VALUES',
      rows.join(',\n'),
      '),',
      'inserted AS (',
      '  INSERT INTO app_control.org_table_allowlist (schema_name, table_name)',
      '  SELECT schema_name, table_name FROM declared',
      '  ON CONFLICT (schema_name, table_name) DO NOTHING',
      '  RETURNING 1',
      ')',
      'DELETE FROM app_control.org_table_allowlist a',
      ' WHERE NOT EXISTS (SELECT 1 FROM declared d',
      '                    WHERE d.schema_name = a.schema_name AND d.table_name = a.table_name);',
    );
  }
  out.push('', '-- конец сгенерированного артефакта.');
  return `${out.join('\n')}\n`;
}

/**
 * Login-специфичные статьи (SCHEME §A.1/§B) — рендер В МОМЕНТ ПРИМЕНЕНИЯ, НЕ коммитится.
 * Пароли в текст не попадают: подставляются psql-переменной с именем из `passwordEnv`.
 */
export function renderEnvSql(declaration, env, dbName) {
  const records = declaration.envMapping?.[env];
  if (!records) throw new Error(`env '${env}' не объявлен в декларации`);
  const db = declaration.databases?.[dbName];
  if (!db) throw new Error(`база '${dbName}' не объявлена в декларации`);
  const { roles } = principals(declaration);
  const out = [
    '-- РЕНДЕР ПРИ ПРИМЕНЕНИИ — НЕ КОММИТИТСЯ (SCHEME §A.1/§B).',
    `-- env: ${env}; база: ${dbName}; генератор: generate.mjs (версия ${GENERATOR_VERSION})`,
    '-- применение: psql -1 -v ON_ERROR_STOP=1 -v <PASSWORD_VAR>=… -f -',
    '',
    '\\set ON_ERROR_STOP on',
    "SET LOCAL password_encryption = 'scram-sha-256';",
    '',
  ];
  for (const loginName of sortedKeys(records)) {
    const record = records[loginName];
    if (!record.connect?.includes(dbName)) continue;
    out.push(
      `-- ── логин ${loginName} ──`,
      `\\getenv ${record.passwordEnv} ${record.passwordEnv}`,
      'DO $bcb$',
      'BEGIN',
      `  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ${lit(loginName)}) THEN`,
      `    CREATE ROLE ${q(loginName)} LOGIN;`,
      '  END IF;',
      'END',
      '$bcb$;',
      `ALTER ROLE ${q(loginName)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS `
      + `${record.inherit ? 'INHERIT' : 'NOINHERIT'};`,
      `ALTER ROLE ${q(loginName)} PASSWORD :'${record.passwordEnv}';`,
    );
    if (record.validUntil) out.push(`ALTER ROLE ${q(loginName)} VALID UNTIL ${lit(record.validUntil)};`);
    if (typeof record.connectionLimit === 'number') {
      out.push(`ALTER ROLE ${q(loginName)} CONNECTION LIMIT ${record.connectionLimit};`);
    }
    emitRolconfig(out, loginName, record.rolconfig, `envMapping.${env}.${loginName}.rolconfig`);
    const memberships = record.memberships ?? (record.canonicalRole
      ? [record.membership ?? { role: record.canonicalRole, admin: false, inherit: record.inherit, set: true }]
      : []);
    for (const m of memberships) {
      if (!roles.has(m.role)) {
        throw new Error(`envMapping.${env}.${loginName}: роль '${m.role}' не объявлена`);
      }
      out.push(
        `GRANT ${q(m.role)} TO ${q(loginName)} WITH ADMIN ${m.admin ? 'TRUE' : 'FALSE'}, `
        + `INHERIT ${m.inherit ? 'TRUE' : 'FALSE'}, SET ${m.set ? 'TRUE' : 'FALSE'};`,
      );
    }
    out.push(`GRANT CONNECT ON DATABASE ${q(dbName)} TO ${q(loginName)};`);
    for (const schemaName of sortedKeys(db.schemas)) {
      const schema = db.schemas[schemaName];
      if (!schema.present) continue;
      if ((schema.usage ?? []).includes(loginName)) {
        out.push(`GRANT USAGE ON SCHEMA ${q(schemaName)} TO ${q(loginName)};`);
      }
      if ((schema.create ?? []).includes(loginName)) {
        out.push(`GRANT CREATE ON SCHEMA ${q(schemaName)} TO ${q(loginName)};`);
      }
    }
    out.push(`ALTER ROLE ${q(loginName)} IN DATABASE ${q(dbName)} RESET ALL;`);
    for (const entry of (db.dbSettings?.perRoleInDatabase?.[loginName] ?? []).slice().sort()) {
      const eq = entry.indexOf('=');
      const value = entry.slice(eq + 1);
      if (!ROLCONFIG_SAFE.test(value)) {
        throw new Error(`envMapping.${env}.${loginName}: значение '${value}' требует нереализованных правил цитирования`);
      }
      out.push(`ALTER ROLE ${q(loginName)} IN DATABASE ${q(dbName)} SET ${q(entry.slice(0, eq))} TO ${value};`);
    }
    out.push('');
  }
  return `${out.join('\n')}\n`;
}
