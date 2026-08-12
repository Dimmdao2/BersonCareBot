#!/usr/bin/env node
/**
 * generate-cli.mjs — CLI генератора прав (SCHEME §B).
 *
 *   node deploy/postgres/privileges/generate-cli.mjs --db <база> [--out <файл>|--stdout]
 *   node deploy/postgres/privileges/generate-cli.mjs --all            # обе управляемые базы в generated/
 *   node deploy/postgres/privileges/generate-cli.mjs --check          # ГЕЙТ CI: перегенерировать и сверить
 *   node deploy/postgres/privileges/generate-cli.mjs --gaps           # перечислить пробелы декларации
 *   node deploy/postgres/privileges/generate-cli.mjs --env <env> --db <база>   # login-рендер (НЕ коммитится)
 *   node deploy/postgres/privileges/generate-cli.mjs --env <env> --db <база> --port-context-env <webapp|integrator>
 *   node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only # exact DB capability seeds
 *   node deploy/postgres/privileges/generate-cli.mjs --all --zero-state      # revoke-only per-DB artifacts
 *   node deploy/postgres/privileges/generate-cli.mjs --zero-state-cluster    # exact role-drop finalizer
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
  generatePortContextCapabilitySeedSql,
  generatePortContextCapabilityVerifierSql,
  generatePrivilegesSql,
  generateZeroStateClusterSql,
  generateZeroStateSql,
  renderEnvSql,
  renderPortContextRuntimeEnv,
} from './generate.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const DEFAULT_DECLARATION = path.join(scriptDir, 'declaration.ts');
const DEFAULT_OUT_DIR = path.join(repoRoot, 'deploy', 'postgres', 'generated');

function parseArgs(argv) {
  const args = { flags: new Set(), values: new Map() };
  const knownFlags = new Set([
    'all', 'check', 'gaps', 'stdout', 'no-allowlist', 'port-context-only',
    'port-context-verify', 'zero-state', 'zero-state-cluster',
  ]);
  const knownValues = new Set(['db', 'out', 'out-dir', 'declaration', 'env', 'port-context-env']);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new Error(`неожиданный аргумент '${token}'`);
    const key = token.slice(2);
    const takesValue = knownValues.has(key);
    if (!takesValue && !knownFlags.has(key)) throw new Error(`неизвестный флаг '--${key}'`);
    if (takesValue) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`--${key} требует значение`);
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
    zeroState: path.join(outDir, `zero-state.${dbName}.sql`),
  };
}

function buildArtifacts(declaration, dbName, withAllowlist, source, portContextOnly = false, zeroState = false) {
  if (zeroState) return [{ kind: 'zeroState', text: generateZeroStateSql(declaration, dbName, { source }) }];
  if (portContextOnly) {
    return [{ kind: 'portContext', text: generatePortContextCapabilitySeedSql(declaration, dbName) }];
  }
  const artifacts = [{ kind: 'privileges', text: generatePrivilegesSql(declaration, dbName, { source }) }];
  if (withAllowlist) {
    artifacts.push({ kind: 'allowlist', text: generateOrgAllowlistSql(declaration, dbName, { source }) });
  }
  return artifacts;
}

/** Короткий построчный дифф — достаточный, чтобы понять расхождение в ревью. */
function firstDifference(expected, actual) {
  const a = expected.split('\n');
  const b = actual.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) {
      return `строка ${i + 1}:\n  закоммичено: ${JSON.stringify(a[i] ?? '<конец файла>')}\n`
        + `  сгенерировано: ${JSON.stringify(b[i] ?? '<конец файла>')}`;
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
    const directEntries = tables.reduce((count, table) => count + (table.access?.kind === 'direct'
      ? Object.keys(table.grants ?? {}).length : 0), 0);
    total += gaps.length;
    console.log(`\n=== ${dbName}: classified=${tables.length} active=${active} pending=${pending} access=${JSON.stringify(access)} directGrantEntries=${directEntries} unresolved=${access.unresolved ?? 0} gaps=${gaps.length} ===`);
    for (const gap of gaps) console.log(`  • ${gap.site}: ${gap.reason}`);
  }
  return total;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const declarationPath = args.values.get('declaration') ?? DEFAULT_DECLARATION;
  const outDir = args.values.get('out-dir') ?? DEFAULT_OUT_DIR;
  const withAllowlist = !args.flags.has('no-allowlist');
  const portContextOnly = args.flags.has('port-context-only');
  const zeroState = args.flags.has('zero-state');
  const zeroStateCluster = args.flags.has('zero-state-cluster');
  if ([portContextOnly, zeroState, zeroStateCluster].filter(Boolean).length > 1) {
    throw new Error('--port-context-only, --zero-state and --zero-state-cluster are mutually exclusive');
  }
  const declaration = await loadDeclaration(declarationPath);
  const source = path.relative(repoRoot, path.resolve(declarationPath));
  const allDbs = Object.keys(declaration.databases).sort();
  const dbNames = args.values.has('db') ? [args.values.get('db')] : allDbs;

  if (zeroStateCluster) {
    if (args.values.has('db')) throw new Error('--zero-state-cluster is cluster-wide and rejects --db');
    const text = generateZeroStateClusterSql(declaration, { source });
    const file = args.values.has('out') ? path.resolve(args.values.get('out')) : path.join(outDir, 'zero-state.cluster.sql');
    if (args.flags.has('stdout') || args.values.get('out') === '-') { process.stdout.write(text); return; }
    if (args.flags.has('check')) {
      if (!fs.existsSync(file)) { console.error(`КРАСНЫЙ cluster/zeroState: артефакт ${path.relative(repoRoot, file)} не закоммичен`); process.exit(1); }
      const committed = fs.readFileSync(file, 'utf8');
      if (committed !== text) { console.error(`КРАСНЫЙ cluster/zeroState: ${path.relative(repoRoot, file)} разошёлся с декларацией`); console.error(firstDifference(committed, text)); process.exit(1); }
      console.log(`ok cluster/zeroState: ${path.relative(repoRoot, file)} совпадает побайтно`);
      return;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, 'utf8');
    console.log(`записано: ${path.relative(repoRoot, file)} (${text.length} байт)`);
    return;
  }

  if (args.flags.has('port-context-verify')) {
    if (dbNames.length !== 1) throw new Error('--port-context-verify требует --db');
    process.stdout.write(generatePortContextCapabilityVerifierSql(declaration, dbNames[0]));
    return;
  }

  if (args.flags.has('gaps')) {
    const total = reportGaps(declaration, dbNames);
    process.exit(total === 0 ? 0 : 2);
  }

  if (args.values.has('env')) {
    const env = args.values.get('env');
    if (!args.values.has('db')) throw new Error('--env требует --db');
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
      for (const artifact of buildArtifacts(declaration, dbName, withAllowlist, source, portContextOnly, zeroState)) {
        const file = paths[artifact.kind];
        if (!fs.existsSync(file)) {
          console.error(`КРАСНЫЙ ${dbName}/${artifact.kind}: артефакт ${path.relative(repoRoot, file)} не закоммичен`);
          red += 1;
          continue;
        }
        const committed = fs.readFileSync(file, 'utf8');
        if (committed === artifact.text) {
          console.log(`ok ${dbName}/${artifact.kind}: ${path.relative(repoRoot, file)} совпадает побайтно`);
        } else {
          console.error(`КРАСНЫЙ ${dbName}/${artifact.kind}: ${path.relative(repoRoot, file)} разошёлся с декларацией`);
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
    process.stdout.write(portContextOnly
      ? generatePortContextCapabilitySeedSql(declaration, dbNames[0])
      : zeroState
        ? generateZeroStateSql(declaration, dbNames[0], { source })
        : generatePrivilegesSql(declaration, dbNames[0], { source }));
    return;
  }

  const explicitOut = args.values.get('out');
  if (explicitOut && dbNames.length !== 1) throw new Error('--out требует ровно одну базу (--db)');
  fs.mkdirSync(explicitOut ? path.dirname(path.resolve(explicitOut)) : outDir, { recursive: true });
  for (const dbName of dbNames) {
    const paths = artifactPaths(outDir, dbName);
    for (const artifact of buildArtifacts(declaration, dbName, withAllowlist, source, portContextOnly, zeroState)) {
      const file = explicitOut && ['privileges', 'portContext', 'zeroState'].includes(artifact.kind)
        ? path.resolve(explicitOut)
        : paths[artifact.kind];
      if (explicitOut && !['privileges', 'portContext', 'zeroState'].includes(artifact.kind)) continue;
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
