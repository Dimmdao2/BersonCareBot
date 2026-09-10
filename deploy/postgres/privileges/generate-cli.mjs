#!/usr/bin/env node
/**
 * generate-cli.mjs — CLI генератора прав (SCHEME §B).
 *
 *   node deploy/postgres/privileges/generate-cli.mjs --db <база> [--out <файл>|--stdout]
 *   node deploy/postgres/privileges/generate-cli.mjs --all            # обе управляемые базы в generated/
 *   node deploy/postgres/privileges/generate-cli.mjs --check          # ГЕЙТ CI: перегенерировать и сверить
 *   node deploy/postgres/privileges/generate-cli.mjs --gaps           # перечислить пробелы декларации
 *   node deploy/postgres/privileges/generate-cli.mjs --census         # callsite → runtime principal → relation gate
 *   node deploy/postgres/privileges/generate-cli.mjs --env <env> --db <база>   # login-рендер (НЕ коммитится)
 *   node deploy/postgres/privileges/generate-cli.mjs --env <env> --db <база> --port-context-env <webapp|integrator>
 *   node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only # exact DB capability seeds
 *   node deploy/postgres/privileges/generate-cli.mjs --legacy-role-quarantine <role> # attribute-only; no CREATE/GRANT
 *   node deploy/postgres/privileges/generate-cli.mjs --shared-role-baseline --db <база>   # роли кластера
 *   node deploy/postgres/privileges/generate-cli.mjs --shared-role-verify   --db <база>   # сверка ролей
 *     ⤷ здесь `--db` называет ЦЕЛЕВОЙ КЛАСТЕР (по базе), а не выбирает объекты базы: роли, объявленные
 *       только для чужой среды (мигратор соседнего окружения), в чужой кластер не попадают.
 *       Аргумент обязателен: угаданный кластер даёт молча неверный ответ, а не приблизительный.
 *
 * Флаги:
 *   --declaration <путь>  другой файл декларации (по умолчанию ./declaration.ts) — нужен пруф-фикстурам
 *   --out-dir <путь>      каталог артефактов (по умолчанию deploy/postgres/generated)
 *   --no-allowlist        не писать/не сверять org-allowlist артефакт
 *
 * Коды выхода: 0 — ок; 1 — расхождение (--check) либо ошибка ввода-вывода; 2 — декларация неполна.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  DeclarationGapError,
  collectGaps,
  generateOrgAllowlistSql,
  generateEnvLoginShellSql,
  generateEnvLoginVariableSql,
  generateEnvironmentVerifierSql,
  generateCatalogClosureVerifierSql,
  generatePreSessionGateVerifierSql,
  generateRelationWallRegistrySeedSql,
  generatePortContextCapabilitySeedSql,
  generatePortContextCapabilityVerifierSql,
  generatePrivilegesSql,
  generateLegacyRoleQuarantineSql,
  generateSharedRoleBaselineSql,
  generateSharedRoleVerifierSql,
  renderEnvSql,
  renderPortContextRuntimeEnv,
} from './generate.mjs';
import { assertNoUndeclaredRuntimeSurface, assertPatientCallsiteDoors } from './access-census.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const DEFAULT_DECLARATION = path.join(scriptDir, 'declaration.ts');
const DEFAULT_OUT_DIR = path.join(repoRoot, 'deploy', 'postgres', 'generated');

function parseArgs(argv) {
  const args = { flags: new Set(), values: new Map() };
  const knownFlags = new Set([
    'all',
    'check',
    'gaps',
    'census',
    'stdout',
    'no-allowlist',
    'port-context-only',
    'port-context-verify',
    'env-login-shells',
    'env-login-variables',
    'env-verify',
    'shared-role-baseline',
    'shared-role-verify',
    'catalog-closure-verify',
    'pre-session-gate-verify',
    'relation-wall-registry',
    'relation-wall-registry-seed-only',
    'target-access-only',
    'migration-owner-access',
  ]);
  const knownValues = new Set([
    'db',
    'out',
    'out-dir',
    'declaration',
    'env',
    'legacy-role-quarantine',
    'port-context-env',
    'port-context-value',
    'migration-owners',
  ]);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new Error(`неожиданный аргумент '${token}'`);
    const key = token.slice(2);
    const takesValue = knownValues.has(key);
    if (!takesValue && !knownFlags.has(key)) throw new Error(`неизвестный флаг '--${key}'`);
    if (takesValue) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--'))
        throw new Error(`--${key} требует значение`);
      args.values.set(key, value);
      i += 1;
    } else {
      args.flags.add(key);
    }
  }
  return args;
}

async function loadDeclaration(declarationPath) {
  const module = await import(pathToFileURL(path.resolve(declarationPath)).href);
  const declaration = module.declaration ?? module.default;
  if (!declaration?.cluster?.roles || !declaration?.databases) {
    throw new Error(`${declarationPath}: экспорт 'declaration' не похож на PrivilegeDeclaration`);
  }
  return declaration;
}

function artifactPaths(outDir, dbName) {
  return {
    privileges: path.join(outDir, `privileges.${dbName}.sql`),
    allowlist: path.join(outDir, `org-allowlist.${dbName}.sql`),
    portContext: path.join(outDir, `port-context-capabilities.${dbName}.sql`),
  };
}

function buildArtifacts(declaration, dbName, withAllowlist, source, portContextOnly = false) {
  if (portContextOnly) {
    return [
      { kind: 'portContext', text: generatePortContextCapabilitySeedSql(declaration, dbName) },
    ];
  }
  const artifacts = [
    { kind: 'privileges', text: generatePrivilegesSql(declaration, dbName, { source }) },
  ];
  if (withAllowlist) {
    artifacts.push({
      kind: 'allowlist',
      text: generateOrgAllowlistSql(declaration, dbName, { source }),
    });
  }
  return artifacts;
}

/** Короткий построчный дифф — достаточный, чтобы понять расхождение в ревью. */
function firstDifference(expected, actual) {
  const a = expected.split('\n');
  const b = actual.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) {
      return (
        `строка ${i + 1}:\n  закоммичено: ${JSON.stringify(a[i] ?? '<конец файла>')}\n` +
        `  сгенерировано: ${JSON.stringify(b[i] ?? '<конец файла>')}`
      );
    }
  }
  return 'файлы различаются только длиной';
}

