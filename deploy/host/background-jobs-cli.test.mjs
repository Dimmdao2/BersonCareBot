import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  describeJobAssignments,
  expectedCronRow,
  findArtifactProblems,
  findInstalledScheduleProblems,
  loadManifest,
  planCronArtifacts,
} from './background-jobs-cli.mjs';

const cliPath = fileURLToPath(new URL('./background-jobs-cli.mjs', import.meta.url));
const manifest = await loadManifest();
const plan = planCronArtifacts(manifest);
const prodPlan = plan.filter((item) => item.envId === 'prod');

const runCli = (args) =>
  spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8' });

const installedFixture = (items) =>
  new Map(items.map((item) => [item.artifactName, `# fixture\n${expectedCronRow(item)}\n`]));

test('поставляемые artifacts совпадают с manifest (иначе host получает вчерашнее расписание)', () => {
  const result = runCli(['--check']);
  assert.equal(result.status, 0, result.stderr);
});

test('встроенные фикстуры гейта проходят', () => {
  const result = runCli(['--self-test']);
  assert.equal(result.status, 0, result.stderr);
});

test('удалённый или отредактированный руками artifact краснит гейт', () => {
  const files = new Map(plan.map((item) => [item.fileName, item.content]));
  assert.deepEqual(findArtifactProblems(plan, files), []);

  const withoutOne = new Map(files);
  withoutOne.delete(plan[0].fileName);
  assert.equal(findArtifactProblems(plan, withoutOne).length, 1);

  const handEdited = new Map(files);
  handEdited.set(
    plan[0].fileName,
    plan[0].content.replace('run-internal-job.sh', 'curl -H "Host: bersoncare.ru"'),
  );
  assert.equal(findArtifactProblems(plan, handEdited).length, 1);
});

test('artifact без записи в manifest краснит гейт', () => {
  const files = new Map(plan.map((item) => [item.fileName, item.content]));
  files.set('bersoncarebot-forgotten.cron.template', '* * * * * root /bin/true\n');
  const problems = findArtifactProblems(plan, files);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /не имеет записи в manifest/);
});

test('обязательное задание без установленного расписания краснит deploy', () => {
  const installed = installedFixture(prodPlan);
  const required = prodPlan.find((item) => item.required);
  installed.delete(required.artifactName);

  const problems = findInstalledScheduleProblems({
    plan,
    envId: 'prod',
    installed,
    runnerExists: true,
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /не установлено/);
});

test('установленная строка мимо общего transport краснит deploy', () => {
  const installed = installedFixture(prodPlan);
  const required = prodPlan.find((item) => item.required);
  installed.set(
    required.artifactName,
    '*/5 * * * * root bash -lc \'curl -fsS -X POST -H "Authorization: Bearer $INTERNAL_JOB_SECRET" "http://127.0.0.1:6200/api/internal/operator-health-critical/tick" >/dev/null\'\n',
  );

  const problems = findInstalledScheduleProblems({
    plan,
    envId: 'prod',
    installed,
    runnerExists: true,
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /разошлось с manifest/);
});

test('установленное фоновое задание без записи в manifest краснит deploy', () => {
  const installed = installedFixture(prodPlan);
  installed.set(
    'bersoncarebot-ghost-tick',
    '* * * * * root curl -fsS -X POST http://127.0.0.1:6200/api/internal/ghost/tick\n',
  );

  const problems = findInstalledScheduleProblems({
    plan,
    envId: 'prod',
    installed,
    runnerExists: true,
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /нет записи в manifest/);
});

test('расписание TEST не считается лишним при проверке PROD и наоборот', () => {
  const testPlan = plan.filter((item) => item.envId === 'test');
  const installed = new Map([...installedFixture(prodPlan), ...installedFixture(testPlan)]);

  assert.deepEqual(
    findInstalledScheduleProblems({ plan, envId: 'prod', installed, runnerExists: true }),
    [],
  );
  assert.deepEqual(
    findInstalledScheduleProblems({ plan, envId: 'test', installed, runnerExists: true }),
    [],
  );
});

test('отсутствующий transport краснит deploy: задание нечем установить', () => {
  const problems = findInstalledScheduleProblems({
    plan,
    envId: 'prod',
    installed: installedFixture(prodPlan),
    runnerExists: false,
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /transport/);
});

test('--verify-installed читает реальный каталог расписания и отвечает кодом выхода', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bcb-cron-'));
  try {
    for (const item of prodPlan) {
      writeFileSync(path.join(dir, item.artifactName), `# fixture\n${expectedCronRow(item)}\n`);
    }
    const ok = runCli(['--verify-installed', '--env', 'prod', '--cron-dir', dir]);
    assert.equal(ok.status, 0, ok.stderr);

    rmSync(path.join(dir, prodPlan.find((item) => item.required).artifactName));
    const red = runCli(['--verify-installed', '--env', 'prod', '--cron-dir', dir]);
    assert.equal(red.status, 1);
    assert.match(red.stderr, /не установлено/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('нечитаемый каталог расписания — громкий отказ, а не «всё установлено»', () => {
  const result = runCli([
    '--verify-installed',
    '--env',
    'prod',
    '--cron-dir',
    path.join(tmpdir(), 'bcb-cron-does-not-exist'),
  ]);
  assert.equal(result.status, 1);
});

test('transport отказывается запускать задание, которым владеет резидентный scheduler', () => {
  assert.throws(
    () => describeJobAssignments(manifest, 'prod', 'operator_health.digest.daily'),
    /owned by resident_scheduler/,
  );
  assert.throws(() => describeJobAssignments(manifest, 'prod', 'no_such_job'), /unknown background job/);
  assert.throws(() => describeJobAssignments(manifest, 'staging', 'media_purge'), /unknown background job environment/);
});

test('описание задания для transport несёт маршрут, timeout и допустимые статусы', () => {
  const assignments = describeJobAssignments(manifest, 'prod', 'media_purge');
  assert.ok(assignments.includes("BCB_JOB_PATH='/api/internal/media-pending-delete/purge'"));
  assert.ok(assignments.includes("BCB_JOB_QUERY='limit=25'"));
  assert.ok(assignments.includes("BCB_JOB_ENV_FILE='/opt/env/bersoncarebot/webapp.prod'"));
  assert.ok(assignments.some((line) => /^BCB_JOB_TIMEOUT='\d+'$/.test(line)));
  assert.ok(assignments.includes("BCB_JOB_ACCEPT_STATUSES='200'"));

  const gated = describeJobAssignments(manifest, 'prod', 'media_transcode_reconcile');
  assert.ok(gated.includes("BCB_JOB_ACCEPT_STATUSES='200 503'"));
  assert.ok(gated.includes('BCB_JOB_BODY=\'{"limit":50}\''));
});

test('ни один artifact не копирует Host/Origin/секрет и не глушит вывод в /dev/null', () => {
  for (const item of plan) {
    assert.doesNotMatch(item.content, /\/dev\/null/, item.fileName);
    const scheduleRows = item.content
      .split('\n')
      .filter((line) => line.trim() && !line.trim().startsWith('#'));
    assert.equal(scheduleRows.length, 1, item.fileName);
    assert.doesNotMatch(scheduleRows[0], /Host:|Origin:|Authorization|INTERNAL_JOB_SECRET|curl/, item.fileName);
    assert.equal(scheduleRows[0], expectedCronRow(item));
  }
});
