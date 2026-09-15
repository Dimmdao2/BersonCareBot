import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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
  isOurBackgroundJobFile,
  loadManifest,
  parseCronDFile,
  planCronArtifacts,
  planInstalledScheduleChanges,
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
  // Порция уборки медиа — 50 (14.09.2026, вместе с разрежением ритма до пяти минут): пропускная
  // способность равна «порция × число запусков», и прежние 25 при новом ритме означали бы впятеро
  // более медленную уборку.
  assert.ok(assignments.includes("BCB_JOB_QUERY='limit=50'"));
  assert.ok(assignments.includes("BCB_JOB_ENV_FILE='/etc/therapysto/env/webapp.prod'"));
  assert.ok(assignments.some((line) => /^BCB_JOB_TIMEOUT='\d+'$/.test(line)));
  assert.ok(assignments.includes("BCB_JOB_ACCEPT_STATUSES='200'"));

  const gated = describeJobAssignments(manifest, 'prod', 'media_transcode_reconcile');
  assert.ok(gated.includes("BCB_JOB_ACCEPT_STATUSES='200 503'"));
  assert.ok(gated.includes('BCB_JOB_BODY=\'{"limit":50}\''));
});

test('ни один artifact не копирует Host/Origin/секрет и не глушит вывод в /dev/null', () => {
  for (const item of plan) {
    assert.doesNotMatch(item.content, /\/dev\/null/, item.fileName);
    const scheduleRows = parseCronDFile(item.content);
    assert.equal(scheduleRows.length, 1, item.fileName);
    assert.doesNotMatch(scheduleRows[0], /Host:|Origin:|Authorization|INTERNAL_JOB_SECRET|curl/, item.fileName);
    assert.equal(scheduleRows[0], expectedCronRow(item));
  }
});

/*
 * Присваивания окружения в cron-файле — единственное место, куда что-то могло бы просочиться мимо
 * проверки выше: `parseCronDFile` их намеренно не читает как расписание. Поэтому они проверяются
 * отдельно и по белому списку: у HTTP-заданий их нет вовсе, у бэкапа — ровно четыре известных
 * ключа, и ни в одном нет ни секрета, ни подстановки, которую исполнил бы шелл.
 */