function reportGaps(declaration, dbNames) {
  let total = 0;
  for (const dbName of dbNames) {
    const gaps = collectGaps(declaration, dbName);
    const tables = Object.values(declaration.databases[dbName]?.tables ?? {});
    const access = tables.reduce((counts, table) => {
      const key = table.access?.kind ?? 'missing';
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {});
    const active = tables.filter((table) => table.disposition === 'ACTIVE').length;
    const pending = tables.filter((table) => table.disposition === 'PENDING_REMOVAL').length;
    const directEntries = tables.reduce(
      (count, table) =>
        count + (table.access?.kind === 'direct' ? Object.keys(table.grants ?? {}).length : 0),
      0,
    );
    total += gaps.length;
    console.log(
      `\n=== ${dbName}: classified=${tables.length} active=${active} pending=${pending} access=${JSON.stringify(access)} directGrantEntries=${directEntries} unresolved=${access.unresolved ?? 0} gaps=${gaps.length} ===`,
    );
    for (const gap of gaps) console.log(`  • ${gap.site}: ${gap.reason}`);
  }
  return total;
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

/**
 * Migration validation may need an ACL that a subsequent declaration reconcile would provide to
 * a newly introduced DDL owner. This deliberately renders only declared `app` schema usage/create
 * access: it is not a target-access reconcile and cannot widen table, function, role, or runtime
 * login privileges. CREATE is transaction-scoped by the owner-ordered runner.
 */
function generateMigrationOwnerAccessSql(declaration, dbName, ownerList) {
  const database = declaration.databases[dbName];
  const appUsage = database?.schemas?.app?.usage;
  const creators = database?.creators;
  if (!Array.isArray(appUsage))
    throw new Error(`${dbName}: declaration has no app schema usage list`);
  if (!Array.isArray(creators))
    throw new Error(`${dbName}: declaration has no migration creator list`);
  const declaredRoles = new Set(Object.keys(declaration.cluster.roles));
  const owners = [...new Set(ownerList.split(',').filter(Boolean))];
  if (owners.length === 0) throw new Error('--migration-owners must name at least one owner');
  for (const owner of owners) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(owner) || !declaredRoles.has(owner)) {
      throw new Error(`undeclared migration owner '${owner}'`);
    }
    if (!appUsage.includes(owner)) {
      throw new Error(`${dbName}: migration owner '${owner}' lacks declared app schema usage`);
    }
    if (!creators.includes(owner)) {
      throw new Error(
        `${dbName}: migration owner '${owner}' lacks declared migration creator authority`,
      );
    }
  }
  return [
    '-- transaction-scoped migration owner access from the canonical declaration',
    `GRANT CREATE, USAGE ON SCHEMA "app" TO ${owners.map(quoteIdentifier).join(', ')};`,
    '',
  ].join('\n');
}

