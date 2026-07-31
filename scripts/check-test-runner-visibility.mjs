#!/usr/bin/env node
// М4 (#1081): гейт «раннер видит каждый тест-файл».
//
// Зачем: до этого скрипта 22 файла apps/webapp/src/**/*.devDb.integration.test.ts не выбирались
// НИ ОДНИМ vitest-проектом — `vitest run <файл>` падал с «No test files found», и это было
// незамечено (docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md, блок М, п. М4). Канон уже требовал этого
// («zero-file или висячий include не считается зелёным», .cursor/rules/test-execution-policy.md,
// чек-лист аудитора п.4), проверки не было ни одной. Этот скрипт сравнивает список тест-файлов на
// диске со списком, который реально отдаёт `vitest list`, по каждому приложению, и падает на
// расхождении, не покрытом храповиком.
//
// Храповик — scripts/test-runner-visibility-known-invisible.json: ровно те пути, что были невидимы
// раннеру на дату снятия снимка. Список имеет право только СОКРАЩАТЬСЯ:
//   - новый невидимый файл, которого нет в храповике → FAIL (дыра выросла);
//   - запись храповика, чей файл уже удалён/перенесён → FAIL (запись протухла, список не обновили).
// Эти 22 файла (блок Б3) НЕ трогаются этим гейтом — гейт их не чинит, только не даёт добавить новые.
//
// М4 круг 2 (#1081, M4-4 слепого аудита): «список имеет право только сокращаться» был ТОЛЬКО этим
// комментарием — ничто не мешало дописать новый невидимый файл в 'apps' рядом с ним самим, и гейт
// зеленел. Файл теперь несёт второе поле 'frozenBaseline' — зафиксированный на дату среза состав.
// 'apps' обязан быть подмножеством 'frozenBaseline' для каждого приложения; любой путь в 'apps',
// которого нет в 'frozenBaseline', — FAIL, независимо от того, действительно ли он невидим раннеру
// сегодня. Ослабить список может только правка самого 'frozenBaseline' — а это отдельное поле,
// значит отдельный, видимый в дифф-ревью, hunk, а не строка, спрятанная внутри обычного 'apps'.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const knownInvisiblePath = join(repoRoot, 'scripts/test-runner-visibility-known-invisible.json');

const APPS = [
  { name: 'integrator', dir: 'apps/integrator', testRoots: ['src', 'e2e'] },
  { name: 'webapp', dir: 'apps/webapp', testRoots: ['src'] },
  { name: 'media-worker', dir: 'apps/media-worker', testRoots: ['src'] },
];

function loadKnownInvisible() {
  const raw = JSON.parse(readFileSync(knownInvisiblePath, 'utf8'));
  const apps = {};
  for (const [app, files] of Object.entries(raw.apps ?? {})) apps[app] = new Set(files);
  const frozenBaseline = {};
  for (const [app, files] of Object.entries(raw.frozenBaseline ?? {})) frozenBaseline[app] = new Set(files);
  return { asOf: raw.asOf, apps, frozenBaseline };
}

function listDiskTestFiles(appDirAbs, testRoots) {
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (/\.test\.tsx?$/.test(entry.name)) {
        files.push(relative(appDirAbs, abs).replaceAll('\\', '/'));
      }
    }
  };
  for (const root of testRoots) walk(join(appDirAbs, root));
  return files.sort();
}

function listRunnerFiles(appDirAbs) {
  const result = spawnSync('pnpm', ['exec', 'vitest', 'list', '--filesOnly'], {
    cwd: appDirAbs,
    encoding: 'utf8',
  });
  if (result.error) {
    throw new Error(`не удалось запустить vitest list в ${appDirAbs}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `vitest list вернул код ${result.status} в ${appDirAbs}:\n${result.stderr || result.stdout}`,
    );
  }
  const files = new Set();
  for (const rawLine of result.stdout.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^\[[^\]]+\]\s+(.+)$/);
    files.add((match ? match[1] : line).trim());
  }
  return files;
}

function checkApp(app, known) {
  const appDirAbs = join(repoRoot, app.dir);
  const disk = listDiskTestFiles(appDirAbs, app.testRoots);
  const diskSet = new Set(disk);
  const runner = listRunnerFiles(appDirAbs);
  const invisible = disk.filter((file) => !runner.has(file));
  const knownFiles = known.apps[app.name] ?? new Set();
  const baselineFiles = known.frozenBaseline[app.name] ?? new Set();

  const newInvisible = invisible.filter((file) => !knownFiles.has(file));
  const staleKnown = [...knownFiles].filter((file) => !diskSet.has(file));
  // M4 круг 2 (M4-4): рост храповика — путь, дописанный в 'apps', которого нет в зафиксированном
  // 'frozenBaseline'. Проверяется независимо от newInvisible/staleKnown выше: даже если файл
  // сегодня реально невидим раннеру, дописать его в исключения без правки frozenBaseline — FAIL.
  const ratchetGrowth = [...knownFiles].filter((file) => !baselineFiles.has(file));

  return { app: app.name, disk: disk.length, runner: runner.size, invisible, newInvisible, staleKnown, ratchetGrowth };
}

function printReport(results, known) {
  let failed = false;
  for (const r of results) {
    console.log(`check-test-runner-visibility: ${r.app}: диск=${r.disk} раннер=${r.runner} невидимых=${r.invisible.length}`);
    if (r.newInvisible.length > 0) {
      failed = true;
      console.error(`  НОВЫЙ невидимый файл (не в храповике ${knownInvisiblePath}, asOf=${known.asOf}):`);
      for (const f of r.newInvisible) console.error(`    - ${r.app}/${f}`);
      console.error('  Файл не выбирается ни одним vitest-проектом. Либо чини include/exclude, либо это');
      console.error('  осознанное исключение — тогда решение по нему принимает владелец плана блока Б3, не этот гейт.');
    }
    if (r.staleKnown.length > 0) {
      failed = true;
      console.error(`  ПРОТУХШАЯ запись храповика (файла больше нет на диске):`);
      for (const f of r.staleKnown) console.error(`    - ${r.app}/${f}`);
      console.error(`  Удали запись из ${knownInvisiblePath} — список имеет право только сокращаться.`);
    }
    if (r.ratchetGrowth.length > 0) {
      failed = true;
      console.error(`  РОСТ ХРАПОВИКА (запись в 'apps' отсутствует в 'frozenBaseline' ${knownInvisiblePath}):`);
      for (const f of r.ratchetGrowth) console.error(`    - ${r.app}/${f}`);
      console.error(`  'apps' обязан быть подмножеством 'frozenBaseline'. Если это осознанное новое`);
      console.error(`  исключение — правку принимает владелец плана блока М, и она обязана явно`);
      console.error(`  редактировать сам 'frozenBaseline', а не только 'apps'.`);
    }
  }
  return failed;
}

const known = loadKnownInvisible();
const results = APPS.map((app) => checkApp(app, known));
const failed = printReport(results, known);

if (failed) {
  console.error('check-test-runner-visibility: FAIL');
  process.exit(1);
}
console.log('check-test-runner-visibility: OK');
