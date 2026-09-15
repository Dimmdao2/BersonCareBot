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

// Контейнер исчезает между `ps` и `inspect` — обычное дело на выкатке. docker печатает строки по
// уцелевшим и выходит ненулевым кодом; до этой правки `set -e` съедал ВЕСЬ вывод, и
// `therapysto-status` терял список контейнеров целиком там, где прежний `docker ps` показал бы
// оставшиеся. Тест держит именно поведение: частичный ответ доходит, отказ живого демона — нет.
const runStatusWithDockerStub = (stubBody) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'therapysto-docker-stub-'));
  try {
    const stub = path.join(dir, 'docker');
    writeFileSync(stub, stubBody, { mode: 0o755 });
    return spawnSync('bash', [watchdogPath, '--status'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test('исчезнувший между ps и inspect контейнер не уносит с собой весь список', () => {
  const row = [
    'alive-id',
    '/therapysto-blue-webapp-1',
    '0',
    '2026-09-15T08:00:00.000000000Z',
    'unless-stopped',
    '0',
    'therapysto-app:fixture',
    'running',
  ].join('\t');

  // Уцелевших ДВА, а не один: с одной строкой тест проходил и тогда, когда частичный ответ
  // обрезался до первой — а это снова молча прячет проблемный контейнер, чего М-4.1 не допускает.
  const secondRow = [
    'alive-id-2',
    '/therapysto-blue-api-1',
    '3',
    '2026-09-15T08:00:01.000000000Z',
    'unless-stopped',
    '0',
    'therapysto-app:fixture',
    'running',
  ].join('\t');

  const partial = runStatusWithDockerStub(
    `#!/usr/bin/env bash
if [ "$1" = ps ]; then printf '%s\\n' alive-id gone-id alive-id-2; exit 0; fi
printf '%s\\n' "${row}" "${secondRow}"
echo 'Error: No such object: gone-id' >&2
exit 1
`,
  );
  assert.equal(partial.status, 0, partial.stderr);
  assert.match(partial.stdout, /therapysto-blue-webapp-1 {2}status=running {2}restarts=0/);
  assert.match(partial.stdout, /therapysto-blue-api-1 {2}status=running {2}restarts=3/);

  const daemonDown = runStatusWithDockerStub(
    `#!/usr/bin/env bash
if [ "$1" = ps ]; then printf '%s\\n' alive-id; exit 0; fi
echo 'Cannot connect to the Docker daemon' >&2
exit 1
`,
  );
  assert.notEqual(daemonDown.status, 0);
});
