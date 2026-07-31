#!/usr/bin/env node
// М3 (#1081): Stryker как diff-scoped судья.
//
// Зачем: до этого скрипта в репозитории было два пилотных Stryker-конфига
// (apps/webapp/stryker.pilot.json, stryker.entitlements.json), мутирующих один-два файла целиком,
// и НИ ОДНОГО job — решение о Stryker-судье (30.07) было записано и не исполнено, потому что у него
// не появилось строки «чем это исполняется» (docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md, блок М,
// преамбула). Процентного порога нет по решению М5: критерий бинарный — новая строка решения в
// диффе, не убитая ни одним тестом, роняет job.
//
// Как это остаётся дешёвым: Stryker JS поддерживает `mutate` в формате `path:startLine-endLine`
// (мутационный range) — поэтому мы мутируем НЕ весь файл, а только пересечение изменённых в диффе
// строк с производственным кодом. Стоимость прогона растёт с размером ДИФФА, а не с размером файла.
//
// Скоуп сегодня — apps/webapp (там единственные существующие Stryker-конфиги и plugin). Если Stryker
// понадобится другому приложению, копировать эту машинерию 1:1, а не встраивать app-специфичные ветки
// сюда.

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const appDir = join(repoRoot, 'apps/webapp');
const appRel = 'apps/webapp';

// Тривиальные («arid») строки не мутируются вовсе — не потому что мутант нельзя убить, а потому что
// убитый/выживший мутант на них не говорит ничего о поведении (пустая строка, комментарий, импорт,
// одна закрывающая скобка, чистый console.*). Список — минимальный механический прокси, не полная
// Google-style классификация: он ловит ровно те случаи, что называет план («логи, тривиал»).
const ARID_LINE = new RegExp(
  [
    '^\\s*$', // пустая строка
    '^\\s*//', // однострочный комментарий
    '^\\s*/\\*', // начало блочного комментария
    '^\\s*\\*/?', // продолжение/конец блочного комментария (строки вида ` * текст` и ` */`)
    '^\\s*[{}();,]*\\s*$', // только скобки/пунктуация
    '^\\s*import\\b', // импорт
    '^\\s*export\\s+type\\b', // экспорт типа (форма, не поведение)
    '^\\s*export\\s*\\{', // реэкспорт списком
    '^\\s*console\\.(log|debug|info|warn|error)\\(.*\\)\\s*;?\\s*$', // чистый лог
  ].join('|'),
);

function sh(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (result.error) throw result.error;
  return result;
}

function changedFiles(baseRef) {
  const result = sh('git', ['diff', '--name-only', '--diff-filter=ACMR', `${baseRef}...HEAD`, '--', `${appRel}/src`], {
    cwd: repoRoot,
  });
  if (result.status !== 0) throw new Error(`git diff --name-only failed: ${result.stderr}`);
  return result.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((f) => /\.tsx?$/.test(f))
    .filter((f) => !/\.test\.tsx?$/.test(f));
}

// Unified=0 diff hunks give exact new-file line ranges without context lines, so `+c,d` is exactly
// the set of lines added/changed by this diff — no need to reconcile context noise.
function changedLineRanges(baseRef, fileRel) {
  const result = sh('git', ['diff', '--unified=0', `${baseRef}...HEAD`, '--', fileRel], { cwd: repoRoot });
  if (result.status !== 0) throw new Error(`git diff --unified=0 failed for ${fileRel}: ${result.stderr}`);
  const ranges = [];
  for (const line of result.stdout.split('\n')) {
    const match = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (!match) continue;
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    if (count === 0) continue; // pure deletion, nothing new to mutate
    ranges.push([start, start + count - 1]);
  }
  return ranges;
}

function nonAridSubRanges(fileAbs, [start, end]) {
  const lines = readFileSync(fileAbs, 'utf8').split('\n');
  const ranges = [];
  let open = null;
  for (let lineNo = start; lineNo <= end; lineNo++) {
    const text = lines[lineNo - 1] ?? '';
    if (ARID_LINE.test(text)) {
      if (open) {
        ranges.push([open, lineNo - 1]);
        open = null;
      }
    } else if (!open) {
      open = lineNo;
    }
  }
  if (open) ranges.push([open, end]);
  return ranges;
}

function buildMutateTargets(baseRef, files) {
  const targets = [];
  const perFile = {};
  for (const fileRel of files) {
    const fileAbs = join(repoRoot, fileRel);
    const appRelPath = relative(appDir, fileAbs).replaceAll('\\', '/');
    const hunks = changedLineRanges(baseRef, fileRel);
    const subRanges = hunks.flatMap((hunk) => nonAridSubRanges(fileAbs, hunk));
    if (subRanges.length === 0) continue;
    perFile[appRelPath] = subRanges;
    for (const [s, e] of subRanges) targets.push(`${appRelPath}:${s}-${e}`);
  }
  return { targets, perFile };
}

