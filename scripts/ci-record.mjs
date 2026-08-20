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
 *
 * Третье: ловить сдвиг постфактум — это терять час прогона. Поэтому на время шагов ветка сведения
 * ЗАМОРАЖИВАЕТСЯ: здесь ставится маркер `.git/bcb-feat-freeze`, а hook `tools/git-hooks/reference-transaction`
 * по его наличию отказывает в ЛЮБОМ обновлении feat — включая land с ORCH_LAND=1 и обычный commit.
 * Маркер снимается в finally, в том числе при падении и по SIGINT/SIGTERM: замороженная навсегда
 * ветка была бы хуже испорченного прогона. Владелец 20.08: «можно на время прогона закрыть его совсем».
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function head() {
  const shown = spawnSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  if (shown.status !== 0) throw new Error(`ci-record: git rev-parse HEAD отказал: ${shown.stderr}`);
  return shown.stdout.trim();
}

const freezeMarker = resolve(repoRoot, '.git/bcb-feat-freeze');

function freeze(sha) {
  writeFileSync(freezeMarker, `полный CI измеряет ${sha} (pid ${process.pid})\n`);
}

function thaw() {
  rmSync(freezeMarker, { force: true });
}

const startedAt = head();
freeze(startedAt);
// Обрыв прогона не должен оставлять ветку запертой: снимаем маркер и на сигналах тоже.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    thaw();
    process.exit(1);
  });
}

let steps;
try {
  steps = spawnSync('pnpm', ['run', 'ci:steps'], { cwd: repoRoot, stdio: 'inherit' });
} finally {
  thaw();
}
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
