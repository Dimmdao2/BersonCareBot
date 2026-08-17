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
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const GENERATOR_VERSION = 1;

/** Канонический порядок привилегий (стабильный дифф). */
const PRIV_ORDER = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
const MANAGED_APPLICATION_SCHEMAS = ['public', 'app', 'integrator', 'app_ext', 'app_control', 'drizzle'];
const SPECIAL_BODY_RELATION_SURFACE_CONTRACTS = Object.freeze({
  'app_control.enforce_relation_birth_wall()': 'relation-birth-wall',
  'app.install_port_context(uuid,app.port_context_claims)': 'port-context',
  'app.clear_port_context()': 'port-context',
  'app.require_accepted_context(name,name,app.port_context_class,text,bytea,regprocedure)': 'port-context',
  'app.current_org_id()': 'port-context',
  'app.current_actor_user_id()': 'port-context',
  'app.current_patient_user_id()': 'port-context',
  'app.current_integrator_user_id()': 'port-context',
});

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

function exactPreSessionRootsForDatabase(declaration, dbName) {
  const exactPreSessionCapabilities = new Map();
  for (const capability of Object.values(declaration.portContext?.capabilities ?? {})) {
    if (capability.targetRole !== 'app_pre_session' || !capability.functionIdentity) continue;
    const previous = exactPreSessionCapabilities.get(capability.functionIdentity);
    if (previous && previous !== capability.purpose) {
      throw new DeclarationGapError([{ site: `portContext.capabilities.${capability.functionIdentity}`,
        reason: 'exact pre-session identity has conflicting purposes' }]);
    }
    exactPreSessionCapabilities.set(capability.functionIdentity, capability.purpose);
  }
  const exactPreSessionRoots = functionEntriesForDatabase(declaration.portContext, dbName)
    .filter(([, routine]) => routine.security === 'DEFINER'
      && routine.owner !== 'app_seam_context_owner'
      && routine.execute?.includes('app_pre_session'))
    .map(([signature]) => [signature, exactPreSessionCapabilities.get(signature)])
    .sort(([a], [b]) => a.localeCompare(b));
  const missingExactPreSession = exactPreSessionRoots.filter(([, purpose]) => !purpose);
  if (missingExactPreSession.length > 0) {
    throw new DeclarationGapError(missingExactPreSession.map(([signature]) => ({
      site: `portContext.functions.${signature}`,
      reason: 'app_pre_session business definer lacks an exact named capability',
    })));
  }
  return exactPreSessionRoots;
}

function preSessionGateVerifierLines(preSessionRows) {
  return [
    `  WITH expected(signature,purpose) AS (VALUES ${preSessionRows})`,
    '  SELECT expected.signature INTO bad FROM expected',
    '   JOIN pg_catalog.pg_proc routine ON routine.oid=pg_catalog.to_regprocedure(expected.signature)',
    "   WHERE NOT routine.prosecdef",
    "      OR position('app.require_accepted_context' IN routine.prosrc)=0",
    "      OR position('BEGIN' IN upper(routine.prosrc))=0",
    "      OR substring(routine.prosrc FROM position('BEGIN' IN upper(routine.prosrc))) !~* '^BEGIN[[:space:]]+PERFORM[[:space:]]+app[.]require_accepted_context[[:space:]]*[(]'",
    "      OR substring(routine.prosrc FROM 1 FOR greatest(position('PERFORM app.require_accepted_context' IN routine.prosrc) - 1, 0)) ~* '(:=|[[:space:]]DEFAULT[[:space:]])'",
    "      OR position('app.hash_port_typed_args' IN routine.prosrc)=0",
    '      OR position(expected.signature IN routine.prosrc)=0',
    '      OR position(expected.purpose IN routine.prosrc)=0',
    '   ORDER BY 1 LIMIT 1;',
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'pre-session exact gate missing or mismatched: %',bad; END IF;",
  ];
}

