#!/usr/bin/env node
/**
 * Полный CI обязан называться КОММИТОМ, а не временем: «CI зелёный» без sha — впечатление, а не факт
 * (docs/ORCHESTRATION_BINDINGS.md, «Полный CI гоняется В ЭТОМ дереве»). Раньше состав шагов висел прямо
 * в скрипте `ci`, поэтому код возврата и голова дерева нигде не оставались: прогон в фоне, потерянный
 * `$?` — и результат приходилось восстанавливать чтением лога. Здесь `ci` — обёртка: она запоминает
 * голову ДО и ПОСЛЕ, гоняет `ci:steps` и кладёт итог в `runs/ci-last.json`.
 *
 * Второй, более важный отказ: прогон измеряет ОДНО состояние репозитория. Если голова сдвинулась,
 * пока шли шаги, измеренного состояния больше нет — ни зелёный результат, ни красный ничего не
 * доказывают. Такой прогон завершается ненулевым кодом, как бы ни закончились сами шаги.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function head() {
  const shown = spawnSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  if (shown.status !== 0) throw new Error(`ci-record: git rev-parse HEAD отказал: ${shown.stderr}`);
  return shown.stdout.trim();
}

const startedAt = head();
const steps = spawnSync('pnpm', ['run', 'ci:steps'], { cwd: repoRoot, stdio: 'inherit' });
const finishedAt = head();
const moved = startedAt !== finishedAt;
const stepsExit = steps.status === null ? 1 : steps.status;
const exitCode = moved ? 1 : stepsExit;

mkdirSync(resolve(repoRoot, 'runs'), { recursive: true });
writeFileSync(
  resolve(repoRoot, 'runs/ci-last.json'),
  `${JSON.stringify({ sha: startedAt, headAfter: finishedAt, movedDuringRun: moved, stepsExit, exitCode }, null, 2)}\n`,
);

if (moved) {
  console.error(
    `ci-record: голова дерева сдвинулась во время прогона (${startedAt.slice(0, 9)} -> ${finishedAt.slice(0, 9)}).`
    + ` Шаги завершились с кодом ${stepsExit}, но измеренного состояния больше нет — результат не доказательство.`
    + ' Дождитесь конца сведения и прогоните заново.',
  );
} else {
  console.error(`ci-record: прогон измерил ${startedAt}, код возврата ${exitCode}. Итог: runs/ci-last.json`);
}
process.exit(exitCode);
