#!/usr/bin/env node
/**
 * generate-cli.mjs — CLI генератора прав (SCHEME §B).
 *
 *   node deploy/postgres/privileges/generate-cli.mjs --db <база> [--out <файл>|--stdout]
 *   node deploy/postgres/privileges/generate-cli.mjs --all            # обе управляемые базы в generated/
 *   node deploy/postgres/privileges/generate-cli.mjs --check          # ГЕЙТ CI: перегенерировать и сверить
 *   node deploy/postgres/privileges/generate-cli.mjs --gaps           # перечислить пробелы декларации
 *   node deploy/postgres/privileges/generate-cli.mjs --env <env> --db <база>   # login-рендер (НЕ коммитится)
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
  generatePrivilegesSql,
  renderEnvSql,
} from './generate.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const DEFAULT_DECLARATION = path.join(scriptDir, 'declaration.ts');
const DEFAULT_OUT_DIR = path.join(repoRoot, 'deploy', 'postgres', 'generated');

function parseArgs(argv) {
  const args = { flags: new Set(), values: new Map() };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new Error(`неожиданный аргумент '${token}'`);
    const key = token.slice(2);
    const takesValue = ['db', 'out', 'out-dir', 'declaration', 'env'].includes(key);
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
  };
}

function buildArtifacts(declaration, dbName, withAllowlist, source) {
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
    total += gaps.length;
    console.log(`\n=== ${dbName}: пробелов ${gaps.length} ===`);
    for (const gap of gaps) console.log(`  • ${gap.site}: ${gap.reason}`);
  }
  return total;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const declarationPath = args.values.get('declaration') ?? DEFAULT_DECLARATION;
  const outDir = args.values.get('out-dir') ?? DEFAULT_OUT_DIR;
  const withAllowlist = !args.flags.has('no-allowlist');
  const declaration = await loadDeclaration(declarationPath);
  const source = path.relative(repoRoot, path.resolve(declarationPath));
  const allDbs = Object.keys(declaration.databases).sort();
  const dbNames = args.values.has('db') ? [args.values.get('db')] : allDbs;

  if (args.flags.has('gaps')) {
    const total = reportGaps(declaration, dbNames);
    process.exit(total === 0 ? 0 : 2);
  }

  if (args.values.has('env')) {
    const env = args.values.get('env');
    if (!args.values.has('db')) throw new Error('--env требует --db');
    process.stdout.write(renderEnvSql(declaration, env, args.values.get('db')));
    return;
  }

  if (args.flags.has('check')) {
    let red = 0;
    for (const dbName of dbNames) {
      const paths = artifactPaths(outDir, dbName);
      for (const artifact of buildArtifacts(declaration, dbName, withAllowlist, source)) {
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
    process.stdout.write(generatePrivilegesSql(declaration, dbNames[0], { source }));
    return;
  }

  const explicitOut = args.values.get('out');
  if (explicitOut && dbNames.length !== 1) throw new Error('--out требует ровно одну базу (--db)');
  fs.mkdirSync(explicitOut ? path.dirname(path.resolve(explicitOut)) : outDir, { recursive: true });
  for (const dbName of dbNames) {
    const paths = artifactPaths(outDir, dbName);
    for (const artifact of buildArtifacts(declaration, dbName, withAllowlist, source)) {
      const file = explicitOut && artifact.kind === 'privileges'
        ? path.resolve(explicitOut)
        : paths[artifact.kind];
      if (explicitOut && artifact.kind !== 'privileges') continue;
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