/** Focused behavioral verifier used by live catalog audits and red fixtures. */
export function generatePreSessionGateVerifierSql(declaration, dbName) {
  if (!declaration.databases?.[dbName]) {
    throw new DeclarationGapError([{ site: `databases.${dbName}`, reason: 'database is absent' }]);
  }
  const exactPreSessionRoots = exactPreSessionRootsForDatabase(declaration, dbName);
  const preSessionRows = exactPreSessionRoots
    .map(([signature, purpose]) => `(${lit(signature)},${lit(purpose)})`).join(',\n');
  return [
    'DO $bcb$ DECLARE bad text; BEGIN',
    ...preSessionGateVerifierLines(preSessionRows),
    `  RAISE NOTICE 'BCB_PRE_SESSION_GATES_VERIFIED database=${dbName} roots=${exactPreSessionRoots.length}';`,
    'END $bcb$;',
    '',
  ].join('\n');
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
  const exactPreSessionRoots = exactPreSessionRootsForDatabase(declaration, dbName);
  const relationRows = exactRelations.map((identity) => {
    const [schema, name] = identity.split('.');
    return `(${lit(schema)}::name,${lit(name)}::name)`;
  }).join(',\n');
  const functionRows = functions.map((signature) => `(${lit(signature)})`).join(',\n');
  const preSessionRows = exactPreSessionRoots
    .map(([signature, purpose]) => `(${lit(signature)},${lit(purpose)})`).join(',\n');
  const privatePolicyRows = Object.entries(declaration.portContext?.privateRelations ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([identity, relation]) => {
      const { schema, name } = splitQualified(identity, `portContext.privateRelations.${identity}`);
      return `(${lit(schema)}::name,${lit(name)}::name,${lit(`bcb_private_owner_${schema}_${name}`)}::name,${lit(relation.owner)}::name)`;
    }).join(',\n');
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
    `  WITH expected(schema_name,relation_name,policy_name,owner_name) AS (VALUES ${privatePolicyRows})`,
    "  SELECT expected.schema_name || '.' || expected.relation_name INTO bad FROM expected",
    '   WHERE (SELECT count(*) FROM pg_catalog.pg_policy policy',
    "           WHERE policy.polrelid=pg_catalog.to_regclass(pg_catalog.format('%I.%I',expected.schema_name,expected.relation_name))) <> 1",
    '      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy policy JOIN pg_catalog.pg_roles owner_role ON owner_role.rolname=expected.owner_name',
    "           WHERE policy.polrelid=pg_catalog.to_regclass(pg_catalog.format('%I.%I',expected.schema_name,expected.relation_name))",
    "             AND policy.polname=expected.policy_name AND policy.polcmd='*' AND policy.polpermissive",
    '             AND policy.polroles=ARRAY[owner_role.oid]::oid[] AND policy.polqual IS NOT NULL AND policy.polwithcheck IS NOT NULL)',
    '   ORDER BY 1 LIMIT 1;',
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'private relation owner policy missing or non-exact: %',bad; END IF;",
    ...preSessionGateVerifierLines(preSessionRows),
    `  RAISE NOTICE 'BCB_CATALOG_CLOSURE_VERIFIED database=${dbName} relations=${exactRelations.length} routines=${functions.length} exact_pre_session_roots=${exactPreSessionRoots.length}';`,
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
export function generateEnvLoginVariableSql(declaration, env, dbName) {
  const records = environmentLoginRecords(declaration, env, dbName);
  const contractVariables = new Map([
    ['app_staff', 'app_staff_login'], ['app_patient', 'app_patient_login'],
    ['app_platform_settings', 'app_global_admin_login'], ['app_integrator_request', 'integrator_login'],
  ]);
  return [
    '-- Exact declaration-derived psql variables for contract/object DDL.',
    ...records.map(([loginName, record]) => {
      const variable = contractVariables.get(record.canonicalRole);
      if (!variable) throw new DeclarationGapError([{ site: `envMapping.${env}.${loginName}`, reason: 'LOGIN lacks a contract canonical role' }]);
      return `\\set ${variable} ${loginName}`;
    }),
    '',
  ].join('\n');
}

/** Read-only guard for the shared cluster-role baseline used by a per-target
 * reconcile. Shared drift is repaired only by the separate host baseline. */
export function generateSharedRoleVerifierSql(declaration) {
  const expectedRoles = managedRoleNames(declaration).map((roleName) => {
    const role = declaration.cluster.roles[roleName];
    return `(${lit(roleName)}::name,${role.login},${role.superuser},false,${role.bypassrls},${role.inherit},${role.createrole},false)`;
  }).join(',\n');
  const expectedEdges = [];
  for (const [roleName, role] of Object.entries(declaration.cluster.roles)) {
    if (role.kind === 'superuser') continue;
    for (const membership of role.grantedTo ?? []) {
      expectedEdges.push([roleName, membership.role, membership.admin, membership.inherit, membership.set, true]);
    }
  }
  for (const records of Object.values(declaration.envMapping ?? {})) {
    for (const [loginName, record] of Object.entries(records)) {
      for (const membership of record.memberships ?? []) {
        expectedEdges.push([
          membership.role, loginName, membership.admin, membership.inherit, membership.set, false,
        ]);
      }
    }
  }
  const expectedEdgeSql = expectedEdges.length > 0
    ? expectedEdges.sort(([aRole, aMember], [bRole, bMember]) => `${aRole}:${aMember}`.localeCompare(`${bRole}:${bMember}`))
      .map(([role, member, admin, inherit, set, required]) => `(${lit(role)}::name,${lit(member)}::name,${admin},${inherit},${set},${required})`).join(',\n')
    : "(''::name,''::name,false,false,false,false)";
  return [
    '-- Read-only shared-role baseline verifier for per-target reconcile.',
    'CREATE TEMP TABLE bcb_expected_shared_roles(role_name name PRIMARY KEY, can_login boolean, is_super boolean, can_createdb boolean, can_bypassrls boolean, does_inherit boolean, can_createrole boolean, can_replicate boolean) ON COMMIT DROP;',
    `INSERT INTO bcb_expected_shared_roles VALUES ${expectedRoles};`,
    'CREATE TEMP TABLE bcb_expected_shared_role_edges(role_name name, member_name name, admin_option boolean, inherit_option boolean, set_option boolean, required boolean) ON COMMIT DROP;',
    `INSERT INTO bcb_expected_shared_role_edges VALUES ${expectedEdgeSql};`,
    'DO $bcb$ DECLARE bad text; BEGIN',
    "  SELECT expected.role_name::text INTO bad FROM bcb_expected_shared_roles expected LEFT JOIN pg_catalog.pg_roles actual ON actual.rolname=expected.role_name WHERE actual.oid IS NULL OR actual.rolcanlogin<>expected.can_login OR actual.rolsuper<>expected.is_super OR actual.rolcreatedb<>expected.can_createdb OR actual.rolbypassrls<>expected.can_bypassrls OR actual.rolinherit<>expected.does_inherit OR actual.rolcreaterole<>expected.can_createrole OR actual.rolreplication<>expected.can_replicate LIMIT 1;",
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'shared role baseline drift: %; run the separate cluster baseline',bad; END IF;",
    "  SELECT granted.rolname || '->' || member.rolname INTO bad FROM pg_catalog.pg_auth_members membership JOIN pg_catalog.pg_roles granted ON granted.oid=membership.roleid JOIN pg_catalog.pg_roles member ON member.oid=membership.member WHERE (granted.rolname IN (SELECT role_name FROM bcb_expected_shared_roles) OR member.rolname IN (SELECT role_name FROM bcb_expected_shared_roles)) AND NOT EXISTS (SELECT 1 FROM bcb_expected_shared_role_edges expected WHERE expected.role_name=granted.rolname AND expected.member_name=member.rolname AND expected.admin_option=membership.admin_option AND expected.inherit_option=membership.inherit_option AND expected.set_option=membership.set_option) LIMIT 1;",
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'undeclared shared role membership: %; run the separate cluster baseline',bad; END IF;",
    "  SELECT expected.role_name || '->' || expected.member_name INTO bad FROM bcb_expected_shared_role_edges expected WHERE expected.required AND expected.role_name<>''::name AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members membership JOIN pg_catalog.pg_roles granted ON granted.oid=membership.roleid JOIN pg_catalog.pg_roles member ON member.oid=membership.member WHERE granted.rolname=expected.role_name AND member.rolname=expected.member_name AND membership.admin_option=expected.admin_option AND membership.inherit_option=expected.inherit_option AND membership.set_option=expected.set_option) LIMIT 1;",
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'missing shared role membership: %; run the separate cluster baseline',bad; END IF;",
    "  RAISE NOTICE 'BCB_SHARED_ROLE_BASELINE_VERIFIED';",
    'END $bcb$;',
    '',
  ].join('\n');
}

/** Safe declaration-derived shells created before initial-cutover contract/object DDL. */
export function generateEnvLoginShellSql(declaration, env, dbName) {
  const records = environmentLoginRecords(declaration, env, dbName);
  return [
    '-- Exact declaration-derived LOGIN shells; credentials/grants render last.',
    ...records.flatMap(([loginName]) => [
      `CREATE ROLE ${q(loginName)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;`,
      `ALTER ROLE ${q(loginName)} RESET ALL;`,
      `ALTER ROLE ${q(loginName)} IN DATABASE ${q(dbName)} RESET ALL;`,
    ]),
    generateEnvLoginVariableSql(declaration, env, dbName),
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
  const declaredRoleNames = Object.keys(declaration.cluster?.roles ?? {}).sort();
  const legacyRoleNames = [...new Set(declaration.zeroState?.legacyRoles ?? [])].sort();
  const allowedManagedNames = [...new Set([
    ...allDeclaredLoginNames,
    ...declaredRoleNames,
    ...legacyRoleNames,
  ])].sort();
  const foreignNames = allDeclaredLoginNames.filter((name) => !names.includes(name));
  const memberships = records.flatMap(([login, record]) => (record.memberships ?? []).map((m) =>
    `(${lit(login)}::name,${lit(m.role)}::name,${m.admin},${m.inherit},${m.set})`));
  const usages = records.flatMap(([login]) => Object.entries(db.schemas)
    .filter(([, schema]) => schema.present && (schema.usage ?? []).includes(login))
    .map(([schema]) => `(${lit(login)}::name,${lit(schema)}::name)`));
  const expectedMemberships = memberships.join(', ');
  const expectedNames = names.map(lit).join(', ');
  const allDeclaredNames = allDeclaredLoginNames.map(lit).join(', ');
  const allowedManaged = allowedManagedNames.map(lit).join(', ');
  const legacyNames = legacyRoleNames.map(lit).join(', ');
  const foreignDeclaredNames = foreignNames.map(lit).join(', ');
  return [
    '-- Exact target environment verifier: four SCRAM LOGIN attrs, memberships, CONNECT and schema USAGE.',
    'DO $bcb$', 'DECLARE bad text;', 'BEGIN',
    `  SELECT rolname INTO bad FROM pg_catalog.pg_roles WHERE rolname=ANY(ARRAY[${expectedNames}]::name[]) AND (NOT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit) LIMIT 1;`,
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'environment login attributes mismatch: %', bad; END IF;",
    `  SELECT rolname INTO bad FROM pg_catalog.pg_authid WHERE rolname=ANY(ARRAY[${expectedNames}]::name[]) AND COALESCE(rolpassword, '') NOT LIKE 'SCRAM-SHA-256$%' LIMIT 1;`,
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'environment LOGIN lacks SCRAM verifier: %', bad; END IF;",
    `  SELECT rolname INTO bad FROM pg_catalog.pg_roles WHERE rolcanlogin AND rolname ~ '^(app_|bcb_|saas_|bersoncarebot_)' AND rolname <> ALL(ARRAY[${allDeclaredNames}]::name[]) LIMIT 1;`,
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'undeclared BCB LOGIN survived: %', bad; END IF;",
    `  SELECT rolname INTO bad FROM pg_catalog.pg_roles WHERE rolname ~ '^(app_|bcb_|saas_|bersoncarebot_)' AND rolname <> ALL(ARRAY[${allowedManaged}]::name[]) LIMIT 1;`,
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'undeclared managed BCB role survived: %', bad; END IF;",
    ...(legacyRoleNames.length ? [
      `  SELECT rolname INTO bad FROM pg_catalog.pg_roles WHERE rolname=ANY(ARRAY[${legacyNames}]::name[]) AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit) LIMIT 1;`,
      "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'retained legacy role is not quarantined NOLOGIN: %', bad; END IF;",
      `  SELECT member.rolname || '->' || role.rolname INTO bad FROM pg_catalog.pg_auth_members membership JOIN pg_catalog.pg_roles role ON role.oid=membership.roleid JOIN pg_catalog.pg_roles member ON member.oid=membership.member WHERE member.rolname=ANY(ARRAY[${legacyNames}]::name[]) OR role.rolname=ANY(ARRAY[${legacyNames}]::name[]) LIMIT 1;`,
      "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'retained legacy role still has membership: %', bad; END IF;",
      `  SELECT rolname INTO bad FROM pg_catalog.pg_roles WHERE rolname=ANY(ARRAY[${legacyNames}]::name[]) AND has_database_privilege(rolname,${lit(dbName)},'CONNECT') LIMIT 1;`,
      "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'retained legacy role can CONNECT target: %', bad; END IF;",
      `  SELECT role_row.rolname || ':' || schema_row.nspname INTO bad FROM pg_catalog.pg_roles role_row CROSS JOIN pg_catalog.pg_namespace schema_row WHERE role_row.rolname=ANY(ARRAY[${legacyNames}]::name[]) AND schema_row.nspname=ANY(ARRAY['app','app_ext','integrator','public']::name[]) AND has_schema_privilege(role_row.rolname,schema_row.oid,'USAGE') LIMIT 1;`,
      "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'retained legacy role has target schema USAGE: %', bad; END IF;",
    ] : []),
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
    for (const [signature, expectedContract] of Object.entries(SPECIAL_BODY_RELATION_SURFACE_CONTRACTS)) {
      if (context.functions[signature]?.bodyRelationSurfaceContract !== expectedContract) {
        add(`portContext.functions.${signature}.bodyRelationSurfaceContract`,
          `exact special contract must be '${expectedContract}'`);
      }
    }
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
      if (fn.bodyRelationSurfaceContract && (fn.security !== 'DEFINER'
        || (fn.relationSurfaces?.length ?? 0) > 0 || (fn.delegatesTo?.length ?? 0) > 0)) {
        add(`portContext.functions.${signature}.bodyRelationSurfaceContract`,
          'special body relation contract is only valid for a DEFINER without ordinary surfaces or delegates');
      }
      if (fn.bodyRelationSurfaceContract
        && SPECIAL_BODY_RELATION_SURFACE_CONTRACTS[signature] !== fn.bodyRelationSurfaceContract) {
        add(`portContext.functions.${signature}.bodyRelationSurfaceContract`,
          'function is not in the exact special body relation contract allowlist');
      }
      for (const [index, surface] of (fn.relationSurfaces ?? []).entries()) {
        const ssite = `portContext.functions.${signature}.relationSurfaces[${index}]`;
        if (!declaration.databases.bersoncarebot_test?.tables?.[surface.relation]
          && !context.privateRelations?.[surface.relation]) add(ssite, `unknown relation '${surface.relation}'`);
        if (surface.columns.length === 0 || surface.operations.length === 0) add(ssite, 'surface needs named columns and operations');
        for (const [operation, columns] of Object.entries(surface.operationColumns ?? {})) {
          if (!surface.operations.includes(operation) || !Array.isArray(columns) || columns.length === 0
            || columns.some((column) => !surface.columns.includes(column))) {
            add(ssite, `operation-specific columns are invalid for '${operation}'`);
          }
        }
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
            || named.operations.some((operation) => !surface.operations.includes(operation))
            || Object.entries(named.operationColumns ?? {}).some(([operation, columns]) =>
              !surface.operationColumns?.[operation]
              || columns.length !== surface.operationColumns[operation].length
              || columns.some((column) => !surface.operationColumns[operation].includes(column)))) {
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

const EXACT_ARG_SEND = {
  uuid: ['uuid@1', 'uuid_send'],
  oid: ['oid@1', 'oidsend'],
  integer: ['integer@1', 'int4send'],
  bigint: ['bigint@1', 'int8send'],
  xid8: ['xid8@1', 'xid8send'],
  boolean: ['boolean@1', 'boolsend'],
  text: ['text@1', 'textsend'],
  name: ['name@1', 'namesend'],
  bytea: ['bytea@1', 'byteasend'],
  timestamptz: ['timestamptz@1', 'timestamptz_send'],
  'timestamp with time zone': ['timestamptz@1', 'timestamptz_send'],
};

function exactTypedArgsHashSql(signature, typedArgs) {
  if (typedArgs.length === 0) return 'app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[])';
  const rows = typedArgs.map((type, index) => {
    const recipe = EXACT_ARG_SEND[type];
    if (!recipe) throw new DeclarationGapError([{ site: `portContext.functions.${signature}.typedArgs`,
      reason: `named runtime root cannot render exact gate for '${type}'` }]);
    return `ROW(${lit(recipe[0])}, pg_catalog.${recipe[1]}($${index + 1}))::app.port_typed_arg`;
  });
  return `app.hash_port_typed_args(ARRAY[${rows.join(', ')}])`;
}

/**
 * Every callable runtime SECURITY DEFINER must reject before its original body
 * can take a no-row/early-return branch. Named roots keep the exact
 * function/purpose/typed-args contract. Ordinary relation operations require
 * any current port-attested context for one of their declared target roles.
 * Context primitives themselves keep their hand-written stronger checks.
 */
function generateRuntimeDefinerGateSql(declaration, dbName, databaseFunctions) {
  const db = declaration.databases[dbName];
  const capabilities = resolvePortContextCapabilities(declaration, dbName);
  const targetRoles = new Set(capabilities.map((row) => row.targetRole));
  const roots = new Map();
  for (const row of capabilities.filter((candidate) => candidate.functionIdentity)) {
    const list = roots.get(row.functionIdentity) ?? [];
    list.push(row);
    roots.set(row.functionIdentity, list);
  }
  // Direct EXECUTE ACL and accepted transaction contexts are separate facts.
  // A helper called only through a declared SECURITY DEFINER wrapper must accept
  // the wrapper's context without becoming directly executable by that role.
  // Propagate contexts through the explicit delegatesTo graph; grants remain
  // derived solely from fn.execute below in the function ACL renderer.
  const acceptedTargets = new Map();
  for (const [signature, fn] of databaseFunctions) {
    acceptedTargets.set(
      signature,
      new Set(functionExecute(db, fn).filter((role) => targetRoles.has(role))),
    );
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const [callerSignature, caller] of databaseFunctions) {
      const callerTargets = acceptedTargets.get(callerSignature) ?? new Set();
      for (const delegatedSignature of caller.delegatesTo ?? []) {
        const delegatedTargets = acceptedTargets.get(delegatedSignature);
        if (!delegatedTargets) continue;
        for (const role of callerTargets) {
          if (delegatedTargets.has(role)) continue;
          delegatedTargets.add(role);
          changed = true;
        }
      }
    }
  }
  const gates = [];
  for (const [signature, fn] of databaseFunctions) {
    if (fn.security !== 'DEFINER' || (fn.invocation ?? 'runtime') !== 'runtime'
      || fn.execute.length === 0 || fn.owner === 'app_seam_context_owner') continue;
    const allowedTargets = [...(acceptedTargets.get(signature) ?? [])].sort();
    if (allowedTargets.length === 0) continue;
    const namedRows = roots.get(signature) ?? [];
    if (namedRows.length > 0) {
      const tuples = [...new Map(namedRows.map((row) => [
        [row.targetRole, row.contextClass, row.purpose].join('\0'), row,
      ])).values()];
      if (tuples.length > 1) {
        gates.push({
          signature,
          mode: 'exact_existing',
          expression: '',
          expectedTokens: [...new Set([
            fn.owner,
            signature,
            'app.hash_port_typed_args',
            ...tuples.flatMap((tuple) => [tuple.targetRole, tuple.contextClass, tuple.purpose]),
          ])].sort(),
        });
        continue;
      }
      const row = tuples[0];
      const hash = exactTypedArgsHashSql(signature, fn.typedArgs);
      gates.push({
        signature,
        mode: 'exact',
        expression: `app.require_accepted_context(${lit(fn.owner)}::name, ${lit(row.targetRole)}::name, `
          + `${lit(row.contextClass)}::app.port_context_class, ${lit(row.purpose)}, ${hash}, `
          + `${lit(signature)}::regprocedure)`,
        expectedTokens: [],
      });
      continue;
    }
    gates.push({
      signature,
      mode: 'attested',
      expression: `app.require_attested_context_for_roles(${lit(fn.owner)}::name, `
        + `ARRAY[${allowedTargets.map((role) => `${lit(role)}::name`).join(', ')}]::name[])`,
      expectedTokens: [],
    });
  }
  if (gates.length === 0) return '';
  const values = gates.map((gate) =>
    `  (${lit(gate.signature)}, ${lit(gate.mode)}, ${lit(gate.expression)}, ARRAY[${gate.expectedTokens.map(lit).join(', ')}]::text[])`).join(',\n');
  return [
    '-- Runtime definer body gate: exact named roots; attested target-role gate for relation operations.',
    'CREATE TEMP TABLE bcb_runtime_definer_gates(signature text PRIMARY KEY, mode text NOT NULL, gate_expression text NOT NULL, expected_tokens text[] NOT NULL) ON COMMIT DROP;',
    'INSERT INTO bcb_runtime_definer_gates(signature,mode,gate_expression,expected_tokens) VALUES', values, ';',
    'DO $bcb$',
    'DECLARE gate record; routine record; definition text; new_source text; source_at integer; guard_at integer; guard_length integer; guard_source text; statement_prefix text; missing_token text;',
    'BEGIN',
    '  FOR gate IN SELECT * FROM bcb_runtime_definer_gates ORDER BY signature LOOP',
    '    SELECT p.oid, p.prosrc, l.lanname INTO routine',
    '      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang',
    '     WHERE p.oid=pg_catalog.to_regprocedure(gate.signature);',
    "    IF routine.oid IS NULL THEN RAISE EXCEPTION 'runtime definer gate target missing: %',gate.signature; END IF;",
    "    IF gate.mode='exact_existing' THEN",
    "      guard_at := position('app.require_accepted_context' IN routine.prosrc);",
    "      IF guard_at=0 THEN RAISE EXCEPTION 'multi-capability named root lacks a hand-written exact gate: %',gate.signature; END IF;",
    "      guard_length := position(';' IN pg_catalog.substr(routine.prosrc, guard_at)) - 1;",
    "      IF guard_length<1 THEN RAISE EXCEPTION 'multi-capability named root lacks a replaceable hand-written exact gate: %',gate.signature; END IF;",
    "      guard_source := pg_catalog.substr(routine.prosrc, guard_at, guard_length);",
    "      SELECT token INTO missing_token FROM pg_catalog.unnest(gate.expected_tokens) token WHERE position(token IN guard_source)=0 ORDER BY token LIMIT 1;",
    "      IF missing_token IS NOT NULL THEN RAISE EXCEPTION 'multi-capability exact gate token mismatch for %: %',gate.signature,missing_token; END IF;",
    "    END IF;",
    "    guard_at := CASE gate.mode",
    "      WHEN 'exact' THEN position('app.require_accepted_context' IN routine.prosrc)",
    "      ELSE position('app.require_attested_context_for_roles' IN routine.prosrc) END;",
    "    IF guard_at=0 THEN guard_at := CASE gate.mode",
    "      WHEN 'exact' THEN position('app.require_attested_context_for_roles' IN routine.prosrc)",
    "      ELSE position('app.require_accepted_context' IN routine.prosrc) END; END IF;",
    "    IF guard_at>0 THEN",
    "      guard_length := position(';' IN pg_catalog.substr(routine.prosrc, guard_at)) - 1;",
    "      IF guard_at=0 OR guard_length<1 THEN RAISE EXCEPTION 'existing runtime definer gate is not replaceable: %',gate.signature; END IF;",
    "      IF gate.mode<>'exact_existing' THEN guard_source := gate.gate_expression; END IF;",
    "      statement_prefix := substring(pg_catalog.substr(routine.prosrc, 1, guard_at - 1) FROM '((PERFORM|SELECT)[[:space:]]+)$');",
    "      IF statement_prefix IS NULL THEN RAISE EXCEPTION 'existing runtime definer gate is not a standalone statement: %',gate.signature; END IF;",
    '      new_source := pg_catalog.overlay(routine.prosrc, guard_source, guard_at, guard_length);',
    "    ELSE",
    "      guard_source := gate.gate_expression;",
    "      new_source := routine.prosrc;",
    "      IF routine.lanname='sql' THEN",
    "        new_source := 'SELECT ' || guard_source || ';' || E'\\n' || new_source;",
    "      ELSIF routine.lanname='plpgsql' THEN",
    "        new_source := pg_catalog.regexp_replace(new_source, '(^|\\n)([[:space:]]*)BEGIN', E'\\\\1\\\\2BEGIN\\n\\\\2  PERFORM ' || guard_source || ';', 1, 1, 'in');",
    "        IF new_source = routine.prosrc THEN RAISE EXCEPTION 'PL/pgSQL runtime definer has no injectable BEGIN: %',gate.signature; END IF;",
    "      ELSE RAISE EXCEPTION 'unsupported runtime definer language %: %',routine.lanname,gate.signature; END IF;",
    "    END IF;",
    '    IF new_source = routine.prosrc THEN CONTINUE; END IF;',
    '    definition := pg_catalog.pg_get_functiondef(routine.oid);',
    '    source_at := position(routine.prosrc IN definition);',
    "    IF source_at=0 THEN RAISE EXCEPTION 'runtime definer source not found in canonical definition: %',gate.signature; END IF;",
    '    definition := pg_catalog.overlay(definition, new_source, source_at, char_length(routine.prosrc));',
    '    EXECUTE definition;',
    '  END LOOP;',
    'END',
    '$bcb$;',
    'DO $bcb$ DECLARE bad text; BEGIN',
    '  SELECT gate.signature INTO bad FROM bcb_runtime_definer_gates gate',
    '    JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(gate.signature)',
    '    JOIN pg_catalog.pg_language l ON l.oid=p.prolang',
    "   WHERE (gate.mode IN ('exact','exact_existing') AND position('app.require_accepted_context' IN p.prosrc)=0)",
    "      OR (gate.mode='attested' AND position('app.require_accepted_context' IN p.prosrc)=0 AND position('app.require_attested_context_for_roles' IN p.prosrc)=0)",
    "      OR (l.lanname='plpgsql' AND substring(p.prosrc FROM position('BEGIN' IN upper(p.prosrc))) !~* '^BEGIN[[:space:]]+PERFORM[[:space:]]+app[.](require_accepted_context|require_attested_context_for_roles)[[:space:]]*[(]')",
    "      OR (l.lanname='sql' AND p.prosrc !~* '^[[:space:]]*SELECT[[:space:]]+app[.](require_accepted_context|require_attested_context_for_roles)[[:space:]]*[(]')",
    '   ORDER BY gate.signature LIMIT 1;',
    "  IF bad IS NOT NULL THEN RAISE EXCEPTION 'runtime definer body is not context gated: %',bad; END IF;",
    `  RAISE NOTICE 'BCB_RUNTIME_DEFINER_GATES_VERIFIED database=${dbName} functions=${gates.length}';`,
    'END $bcb$;',
    '',
  ].join('\n');
}

function generateFunctionBodySurfaceVerifySql(databaseFunctions) {
  const functionRows = databaseFunctions.map(([signature]) => `  (${lit(signature)})`);
  const specialContractRows = databaseFunctions
    .filter(([, fn]) => fn.bodyRelationSurfaceContract)
    .map(([signature, fn]) => `  (${lit(signature)}, ${lit(fn.bodyRelationSurfaceContract)})`);
  const rows = databaseFunctions.flatMap(([signature, fn]) =>
    (fn.relationSurfaces ?? []).map((surface) =>
      `  (${lit(signature)}, ${lit(surface.relation)}, ARRAY[${surface.columns.map(lit).join(', ')}]::text[], ARRAY[${surface.operations.map(lit).join(', ')}]::text[])`));
  if (rows.length === 0) return '';
  return [
    '-- Function-body relation-operation verifier: the declaration must cover PostgreSQL statement semantics.',
    'CREATE TEMP TABLE bcb_function_surface_functions(signature text PRIMARY KEY) ON COMMIT DROP;',
    'INSERT INTO bcb_function_surface_functions(signature) VALUES', functionRows.join(',\n'), ';',
    'CREATE TEMP TABLE bcb_function_surface_special_contracts(signature text PRIMARY KEY, contract text NOT NULL) ON COMMIT DROP;',
    ...(specialContractRows.length > 0 ? [
      'INSERT INTO bcb_function_surface_special_contracts(signature,contract) VALUES',
      specialContractRows.join(',\n'),
      ';',
    ] : []),
    'CREATE TEMP TABLE bcb_function_relation_surfaces(signature text NOT NULL, relation_name text NOT NULL, columns text[] NOT NULL, operations text[] NOT NULL) ON COMMIT DROP;',
    'INSERT INTO bcb_function_relation_surfaces(signature,relation_name,columns,operations) VALUES',
    rows.join(',\n'),
    ';',
    'CREATE TEMP TABLE bcb_function_surface_gaps(message text PRIMARY KEY) ON COMMIT DROP;',
    'DO $bcb$',
    'DECLARE function_row record; relation_row record; surface record; source text; relation_pattern text; column_pattern text; mutation text; gap_list text; actual_select boolean; actual_insert boolean; actual_update boolean; actual_delete boolean;',
    'BEGIN',
    "  IF 'insert into x(id) values (1) on conflict do nothing' ~ '\\mon[[:space:]]+conflict[[:space:]]+(\\(|on[[:space:]]+constraint\\M)[^;]*\\mdo[[:space:]]+nothing\\M' THEN RAISE EXCEPTION 'targetless ON CONFLICT DO NOTHING was classified as requiring SELECT'; END IF;",
    "  IF NOT ('insert into x(id) values (1) on conflict (id) do nothing' ~ '\\mon[[:space:]]+conflict[[:space:]]+(\\(|on[[:space:]]+constraint\\M)[^;]*\\mdo[[:space:]]+nothing\\M') THEN RAISE EXCEPTION 'indexed ON CONFLICT DO NOTHING was not classified as requiring SELECT'; END IF;",
    "  IF NOT ('insert into x(id) values (1) on conflict on constraint x_pkey do nothing' ~ '\\mon[[:space:]]+conflict[[:space:]]+(\\(|on[[:space:]]+constraint\\M)[^;]*\\mdo[[:space:]]+nothing\\M') THEN RAISE EXCEPTION 'constrained ON CONFLICT DO NOTHING was not classified as requiring SELECT'; END IF;",
    '  FOR function_row IN SELECT * FROM bcb_function_surface_functions ORDER BY signature LOOP',
    '    SELECT pg_catalog.lower(p.prosrc) INTO source FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure(function_row.signature);',
    "    IF source IS NULL THEN INSERT INTO bcb_function_surface_gaps VALUES ('function body surface target missing: '||function_row.signature) ON CONFLICT DO NOTHING; CONTINUE; END IF;",
    `    FOR relation_row IN SELECT n.nspname||'.'||c.relname AS relation_name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN (${MANAGED_APPLICATION_SCHEMAS.map(lit).join(', ')}) AND c.relkind IN ('r','p','v','m','f') ORDER BY n.nspname,c.relname LOOP`,
    "      relation_pattern := pg_catalog.replace(relation_row.relation_name, '.', '\\.');",
    "      IF (source ~ ('\\minsert[[:space:]]+into[[:space:]]+'||relation_pattern||'\\M') OR source ~ ('\\mupdate[[:space:]]+(only[[:space:]]+)?'||relation_pattern||'\\M') OR source ~ ('\\mdelete[[:space:]]+from[[:space:]]+'||relation_pattern||'\\M') OR source ~ ('\\m(select|perform)\\M[^;]*\\mfrom[[:space:]]+'||relation_pattern||'\\M') OR source ~ ('\\mupdate\\M[^;]*\\mfrom[[:space:]]+'||relation_pattern||'\\M') OR source ~ ('\\mdelete\\M[^;]*\\musing[[:space:]]+'||relation_pattern||'\\M') OR source ~ ('\\mfrom\\M[^;]*,[[:space:]]*'||relation_pattern||'\\M') OR source ~ ('\\mjoin[[:space:]]+'||relation_pattern||'\\M')) AND NOT EXISTS (SELECT 1 FROM bcb_function_relation_surfaces declared WHERE declared.signature=function_row.signature AND declared.relation_name=relation_row.relation_name) AND NOT EXISTS (SELECT 1 FROM bcb_function_surface_special_contracts special WHERE special.signature=function_row.signature) THEN",
    "        INSERT INTO bcb_function_surface_gaps VALUES ('function body relation surface absent: '||function_row.signature||' -> '||relation_row.relation_name) ON CONFLICT DO NOTHING;",
    '      END IF;',
    '    END LOOP;',
    '  END LOOP;',
    '  FOR surface IN SELECT * FROM bcb_function_relation_surfaces ORDER BY signature,relation_name LOOP',
    '    SELECT pg_catalog.lower(p.prosrc) INTO source FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure(surface.signature);',
    "    IF source IS NULL THEN INSERT INTO bcb_function_surface_gaps VALUES ('function body surface target missing: '||surface.signature) ON CONFLICT DO NOTHING; CONTINUE; END IF;",
    "    relation_pattern := pg_catalog.replace(surface.relation_name, '.', '\\.');",
    "    column_pattern := pg_catalog.array_to_string(surface.columns, '|');",
    "    actual_insert := source ~ ('\\minsert[[:space:]]+into[[:space:]]+'||relation_pattern||'\\M');",
    "    actual_update := source ~ ('\\mupdate[[:space:]]+(only[[:space:]]+)?'||relation_pattern||'\\M') OR source ~ ('\\minsert[[:space:]]+into[[:space:]]+'||relation_pattern||'\\M[^;]*\\mon[[:space:]]+conflict\\M[^;]*\\mdo[[:space:]]+update\\M');",
    "    actual_delete := source ~ ('\\mdelete[[:space:]]+from[[:space:]]+'||relation_pattern||'\\M');",
    "    actual_select := source ~ ('\\m(select|perform)\\M[^;]*\\mfrom[[:space:]]+'||relation_pattern||'\\M') OR source ~ ('\\mupdate\\M[^;]*\\mfrom[[:space:]]+'||relation_pattern||'\\M') OR source ~ ('\\mdelete\\M[^;]*\\musing[[:space:]]+'||relation_pattern||'\\M') OR source ~ ('\\mfrom\\M[^;]*,[[:space:]]*'||relation_pattern||'\\M') OR source ~ ('\\mjoin[[:space:]]+'||relation_pattern||'\\M') OR source ~ ('\\minsert[[:space:]]+into[[:space:]]+'||relation_pattern||'\\M[^;]*(\\mon[[:space:]]+conflict\\M[^;]*\\mdo[[:space:]]+update\\M|\\mon[[:space:]]+conflict[[:space:]]+(\\(|on[[:space:]]+constraint\\M)[^;]*\\mdo[[:space:]]+nothing\\M|\\mreturning\\M)') OR source ~ ('\\mupdate[[:space:]]+(only[[:space:]]+)?'||relation_pattern||'\\M[^;]*\\m(where|returning)\\M[^;]*\\m('||column_pattern||')\\M') OR source ~ ('\\mdelete[[:space:]]+from[[:space:]]+'||relation_pattern||'\\M[^;]*\\m(where|returning)\\M[^;]*\\m('||column_pattern||')\\M');",
    "    IF source ~ ('\\minsert[[:space:]]+into[[:space:]]+'||relation_pattern||'\\M') AND NOT ('INSERT'=ANY(surface.operations)) THEN INSERT INTO bcb_function_surface_gaps VALUES ('function body requires undeclared INSERT: '||surface.signature||' -> '||surface.relation_name) ON CONFLICT DO NOTHING; END IF;",
    "    IF source ~ ('\\mupdate[[:space:]]+(only[[:space:]]+)?'||relation_pattern||'\\M') AND NOT ('UPDATE'=ANY(surface.operations)) THEN INSERT INTO bcb_function_surface_gaps VALUES ('function body requires undeclared UPDATE: '||surface.signature||' -> '||surface.relation_name) ON CONFLICT DO NOTHING; END IF;",
    "    IF source ~ ('\\mdelete[[:space:]]+from[[:space:]]+'||relation_pattern||'\\M') AND NOT ('DELETE'=ANY(surface.operations)) THEN INSERT INTO bcb_function_surface_gaps VALUES ('function body requires undeclared DELETE: '||surface.signature||' -> '||surface.relation_name) ON CONFLICT DO NOTHING; END IF;",
    "    IF (source ~ ('\\m(select|perform)\\M[^;]*\\mfrom[[:space:]]+'||relation_pattern||'\\M') OR source ~ ('\\mupdate\\M[^;]*\\mfrom[[:space:]]+'||relation_pattern||'\\M') OR source ~ ('\\mdelete\\M[^;]*\\musing[[:space:]]+'||relation_pattern||'\\M') OR source ~ ('\\mfrom\\M[^;]*,[[:space:]]*'||relation_pattern||'\\M') OR source ~ ('\\mjoin[[:space:]]+'||relation_pattern||'\\M')) AND NOT ('SELECT'=ANY(surface.operations)) THEN INSERT INTO bcb_function_surface_gaps VALUES ('function body requires undeclared SELECT: '||surface.signature||' -> '||surface.relation_name) ON CONFLICT DO NOTHING; END IF;",
    "    mutation := (pg_catalog.regexp_match(source, '(\\minsert[[:space:]]+into[[:space:]]+'||relation_pattern||'\\M[^;]*)'))[1];",
    "    IF mutation ~ '\\mon[[:space:]]+conflict\\M[^;]*\\mdo[[:space:]]+update\\M' AND NOT ('UPDATE'=ANY(surface.operations)) THEN INSERT INTO bcb_function_surface_gaps VALUES ('ON CONFLICT DO UPDATE requires undeclared UPDATE: '||surface.signature||' -> '||surface.relation_name) ON CONFLICT DO NOTHING; END IF;",
    "    IF mutation ~ '\\mon[[:space:]]+conflict\\M[^;]*\\mdo[[:space:]]+update\\M' AND NOT ('SELECT'=ANY(surface.operations)) THEN INSERT INTO bcb_function_surface_gaps VALUES ('ON CONFLICT DO UPDATE requires undeclared SELECT for conflict/update row: '||surface.signature||' -> '||surface.relation_name) ON CONFLICT DO NOTHING; END IF;",
    "    IF mutation ~ '\\mon[[:space:]]+conflict[[:space:]]+(\\(|on[[:space:]]+constraint\\M)[^;]*\\mdo[[:space:]]+nothing\\M' AND NOT ('SELECT'=ANY(surface.operations)) THEN INSERT INTO bcb_function_surface_gaps VALUES ('targeted ON CONFLICT DO NOTHING requires undeclared SELECT for conflict row: '||surface.signature||' -> '||surface.relation_name) ON CONFLICT DO NOTHING; END IF;",
    "    IF (mutation ~ '\\mreturning[[:space:]]+[*]' OR mutation ~ ('\\mreturning\\M[^;]*\\m('||column_pattern||')\\M')) AND NOT ('SELECT'=ANY(surface.operations)) THEN INSERT INTO bcb_function_surface_gaps VALUES ('INSERT RETURNING requires undeclared SELECT: '||surface.signature||' -> '||surface.relation_name) ON CONFLICT DO NOTHING; END IF;",
    "    mutation := (pg_catalog.regexp_match(source, '(\\mupdate[[:space:]]+(only[[:space:]]+)?'||relation_pattern||'\\M[^;]*)'))[1];",
    "    IF (mutation ~ '\\mreturning[[:space:]]+[*]' OR mutation ~ ('\\m(where|returning)\\M[^;]*\\m('||column_pattern||')\\M')) AND NOT ('SELECT'=ANY(surface.operations)) THEN INSERT INTO bcb_function_surface_gaps VALUES ('UPDATE predicate/RETURNING requires undeclared SELECT: '||surface.signature||' -> '||surface.relation_name) ON CONFLICT DO NOTHING; END IF;",
    "    mutation := (pg_catalog.regexp_match(source, '(\\mdelete[[:space:]]+from[[:space:]]+'||relation_pattern||'\\M[^;]*)'))[1];",
    "    IF (mutation ~ '\\mreturning[[:space:]]+[*]' OR mutation ~ ('\\m(where|returning)\\M[^;]*\\m('||column_pattern||')\\M')) AND NOT ('SELECT'=ANY(surface.operations)) THEN INSERT INTO bcb_function_surface_gaps VALUES ('DELETE predicate/RETURNING requires undeclared SELECT: '||surface.signature||' -> '||surface.relation_name) ON CONFLICT DO NOTHING; END IF;",
    "    IF 'SELECT'=ANY(surface.operations) AND NOT actual_select THEN INSERT INTO bcb_function_surface_gaps VALUES ('declared SELECT has no executable relation operation: '||surface.signature||' -> '||surface.relation_name) ON CONFLICT DO NOTHING; END IF;",
    "    IF 'INSERT'=ANY(surface.operations) AND NOT actual_insert THEN INSERT INTO bcb_function_surface_gaps VALUES ('declared INSERT has no executable relation operation: '||surface.signature||' -> '||surface.relation_name) ON CONFLICT DO NOTHING; END IF;",
    "    IF 'UPDATE'=ANY(surface.operations) AND NOT actual_update THEN INSERT INTO bcb_function_surface_gaps VALUES ('declared UPDATE has no executable relation operation: '||surface.signature||' -> '||surface.relation_name) ON CONFLICT DO NOTHING; END IF;",
    "    IF 'DELETE'=ANY(surface.operations) AND NOT actual_delete THEN INSERT INTO bcb_function_surface_gaps VALUES ('declared DELETE has no executable relation operation: '||surface.signature||' -> '||surface.relation_name) ON CONFLICT DO NOTHING; END IF;",
    '  END LOOP;',
    "  SELECT pg_catalog.string_agg(message, E'\\n' ORDER BY message) INTO gap_list FROM bcb_function_surface_gaps;",
    "  IF gap_list IS NOT NULL THEN RAISE EXCEPTION 'function body surface gaps (%):\\n%', (SELECT count(*) FROM bcb_function_surface_gaps), gap_list; END IF;",
    `  RAISE NOTICE 'BCB_FUNCTION_BODY_SURFACES_VERIFIED functions=${databaseFunctions.length} rows=${rows.length} special_contracts=${specialContractRows.length}';`,
    'END',
    '$bcb$;',
    '',
  ].join('\n');
}

/* ─────────────────────────── генерация SQL ─────────────────────────── */

/**
 * Exact per-database function closure. It is exported separately so a disposable PostgreSQL 16
 * catalog can prove the census even while unrelated relation-access gaps keep the full artifact
 * fail-closed.
 */
export function generateFunctionCensusSql(declaration, dbName, options = {}) {
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
    ...(options.removeUndeclaredDefiners === false ? [
      '-- Target-only reconcile: undeclared SECURITY DEFINER routines fail the bilateral audit; schema objects are not deleted.',
    ] : [
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
    ]),
    'DO $bcb$', 'DECLARE f record; r record;', 'BEGIN',
    "  FOR f IN SELECT n.nspname, p.proname, p.proowner, pg_catalog.pg_get_function_identity_arguments(p.oid) AS args FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace",
    `            WHERE n.nspname IN (${managedSchemasSql})`,
    "              AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend d WHERE d.classid = 'pg_proc'::pg_catalog.regclass AND d.objid = p.oid AND d.deptype = 'e') ORDER BY 1, 2, 3 LOOP",
    "    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC', f.nspname, f.proname, f.args);",
    '    FOR r IN SELECT rolname FROM pg_catalog.pg_roles WHERE oid <> f.proowner ORDER BY rolname LOOP',
    "      EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM %I', f.nspname, f.proname, f.args, r.rolname);",
    '    END LOOP;', '  END LOOP;', 'END', '$bcb$;', '',
  ];
  if (options.includeClusterState !== false) {
    for (const owner of seamOwners) emitMembershipRevokeToEmpty(out, owner, true);
    if (seamOwners.length > 0) out.push('');
  } else {
    out.push('-- Target-only reconcile: shared seam-owner memberships are verified, not mutated.', '');
  }
  out.push(generateRuntimeDefinerGateSql(declaration, dbName, databaseFunctions));
  out.push(generateFunctionBodySurfaceVerifySql(
    databaseFunctions.filter(([, fn]) => fn.security === 'DEFINER'),
  ));
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
  const includeClusterState = options.includeClusterState !== false;
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
  if (!includeClusterState) {
    out.push('-- Target-only reconcile: cluster-role baseline is a separate host operation.', '');
  } else {
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
    out.push(generateFunctionCensusSql(declaration, dbName, {
      includeClusterState,
      removeUndeclaredDefiners: includeClusterState,
    }));
    for (const [identity, relation] of Object.entries(portContext.privateRelations).sort(([a], [b]) => a.localeCompare(b))) {
      const { schema, name, qualified } = splitQualified(identity, `portContext.privateRelations.${identity}`);
      const policyName = `bcb_private_owner_${schema}_${name}`;
      out.push(`ALTER TABLE ${qualified} OWNER TO ${q(relation.owner)};`);
      out.push(`REVOKE ALL PRIVILEGES ON TABLE ${qualified} FROM PUBLIC;`);
      const targets = revokeTargets(relation.owner);
      if (targets.length > 0) out.push(`REVOKE ALL PRIVILEGES ON TABLE ${qualified} FROM ${revokeList(targets)};`);
      out.push(`DROP POLICY IF EXISTS ${q(policyName)} ON ${qualified};`);
      out.push(
        `CREATE POLICY ${q(policyName)} ON ${qualified} AS PERMISSIVE FOR ALL TO ${q(relation.owner)}`,
        `  USING (current_user = ${lit(relation.owner)}::name)`,
        `  WITH CHECK (current_user = ${lit(relation.owner)}::name);`,
      );
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
  if (!includeClusterState) {
    out.push('-- Target-only reconcile: role-to-role memberships are verified, not mutated.');
  } else {
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
    out.push(
      `-- последовательности ${tableKey}: exact revoke; INSERT/UPDATE ⇒ USAGE,SELECT на её последовательностях`,
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

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.error('generate.mjs is a library; run deploy/postgres/privileges/generate-cli.mjs instead');
  process.exitCode = 2;
}