// М3 круг 2 (#1081, M3-2 слепого аудита): на обычном `if (value === '')` (не тернарник, не составное
// выражение) гейт детерминированно писал Survived на мутанте, который тесты реально убивают (проверено
// вручную: мутант, применённый руками, красит тест). Корень найден трассировкой прогона: 6 мутантов
// одной строки, ПЕРВЫЙ убит верно, все следующие — Survived, хотя «Tests ran» называет верный тестовый
// файл. apps/webapp/vitest.config.ts держит `experimental.fsModuleCache: true` (персистентный на диск
// кэш трансформации модулей, node_modules/.experimental-vitest-cache) — он рассчитан на дев-цикл, где
// исходник между прогонами не меняется. Stryker переписывает файл в песочнице на каждый следующий
// мутант той же строки; кэш это не инвалидирует, и vitest читает уже неактуальную версию — мутация
// тестами физически не запускается, отсюда ложный Survived. Изолированно подтверждено: с
// `fsModuleCache: false` тот же прогон даёт 7/7 killed вместо 1/7. Гейт с ложным red учит игнорировать
// красный — это ровно «врал красным» из tests-check-behaviour-not-circumstances.mdc.
// Фикс — свой vitest-конфиг для гейта (generateStrykerVitestConfig), а не правка apps/webapp/vitest.config.ts:
// кэш даёт реальную пользу локальной разработке, ломает только повторные прогоны Stryker внутри одного
// файла — трогать его глобально ради одного гейта не нужно.
function generateStrykerVitestConfig(workDir) {
  const overridePath = join(workDir, 'vitest.stryker-nocache.generated.ts');
  const baseConfigPath = join(appDir, 'vitest.config.ts');
  writeFileSync(
    overridePath,
    [
      "import { defineConfig, mergeConfig } from 'vitest/config';",
      `import base from ${JSON.stringify(baseConfigPath)};`,
      '',
      'export default mergeConfig(base, defineConfig({',
      '  test: { experimental: { fsModuleCache: false } },',
      '}));',
      '',
    ].join('\n'),
  );
  return overridePath;
}

function runStryker(targets, reportPath, tempDir, workDir) {
  const config = {
    packageManager: 'pnpm',
    testRunner: 'vitest',
    plugins: ['@stryker-mutator/vitest-runner'],
    vitest: { configFile: generateStrykerVitestConfig(workDir) },
    mutate: targets,
    // Не копировать в песочницу то, что не нужно для прогона тестов — там же живут маскированные
    // .env.example (не секрет продукта, просто ускоряет copy).
    ignorePatterns: ['.env.example'],
    reporters: ['json', 'clear-text'],
    jsonReporter: { fileName: reportPath },
    tempDirName: tempDir,
    concurrency: 4,
    timeoutMS: 60_000,
    disableTypeChecks: true,
    coverageAnalysis: 'perTest',
  };
  const configPath = join(workDir, 'stryker.diff-scoped.generated.json');
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  const result = sh('pnpm', ['exec', 'stryker', 'run', configPath], { cwd: appDir });
  return { result, configPath };
}

function notKilled(report) {
  const offenders = [];
  for (const [path, file] of Object.entries(report.files ?? {})) {
    for (const mutant of file.mutants ?? []) {
      if (mutant.status === 'Killed' || mutant.status === 'Timeout') continue;
      offenders.push({
        path,
        line: mutant.location.start.line,
        mutator: mutant.mutatorName,
        status: mutant.status,
        original: mutant.replacement !== undefined ? mutant.description ?? mutant.mutatorName : mutant.mutatorName,
      });
    }
  }
  return offenders;
}

function main() {
  const baseArgIndex = process.argv.indexOf('--base');
  const baseRef = baseArgIndex >= 0 ? process.argv[baseArgIndex + 1] : process.env.STRYKER_DIFF_BASE;
  if (!baseRef) {
    console.error('check-stryker-diff-scoped: нужна база сравнения: --base <ref> или STRYKER_DIFF_BASE=<ref>.');
    process.exit(2);
  }

  const files = changedFiles(baseRef);
  if (files.length === 0) {
    console.log(`check-stryker-diff-scoped: OK — в диффе ${baseRef}...HEAD нет изменённых файлов ${appRel}/src/**/*.ts(x).`);
    return;
  }

  const { targets, perFile } = buildMutateTargets(baseRef, files);
  if (targets.length === 0) {
    console.log(
      `check-stryker-diff-scoped: OK — изменённые строки во всех ${files.length} файле(ах) диффа тривиальны (arid) или не содержат мутируемого производственного кода.`,
    );
    return;
  }

  console.log(`check-stryker-diff-scoped: диапазоны мутации (${targets.length}):`);
  for (const target of targets) console.log(`  - ${target}`);

  const workDir = mkdtempSync(join(tmpdir(), 'stryker-diff-scoped-'));
  const reportPath = join(workDir, 'report.json');
  const tempDir = join(workDir, 'sandbox');
  try {
    const { result } = runStryker(targets, reportPath, tempDir, workDir);
    let report;
    try {
      report = JSON.parse(readFileSync(reportPath, 'utf8'));
    } catch {
      console.error('check-stryker-diff-scoped: Stryker не создал отчёт — сам прогон сломан.');
      console.error(result.stdout);
      console.error(result.stderr);
      process.exit(1);
      return;
    }
    const offenders = notKilled(report);
    if (offenders.length > 0) {
      console.error('check-stryker-diff-scoped: новая строка решения не убита ни одним тестом:');
      for (const o of offenders) {
        console.error(`  - ${o.path}:${o.line} [${o.mutator}] статус=${o.status}`);
      }
      console.error('check-stryker-diff-scoped: FAIL');
      process.exit(1);
    }
    const totalMutants = Object.values(report.files ?? {}).reduce((n, f) => n + (f.mutants?.length ?? 0), 0);
    console.log(`check-stryker-diff-scoped: OK — все ${totalMutants} мутант(а) на изменённых строках убиты.`);
    for (const [path, ranges] of Object.entries(perFile)) {
      console.log(`  - ${path}: ${ranges.map(([s, e]) => `${s}-${e}`).join(', ')}`);
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main();