test('присваивания окружения есть только у бэкапа и только четыре известных', () => {
  const allowed = new Set([
    'BERSONCAREBOT_BACKUP_EXPECT_HOSTNAME',
    'BERSONCAREBOT_BACKUP_EXPECT_IPV4',
    'BERSONCAREBOT_BACKUP_DATABASE',
  ]);

  for (const item of plan) {
    const assignments = item.content
      .split('\n')
      .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line.trim()))
      .map((line) => line.trim());

    if (item.usesInternalJobRunner) {
      assert.deepEqual(assignments, [], item.fileName);
      continue;
    }

    assert.equal(assignments.length, allowed.size, item.fileName);
    for (const assignment of assignments) {
      const [key, value] = assignment.split('=', 2);
      assert.ok(allowed.has(key), `${item.fileName}: неожиданный ключ ${key}`);
      assert.doesNotMatch(value, /[$`'"\\]/, `${item.fileName}: подстановка в ${key}`);
      assert.doesNotMatch(assignment, /SECRET|PASSWORD|postgres:\/\//, item.fileName);
    }
  }
});

/*
 * Бэкап — единственное задание расписания, которое общий transport вебаппа НЕ будит. Три вещи,
 * которые из этого следуют и которые легко потерять при следующей правке: строка зовёт сам скрипт,
 * `--describe` отказывается выдавать его за HTTP-тик, и снятый бэкап всё равно опознаётся как наш
 * (иначе деплой перестал бы его снимать, а сверка продолжала бы считать лишним — вечно красно).
 */
test('бэкап ходит мимо общего transport, но снимается тем же деплоем', () => {
  const backups = prodPlan.filter((item) => !item.usesInternalJobRunner);
  assert.ok(backups.length >= 4, 'в плане прода нет заданий бэкапа');

  for (const item of backups) {
    // Скриптов бэкапа стало три: срез базы, хранилище сертификатов нового края (Caddy) и отправка
    // готовых артефактов на отдельный сервер. Список остаётся ЗАКРЫТЫМ — произвольная команда мимо
    // общего transport по-прежнему красная.
    assert.match(
      item.command,
      /^\/opt\/backups\/scripts\/(postgres-backup\.sh (hourly|daily|weekly|prune)|caddy-store-backup\.sh|offsite-push\.sh)$/,
    );
    assert.doesNotMatch(item.command, /run-internal-job\.sh/);
    assert.throws(() => describeJobAssignments(manifest, 'prod', item.jobId), /not an HTTP tick/);
    assert.ok(isOurBackgroundJobFile(item.artifactName, item.content), item.artifactName);
  }
});

/*
 * Отсутствие общего transport — беда только тех заданий, которые он будит. Пока проверка смотрела
 * на первое задание плана, отсутствующий `run-internal-job.sh` объявил бы неустановимым и бэкап,
 * который его вообще не касается.
 */
test('отсутствующий transport не объявляет бэкап неустановимым', () => {
  const installed = new Map(
    prodPlan.map((item) => [item.artifactName, `# comment\n${expectedCronRow(item)}\n`]),
  );
  const problems = findInstalledScheduleProblems({
    plan,
    envId: 'prod',
    installed,
    runnerExists: false,
  });

  assert.equal(problems.length, 1, problems.join('; '));
  assert.match(problems[0], /run-internal-job\.sh/);
});

/*
 * `--apply-installed` — то, чем деплой ЧИНИТ расписание, а не жалуется на него (решение владельца
 * 14.09.2026: «надо сделать так, чтобы деплой удалял всё лишнее, устанавливал всё правильное»).
 * Набор держит три его обязательства — поставить недостающее, переписать изменившееся, снять
 * снятое — и одно запрещение: не трогать ничего чужого.
 */

test('--apply-installed ставит недостающее, переписывает изменившееся и снимает снятое', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bcb-cron-apply-'));
  try {
    const required = prodPlan.find((item) => item.required);
    // Устаревшая строка того же задания: обязана быть переписана, а не оставлена как есть.
    writeFileSync(
      path.join(dir, required.artifactName),
      '# stale\n0 0 31 2 * root /nonexistent/run-internal-job.sh prod whatever\n',
    );
    // Снятое задание: в manifest его нет, но по имени и содержимому оно наше.
    writeFileSync(
      path.join(dir, 'therapysto-media-preview'),
      '# id=media_preview\n* * * * * root /opt/therapysto/src/deploy/host/run-internal-job.sh prod media_preview\n',
    );
    // Чужая строка: её не должно коснуться ничто.
    writeFileSync(path.join(dir, 'certbot'), '0 3 * * * root certbot renew\n');

    const applied = runCli(['--apply-installed', '--env', 'prod', '--cron-dir', dir]);
    assert.equal(applied.status, 0, applied.stderr);

    for (const item of prodPlan) {
      assert.ok(existsSync(path.join(dir, item.artifactName)), `не установлено: ${item.artifactName}`);
    }
    assert.equal(existsSync(path.join(dir, 'therapysto-media-preview')), false, 'снятое задание осталось');
    assert.equal(readFileSync(path.join(dir, 'certbot'), 'utf8'), '0 3 * * * root certbot renew\n');

    // После применения сверка обязана быть зелёной: иначе «починили» ничего не значит.
    const verified = runCli(['--verify-installed', '--env', 'prod', '--cron-dir', dir]);
    assert.equal(verified.status, 0, verified.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--apply-installed на совпадающем расписании ничего не трогает', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bcb-cron-idem-'));
  try {
    runCli(['--apply-installed', '--env', 'prod', '--cron-dir', dir]);
    const before = readdirSync(dir).map((name) => [name, readFileSync(path.join(dir, name), 'utf8')]);

    const again = runCli(['--apply-installed', '--env', 'prod', '--cron-dir', dir]);
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /уже совпадает/);

    const after = readdirSync(dir).map((name) => [name, readFileSync(path.join(dir, name), 'utf8')]);
    assert.deepEqual(after, before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('снимается только своё: чужие файлы и соседняя среда лишними не считаются', () => {
  const neighbour = plan.find((item) => item.envId === 'test');
  const installed = new Map([
    // Чужой файл с нашим префиксом, но без признаков нашего задания внутри.
    ['therapysto-backup-rsync', '0 2 * * * root /usr/local/sbin/rsync-backup\n'],
    // Задание СОСЕДНЕЙ среды: на общем боксе рядом живут TEST и остатки старого прода.
    [neighbour.artifactName, `# fixture\n${expectedCronRow(neighbour)}\n`],
    ['certbot', '0 3 * * * root certbot renew\n'],
  ]);
  for (const item of prodPlan) {
    installed.set(item.artifactName, `# fixture\n${expectedCronRow(item)}\n`);
  }

  const { write, remove } = planInstalledScheduleChanges({ plan, envId: 'prod', installed });

  assert.deepEqual(write, []);
  assert.deepEqual(remove, []);
});