/**
 * Кластерные примитивы обязаны знать ЦЕЛЕВОЙ КЛАСТЕР. Имя базы здесь не выбирает объекты — оно лишь
 * называет кластер, которому база принадлежит; ролевой слой один на кластер. Пока кластер был один,
 * умолчание «все объявленные роли» совпадало с истиной. Второй кластер сделал это умолчание молча
 * неверным сразу для обоих, поэтому его нет: вызывающий, который не может назвать базу, не может и
 * применить результат.
 */
function requireClusterDb(args, flag) {
  const db = args.values.get('db');
  if (!db) {
    throw new Error(
      `${flag} требует --db <база целевого кластера>: ролевой слой кластерный, ` +
        'и без имени базы кластер не определён. Передайте ту же базу, к которой идёт reconcile.',
    );
  }
  return db;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const declarationPath = args.values.get('declaration') ?? DEFAULT_DECLARATION;
  const outDir = args.values.get('out-dir') ?? DEFAULT_OUT_DIR;
  const withAllowlist = !args.flags.has('no-allowlist');
  const portContextOnly = args.flags.has('port-context-only');
  const declaration = await loadDeclaration(declarationPath);
  const source = path.relative(repoRoot, path.resolve(declarationPath));
  const allDbs = Object.keys(declaration.databases).sort();
  const dbNames = args.values.has('db') ? [args.values.get('db')] : allDbs;

  if (args.flags.has('target-access-only')) {
    if (dbNames.length !== 1 || !args.values.has('db')) {
      throw new Error('--target-access-only requires exactly one --db');
    }
    process.stdout.write(
      generatePrivilegesSql(declaration, dbNames[0], {
        source: path.relative(repoRoot, path.resolve(declarationPath)),
        includeClusterState: false,
      }),
    );
    return;
  }

  if (args.flags.has('migration-owner-access')) {
    if (dbNames.length !== 1 || !args.values.has('db') || !args.values.has('migration-owners')) {
      throw new Error('--migration-owner-access requires exactly one --db and --migration-owners');
    }
    process.stdout.write(
      generateMigrationOwnerAccessSql(declaration, dbNames[0], args.values.get('migration-owners')),
    );
    return;
  }

  if (args.flags.has('shared-role-baseline')) {
    if (args.values.has('env')) {
      throw new Error('--shared-role-baseline is cluster-wide and rejects --env');
    }
    // `--db` НЕ выбирает базу (ролевой слой кластерный) — он называет ЦЕЛЕВОЙ КЛАСТЕР: роли,
    // объявленные только для чужой среды (мигратор соседа), в него не попадают.
    // ОБЯЗАТЕЛЕН. Раньше он был необязательным и без него раскладывалось надмножество всех
    // объявленных ролей — пока кластер был один, это было безобидно. С появлением второго
    // кластера умолчание стало молча неверным для ЛЮБОГО из них, а парный `--shared-role-verify`
    // на том же надмножестве падает на чужой роли, которой в этом кластере нет и быть не должно.
    // Отказ вместо умолчания: у вызывающего имя базы всегда под рукой, а угадать кластер нельзя.
    requireClusterDb(args, '--shared-role-baseline');
    process.stdout.write(
      generateSharedRoleBaselineSql(declaration, args.values.get('db')),
    );
    return;
  }

  if (args.values.has('legacy-role-quarantine')) {
    if (args.values.has('db') || args.values.has('env')) {
      throw new Error('--legacy-role-quarantine is cluster-wide and rejects --db/--env');
    }
    process.stdout.write(
      generateLegacyRoleQuarantineSql(declaration, {
        only: [args.values.get('legacy-role-quarantine')],
      }),
    );
    return;
  }

  if (args.flags.has('shared-role-verify')) {
    if (args.values.has('env')) {
      throw new Error('--shared-role-verify is cluster-wide and rejects --env');
    }
    // То же значение `--db`, что у `--shared-role-baseline`: имя ЦЕЛЕВОГО КЛАСТЕРА, а не выбор
    // объектов базы, и так же обязательное. Здесь цена умолчания выше всего: сверка требует
    // СУЩЕСТВОВАНИЯ каждой ожидаемой роли и вылетает исключением на первой чужой — то есть
    // надмножество не «немного лишнего», а гарантированный отказ деплоя в исправном кластере.
    requireClusterDb(args, '--shared-role-verify');
    process.stdout.write(
      generateSharedRoleVerifierSql(declaration, args.values.get('db')),
    );
    return;
  }

  if (args.flags.has('port-context-verify')) {
    if (dbNames.length !== 1) throw new Error('--port-context-verify требует --db');
    process.stdout.write(generatePortContextCapabilityVerifierSql(declaration, dbNames[0]));
    return;
  }

  if (args.flags.has('catalog-closure-verify')) {
    if (dbNames.length !== 1) throw new Error('--catalog-closure-verify требует --db');
    process.stdout.write(generateCatalogClosureVerifierSql(declaration, dbNames[0]));
    return;
  }

  if (args.flags.has('pre-session-gate-verify')) {
    if (dbNames.length !== 1) throw new Error('--pre-session-gate-verify требует --db');
    process.stdout.write(generatePreSessionGateVerifierSql(declaration, dbNames[0]));
    return;
  }

  if (args.flags.has('relation-wall-registry')) {
    if (dbNames.length !== 1 || !args.values.has('db'))
      throw new Error('--relation-wall-registry requires --db');
    process.stdout.write(generateRelationWallRegistrySeedSql(declaration, dbNames[0]));
    return;
  }

  if (args.flags.has('relation-wall-registry-seed-only')) {
    if (dbNames.length !== 1 || !args.values.has('db')) {
      throw new Error('--relation-wall-registry-seed-only requires --db');
    }
    process.stdout.write(
      generateRelationWallRegistrySeedSql(declaration, dbNames[0], { reconcileOwners: false }),
    );
    return;
  }

  if (args.flags.has('gaps')) {
    const total = reportGaps(declaration, dbNames);
    process.exit(total === 0 ? 0 : 2);
  }

  if (args.flags.has('census')) {
    for (const dbName of dbNames) {
      const result = assertNoUndeclaredRuntimeSurface(declaration, dbName);
      const principals = assertPatientCallsiteDoors(declaration, dbName);
      const active = Object.values(declaration.databases[dbName].tables).filter(
        (table) => table.disposition === 'ACTIVE',
      ).length;
      console.log(
        `ok ${dbName}: production source census checked ${active} ACTIVE relations across ${result.files} source files`,
      );
      console.log(
        `ok ${dbName}: ${principals.patientOnlyModules} patient-only modules reach only the` +
          ` ${principals.relationsWithPatientDoor} relations that have a patient door`,
      );
    }
    return;
  }

  if (args.values.has('env')) {
    const env = args.values.get('env');
    if (!args.values.has('db')) throw new Error('--env требует --db');
    if (args.flags.has('env-login-shells')) {
      process.stdout.write(generateEnvLoginShellSql(declaration, env, args.values.get('db')));
      return;
    }
    if (args.flags.has('env-login-variables')) {
      process.stdout.write(generateEnvLoginVariableSql(declaration, env, args.values.get('db')));
      return;
    }
    if (args.flags.has('env-verify')) {
      process.stdout.write(generateEnvironmentVerifierSql(declaration, env, args.values.get('db')));
      return;
    }
    // Чистое значение, без обёртки KEY='...'. Нужно тому, кто передаёт список контейнеру ПЕРЕМЕННОЙ,
    // а не дописывает строку в файл настроек: env-файл — это то, что человек заполняет один раз, и
    // автоматике там делать нечего. Обёрнутый вариант ниже оставлен для окружений, которые пока
    // читают его из файла.
    if (args.values.has('port-context-value')) {
      const rendered = renderPortContextRuntimeEnv(
        declaration,
        env,
        args.values.get('db'),
        args.values.get('port-context-value'),
      );
      process.stdout.write(rendered.value);
      return;
    }
    if (args.values.has('port-context-env')) {
      const rendered = renderPortContextRuntimeEnv(
        declaration,
        env,
        args.values.get('db'),
        args.values.get('port-context-env'),
      );
      process.stdout.write(`${rendered.key}='${rendered.value.replaceAll("'", `'"'"'`)}'\n`);
      return;
    }
    process.stdout.write(renderEnvSql(declaration, env, args.values.get('db')));
    return;
  }

  if (args.flags.has('check')) {
    let red = 0;
    for (const dbName of dbNames) {
      const paths = artifactPaths(outDir, dbName);
      for (const artifact of buildArtifacts(
        declaration,
        dbName,
        withAllowlist,
        source,
        portContextOnly,
      )) {
        const file = paths[artifact.kind];
        if (!fs.existsSync(file)) {
          console.error(
            `КРАСНЫЙ ${dbName}/${artifact.kind}: артефакт ${path.relative(repoRoot, file)} не закоммичен`,
          );
          red += 1;
          continue;
        }
        const committed = fs.readFileSync(file, 'utf8');
        if (committed === artifact.text) {
          console.log(
            `ok ${dbName}/${artifact.kind}: ${path.relative(repoRoot, file)} совпадает побайтно`,
          );
        } else {
          console.error(
            `КРАСНЫЙ ${dbName}/${artifact.kind}: ${path.relative(repoRoot, file)} разошёлся с декларацией`,
          );
          console.error(firstDifference(committed, artifact.text));
          red += 1;
        }
      }
    }
    if (red > 0) {
      console.error(`\n--check: расхождений ${red}. Перегенерируйте артефакт и закоммитьте.`);
      process.exit(1);
    }
    console.log('\n--check: артефакты соответствуют декларации побайтно.');
    return;
  }

  if (args.flags.has('stdout') || (args.values.has('out') && args.values.get('out') === '-')) {
    if (dbNames.length !== 1) throw new Error('--stdout требует ровно одну базу (--db)');
    process.stdout.write(
      portContextOnly
        ? generatePortContextCapabilitySeedSql(declaration, dbNames[0])
        : generatePrivilegesSql(declaration, dbNames[0], { source }),
    );
    return;
  }

  const explicitOut = args.values.get('out');
  if (explicitOut && dbNames.length !== 1) throw new Error('--out требует ровно одну базу (--db)');
  fs.mkdirSync(explicitOut ? path.dirname(path.resolve(explicitOut)) : outDir, { recursive: true });
  for (const dbName of dbNames) {
    const paths = artifactPaths(outDir, dbName);
    for (const artifact of buildArtifacts(
      declaration,
      dbName,
      withAllowlist,
      source,
      portContextOnly,
    )) {
      const file =
        explicitOut && ['privileges', 'portContext'].includes(artifact.kind)
          ? path.resolve(explicitOut)
          : paths[artifact.kind];
      if (explicitOut && !['privileges', 'portContext'].includes(artifact.kind)) continue;
      fs.writeFileSync(file, artifact.text, 'utf8');
      console.log(`записано: ${path.relative(repoRoot, file)} (${artifact.text.length} байт)`);
    }
  }
}

try {
  await main();
} catch (error) {
  if (error instanceof DeclarationGapError) {
    console.error(`generate-cli: ${error.message}`);
    process.exit(2);
  }
  console.error(`generate-cli: ${error instanceof Error ? error.message : 'unknown_error'}`);
  process.exit(1);
}
