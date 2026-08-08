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
 *   • `proconfig`/`SET search_path` definer-функций — применяет ТЕЛО функции в миграции;
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

export const GENERATOR_VERSION = 1;

/** Канонический порядок привилегий (стабильный дифф). */
const PRIV_ORDER = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];

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

  /* — роли — */
  for (const name of sortedKeys(declaration.cluster.roles)) {
    const role = declaration.cluster.roles[name];
    for (const m of role.grantedTo ?? []) {
      if (!known(m.role)) add(`cluster.roles.${name}.grantedTo`, `неизвестный принципал '${m.role}'`);
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
    decl.bypassrls ? 'BYPASSRLS' : 'NOBYPASSRLS',
    decl.inherit ? 'INHERIT' : 'NOINHERIT',
    decl.createrole ? 'CREATEROLE' : 'NOCREATEROLE',
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

function emitMembershipRevokeToEmpty(out, roleName) {
  out.push(
    'DO $bcb$',
    'DECLARE m record;',
    'BEGIN',
    '  FOR m IN SELECT pg_catalog.pg_get_userbyid(am.member) AS member',
    '             FROM pg_catalog.pg_auth_members am',
    `            WHERE am.roleid = ${lit(roleName)}::regrole ORDER BY 1 LOOP`,
    `    EXECUTE pg_catalog.format('REVOKE %I FROM %I', ${lit(roleName)}, m.member);`,
    '  END LOOP;',
    'END',
    '$bcb$;',
  );
}

function revokeList(names) {
  return names.map(q).join(', ');
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
  const managed = managedRoleNames(declaration);
  const dbOwner = db.database.owner;
  const isLogin = (name) => logins.has(name) && !roles.has(name);
  const isRole = (name) => roles.has(name);
  const resolveOwner = (declared) => (declared === 'migrator' ? dbOwner : declared);
  /** Управляемые роли, у которых безопасно отзывать права на объекте с владельцем `owner`. */
  const revokeTargets = (owner) => managed.filter((r) => r !== owner);

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
    '--   • proconfig / SET search_path definer-функций — применяет тело функции в миграции;',
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
      emitMembershipRevokeToEmpty(out, roleName);
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
    out.push(`ALTER TABLE ${qualified} OWNER TO ${q(owner)};`);
    if (table.rls === 'n/a') {
      // Шаблон 'pending-removal' (declaration.ts WALL_TEMPLATES): таблица уходит — стену на неё не
      // ставим, но deny-by-default действует: ноль грантов рантайм-ролям. Пропуск ЯВНЫЙ, не тихий.
      out.push(`-- RLS: 'n/a' — таблица помечена PENDING_REMOVAL; статей RLS нет (одна власть — удаление).`);
    } else if (table.rls === 'off') {
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
  const defaults = db.definerExceptions?.defaults;
  if (defaults) {
    const exceptionRows = [...namedExceptions].sort().map((s) => `      ${lit(s)}`);
    out.push(
      `-- правило по умолчанию (§A.7): каждая SECURITY DEFINER функция схемы ${defaults.schema},`,
      `-- не названная исключением, обязана иметь владельца ${defaults.owner} и НОЛЬ PUBLIC EXECUTE.`,
      'DO $bcb$',
      'DECLARE f record;',
      'BEGIN',
      '  FOR f IN SELECT pg_catalog.format(',
      "             '%I.%I(%s)', n.nspname, p.proname,",
      "             pg_catalog.replace(pg_catalog.pg_get_function_identity_arguments(p.oid), ', ', ',')",
      '           ) AS sig',
      '             FROM pg_catalog.pg_proc p',
      '             JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace',
      `            WHERE n.nspname = ${lit(defaults.schema)} AND p.prosecdef`,
      ...(exceptionRows.length > 0
        ? [
          '              -- ключи исключений сравниваются в форме декларации: схема.имя(типы без пробелов)',
          '              AND pg_catalog.format(',
          "                    '%s.%s(%s)', n.nspname, p.proname,",
          "                    pg_catalog.replace(pg_catalog.pg_get_function_identity_arguments(p.oid), ', ', ',')",
          '                  ) NOT IN (',
          exceptionRows.join(',\n'),
          '              )',
        ]
        : []),
      '            ORDER BY 1 LOOP',
      `    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', f.sig, ${lit(defaults.owner)});`,
      "    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.sig);",
      '  END LOOP;',
      'END',
      '$bcb$;',
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
    '',
  ];
  for (const loginName of sortedKeys(records)) {
    const record = records[loginName];
    if (!record.connect?.includes(dbName)) continue;
    out.push(
      `-- ── логин ${loginName} ──`,
      'DO $bcb$',
      'BEGIN',
      `  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ${lit(loginName)}) THEN`,
      `    CREATE ROLE ${q(loginName)} LOGIN;`,
      '  END IF;',
      'END',
      '$bcb$;',
      `ALTER ROLE ${q(loginName)} LOGIN NOSUPERUSER NOBYPASSRLS `
      + `${record.inherit ? 'INHERIT' : 'NOINHERIT'} NOCREATEROLE;`,
      `ALTER ROLE ${q(loginName)} PASSWORD :'${record.passwordEnv}';`,
    );
    if (record.validUntil) out.push(`ALTER ROLE ${q(loginName)} VALID UNTIL ${lit(record.validUntil)};`);
    if (typeof record.connectionLimit === 'number') {
      out.push(`ALTER ROLE ${q(loginName)} CONNECTION LIMIT ${record.connectionLimit};`);
    }
    emitRolconfig(out, loginName, record.rolconfig, `envMapping.${env}.${loginName}.rolconfig`);
    if (record.canonicalRole) {
      if (!roles.has(record.canonicalRole)) {
        throw new Error(`envMapping.${env}.${loginName}: каноническая роль '${record.canonicalRole}' не объявлена`);
      }
      const m = record.membership ?? { admin: false, inherit: record.inherit, set: true };
      out.push(
        `GRANT ${q(record.canonicalRole)} TO ${q(loginName)} WITH ADMIN ${m.admin ? 'TRUE' : 'FALSE'}, `
        + `INHERIT ${m.inherit ? 'TRUE' : 'FALSE'}, SET ${m.set ? 'TRUE' : 'FALSE'};`,
      );
    }
    out.push(`GRANT CONNECT ON DATABASE ${q(dbName)} TO ${q(loginName)};`);
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
