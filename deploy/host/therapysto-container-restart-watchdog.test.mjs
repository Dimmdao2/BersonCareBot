import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const watchdogPath = fileURLToPath(
  new URL('./prod/therapysto-container-restart-watchdog', import.meta.url),
);

const snapshotRow = ({ id, name, restartCount }) =>
  [
    id,
    `/${name}`,
    restartCount,
    '2026-09-15T08:00:00.000000000Z',
    'unless-stopped',
    0,
    'therapysto-app:fixture',
    'running',
  ].join('\t');

const compareSnapshots = (previousRows, currentRows) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'therapysto-restarts-'));
  const previousPath = path.join(dir, 'previous.tsv');
  const currentPath = path.join(dir, 'current.tsv');
  try {
    writeFileSync(previousPath, `${previousRows.join('\n')}\n`);
    writeFileSync(currentPath, `${currentRows.join('\n')}\n`);
    const result = spawnSync(
      'bash',
      [watchdogPath, '--compare-snapshots', previousPath, currentPath],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim() === '' ? [] : result.stdout.trim().split('\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test('рост RestartCount того же контейнера сигналит, а замена контейнера начинает тихий baseline', () => {
  const sameContainerRestart = compareSnapshots(
    [snapshotRow({ id: 'same-id', name: 'therapysto-webapp-green-1', restartCount: 2 })],
    [snapshotRow({ id: 'same-id', name: 'therapysto-webapp-green-1', restartCount: 3 })],
  );
  assert.equal(sameContainerRestart.length, 1);

  const deploymentReplacement = compareSnapshots(
    [snapshotRow({ id: 'old-id', name: 'therapysto-webapp-green-1', restartCount: 7 })],
    [snapshotRow({ id: 'new-id', name: 'therapysto-webapp-green-1', restartCount: 0 })],
  );
  assert.deepEqual(deploymentReplacement, []);

  // Единственный случай, в котором сверка Id несёт нагрузку: у пришедшего на замену контейнера
  // счётчик ВЫШЕ, чем был у прежнего. Сравнение одних чисел здесь молчать не умеет — молчит только
  // различение Id. Без этой строки прежняя фикстура (7 → 0) проходила и при вырезанной сверке Id,
  // то есть главное требование М-4.3 оставалось непокрытым.
  const replacementWithHigherCount = compareSnapshots(
    [snapshotRow({ id: 'old-id', name: 'therapysto-webapp-green-1', restartCount: 0 })],
    [snapshotRow({ id: 'new-id', name: 'therapysto-webapp-green-1', restartCount: 2 })],
  );
  assert.deepEqual(replacementWithHigherCount, []);
});
