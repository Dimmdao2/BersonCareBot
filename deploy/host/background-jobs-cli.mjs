#!/usr/bin/env node
/**
 * background-jobs-cli.mjs — единственный вход к manifest обязательных фоновых заданий вебаппа.
 *
 * Источник истины: `apps/webapp/src/modules/operator-health/backgroundJobManifest.ts`
 * (этап 2 сводного аудита `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`).
 * Отсюда и только отсюда выводятся:
 *   • `deploy/host/cron.d/*.cron.template` — поставляемые host artifacts;
 *   • описание задания для общего transport `deploy/host/run-internal-job.sh`;
 *   • deploy-сверка manifest ⇄ artifacts ⇄ реально установленное расписание.
 *
 * Команды:
 *   --check                      сверить поставляемые artifacts с manifest (гейт CI и deploy)
 *   --write                      перегенерировать artifacts
 *   --list [--env <prod|test>]   перечислить задания
 *   --describe --env E --job ID  KEY=value описание задания для transport
 *   --verify-installed --env E [--cron-dir DIR]
 *                                сверить manifest с реально установленным расписанием
 *   --self-test                  фикстуры чистых функций (без хоста и без записи)
 *
 * Коды выхода: 0 — ок; 1 — расхождение либо ошибка ввода-вывода.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');
const MANIFEST_PATH = path.join(
  repoRoot,
  'apps/webapp/src/modules/operator-health/backgroundJobManifest.ts',
);
const CRON_TEMPLATE_DIR = path.join(repoRoot, 'deploy/host/cron.d');
const TEMPLATE_SUFFIX = '.cron.template';
const DEFAULT_INSTALLED_CRON_DIR = '/etc/cron.d';
const MANIFEST_RELATIVE = 'apps/webapp/src/modules/operator-health/backgroundJobManifest.ts';

/* ──────────────────────────── чистые функции (тестируются) ──────────────────────────── */

/** Полный план поставляемых artifacts: имя файла → ожидаемое содержимое. */
export function planCronArtifacts(manifest) {
  const plan = [];
  for (const envId of manifest.BACKGROUND_JOB_ENVIRONMENT_IDS) {
    const environment = manifest.BACKGROUND_JOB_ENVIRONMENTS[envId];
    for (const entry of manifest.hostCronJobsForEnvironment(envId)) {
      plan.push({
        envId,
        jobId: entry.id,
        required: entry.required,
        artifactName: manifest.cronArtifactName(entry, environment),
        fileName: `${manifest.cronArtifactName(entry, environment)}${TEMPLATE_SUFFIX}`,
        content: manifest.renderCronArtifact(entry, environment),
        command: manifest.renderCronCommand(entry, environment),
        cron: entry.cron,
      });
    }
  }
  return plan;
}

/**
 * Расхождения поставляемых artifacts с manifest.
 * `actualFiles` — Map<имя файла, содержимое>; отсутствующий ключ = файла нет.
 */
export function findArtifactProblems(plan, actualFiles) {
  const problems = [];
  const planned = new Map(plan.map((item) => [item.fileName, item]));

  for (const item of plan) {
    if (!actualFiles.has(item.fileName)) {
      problems.push(
        `нет обязательного artifact deploy/host/cron.d/${item.fileName} (задание ${item.jobId}, среда ${item.envId})`,
      );
      continue;
    }
    if (actualFiles.get(item.fileName) !== item.content) {
      problems.push(
        `artifact deploy/host/cron.d/${item.fileName} разошёлся с manifest — перегенерировать: node deploy/host/background-jobs-cli.mjs --write`,
      );
    }
  }

  for (const fileName of actualFiles.keys()) {
    if (!planned.has(fileName)) {
      problems.push(
        `artifact deploy/host/cron.d/${fileName} не имеет записи в manifest (${MANIFEST_RELATIVE})`,
      );
    }
  }

  return problems;
}

/** Строки расписания файла `/etc/cron.d/*`: комментарии и `KEY=value` игнорируются. */
export function parseCronDFile(text) {
  const rows = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(line)) continue;
    rows.push(line.replace(/\s+/g, ' '));
  }
  return rows;
}

/** Ожидаемая строка расписания для задания. */
export function expectedCronRow(item) {
  return `${item.cron} root ${item.command}`.replace(/\s+/g, ' ');
}

/**
 * Сверка manifest с реально установленным расписанием одной среды.
 *
 * `installed` — Map<имя файла в cron-каталоге, содержимое>.
 * Обязательное задание без установленной строки, установленный файл без записи в manifest и
 * установленная строка, разошедшаяся с manifest, — все три случая громкие.
 */
export function findInstalledScheduleProblems({ plan, envId, installed, runnerExists }) {
  const problems = [];
  const envPlan = plan.filter((item) => item.envId === envId);
  const knownArtifactNames = new Set(plan.map((item) => item.artifactName));

  for (const item of envPlan) {
    const text = installed.get(item.artifactName);
    if (text === undefined) {
      if (item.required) {
        problems.push(
          `обязательное задание ${item.jobId} (${envId}) не установлено: нет ${item.artifactName} в расписании хоста`,
        );
      }
      continue;
    }
    const rows = parseCronDFile(text);
    const expected = expectedCronRow(item);
    if (!rows.includes(expected)) {
      problems.push(
        `установленное расписание ${item.artifactName} разошлось с manifest; ожидалась строка: ${expected}`,
      );
    }
  }

  for (const [name, text] of installed) {
    if (knownArtifactNames.has(name)) continue;
    if (!name.startsWith('bersoncarebot-')) continue;
    if (!/\/api\/internal\/|run-internal-job\.sh/.test(text)) continue;
    problems.push(
      `установлено фоновое задание ${name}, у которого нет записи в manifest (${MANIFEST_RELATIVE})`,
    );
  }

  if (envPlan.length > 0 && !runnerExists) {
    problems.push(
      `общий transport ${envPlan[0].command.split(' ')[0]} отсутствует или не исполняем: установить задание нечем`,
    );
  }

  return problems;
}

/** KEY=value описание задания для shell. Значение с кавычкой/переводом строки — отказ. */
export function describeJobAssignments(manifest, envId, jobId) {
  const environment = manifest.BACKGROUND_JOB_ENVIRONMENTS[envId];
  if (!environment) throw new Error(`unknown background job environment: ${envId}`);
  const entry = manifest.findBackgroundJob(jobId);
  if (!entry) throw new Error(`unknown background job: ${jobId}`);
  if (entry.scheduleOwner !== 'host_cron') {
    throw new Error(
      `background job ${jobId} is owned by ${entry.scheduleOwner}, not host cron — refusing to run it as a cron job`,
    );
  }
  if (!(entry.environments ?? []).includes(envId)) {
    throw new Error(`background job ${jobId} is not declared for environment ${envId}`);
  }
  if (!entry.route) throw new Error(`background job ${jobId} has no HTTP route`);

  const values = {
    BCB_JOB_ID: entry.id,
    BCB_JOB_ENV: environment.id,
    BCB_JOB_ENV_FILE: environment.envFile,
    BCB_JOB_METHOD: entry.route.method,
    BCB_JOB_PATH: entry.route.path,
    BCB_JOB_QUERY: entry.route.query ?? '',
    BCB_JOB_BODY: entry.route.jsonBody ?? '',
    BCB_JOB_TIMEOUT: String(entry.timeoutSec ?? 60),
    BCB_JOB_ACCEPT_STATUSES: (entry.acceptStatuses ?? [200]).join(' '),
    BCB_JOB_PRINCIPAL: entry.principal,
    BCB_JOB_SURFACE: entry.surfaceIdentity,
    BCB_JOB_TICK: `${entry.jobFamily}/${entry.jobKey}`,
  };

  for (const [key, value] of Object.entries(values)) {
    if (/['\n\r]/.test(value)) {
      throw new Error(`background job ${jobId}: unsafe shell value for ${key}`);
    }
  }

  return Object.entries(values).map(([key, value]) => `${key}='${value}'`);
}

/* ────────────────────────────────────── CLI ────────────────────────────────────── */

function readTemplateDir(dir) {
  const files = new Map();
  if (!existsSync(dir)) return files;
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(TEMPLATE_SUFFIX)) continue;
    files.set(name, readFileSync(path.join(dir, name), 'utf8'));
  }
  return files;
}

function readInstalledCronDir(dir) {
  const files = new Map();
  const stats = statSync(dir); // бросает, если каталога нет или он нечитаем — это громкий отказ
  if (!stats.isDirectory()) throw new Error(`${dir} is not a directory`);
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    let entryStat;
    try {
      entryStat = statSync(full);
    } catch {
      throw new Error(`cannot inspect installed cron entry ${full}`);
    }
    if (!entryStat.isFile()) continue;
    files.set(name, readFileSync(full, 'utf8'));
  }
  return files;
}

function parseArgs(argv) {
  const flags = new Set();
  const values = new Map();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`unexpected argument: ${arg}`);
    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    if (['env', 'job', 'cron-dir'].includes(rawKey)) {
      const value = inlineValue ?? argv[++i];
      if (value === undefined) throw new Error(`--${rawKey} requires a value`);
      values.set(rawKey, value);
    } else {
      flags.add(rawKey);
    }
  }
  return { flags, values };
}

function reportProblems(title, problems) {
  process.stderr.write(`${title}\n`);
  for (const problem of problems) process.stderr.write(`  • ${problem}\n`);
}

async function loadManifest() {
  return import(pathToFileURL(MANIFEST_PATH).href);
}

function runSelfTest(manifest) {
  const plan = planCronArtifacts(manifest);
  const failures = [];

  if (plan.length === 0) failures.push('план artifacts пуст');

  const goodFiles = new Map(plan.map((item) => [item.fileName, item.content]));
  if (findArtifactProblems(plan, goodFiles).length !== 0) {
    failures.push('совпадающие artifacts объявлены расхождением');
  }

  const missing = new Map(goodFiles);
  missing.delete(plan[0].fileName);
  if (findArtifactProblems(plan, missing).length !== 1) {
    failures.push('удалённый artifact не пойман');
  }

  const drifted = new Map(goodFiles);
  drifted.set(plan[0].fileName, `${plan[0].content}# hand edit\n`);
  if (findArtifactProblems(plan, drifted).length !== 1) {
    failures.push('правка artifact руками не поймана');
  }

  const orphan = new Map(goodFiles);
  orphan.set(`bersoncarebot-ghost${TEMPLATE_SUFFIX}`, '* * * * * root /bin/true\n');
  if (findArtifactProblems(plan, orphan).length !== 1) {
    failures.push('artifact без записи в manifest не пойман');
  }

  const prodPlan = plan.filter((item) => item.envId === 'prod');
  const installedOk = new Map(
    prodPlan.map((item) => [item.artifactName, `# comment\n${expectedCronRow(item)}\n`]),
  );
  if (
    findInstalledScheduleProblems({ plan, envId: 'prod', installed: installedOk, runnerExists: true })
      .length !== 0
  ) {
    failures.push('полностью установленное расписание объявлено расхождением');
  }

  const requiredProd = prodPlan.find((item) => item.required);
  const installedMissing = new Map(installedOk);
  installedMissing.delete(requiredProd.artifactName);
  if (
    findInstalledScheduleProblems({
      plan,
      envId: 'prod',
      installed: installedMissing,
      runnerExists: true,
    }).length !== 1
  ) {
    failures.push('обязательное задание без установленного расписания не поймано');
  }

  const installedDrift = new Map(installedOk);
  installedDrift.set(
    requiredProd.artifactName,
    '* * * * * root curl -fsS http://127.0.0.1:6200/api/internal/media-pending-delete/purge >/dev/null\n',
  );
  if (
    findInstalledScheduleProblems({
      plan,
      envId: 'prod',
      installed: installedDrift,
      runnerExists: true,
    }).length !== 1
  ) {
    failures.push('рукописная cron-строка мимо общего transport не поймана');
  }

  const installedExtra = new Map(installedOk);
  installedExtra.set(
    'bersoncarebot-ghost-job',
    '* * * * * root curl -fsS http://127.0.0.1:6200/api/internal/ghost/tick >/dev/null\n',
  );
  if (
    findInstalledScheduleProblems({
      plan,
      envId: 'prod',
      installed: installedExtra,
      runnerExists: true,
    }).length !== 1
  ) {
    failures.push('установленное задание без записи в manifest не поймано');
  }

  if (
    findInstalledScheduleProblems({
      plan,
      envId: 'prod',
      installed: installedOk,
      runnerExists: false,
    }).length !== 1
  ) {
    failures.push('отсутствующий общий transport не пойман');
  }

  if (failures.length > 0) {
    reportProblems('background-jobs-cli --self-test: ОТКАЗ', failures);
    return 1;
  }
  process.stdout.write('background-jobs-cli --self-test: OK\n');
  return 0;
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const manifest = await loadManifest();
  const plan = planCronArtifacts(manifest);

  if (flags.has('self-test')) return runSelfTest(manifest);

  if (flags.has('write')) {
    mkdirSync(CRON_TEMPLATE_DIR, { recursive: true });
    const planned = new Set(plan.map((item) => item.fileName));
    for (const item of plan) {
      writeFileSync(path.join(CRON_TEMPLATE_DIR, item.fileName), item.content);
    }
    const stale = [...readTemplateDir(CRON_TEMPLATE_DIR).keys()].filter(
      (name) => !planned.has(name),
    );
    process.stdout.write(`background-jobs-cli: записано artifacts — ${plan.length}\n`);
    if (stale.length > 0) {
      reportProblems('background-jobs-cli: artifacts без записи в manifest (удалить вручную)', stale);
      return 1;
    }
    return 0;
  }

  if (flags.has('check')) {
    const problems = findArtifactProblems(plan, readTemplateDir(CRON_TEMPLATE_DIR));
    if (problems.length > 0) {
      reportProblems('background-jobs-cli --check: manifest и host artifacts разошлись', problems);
      return 1;
    }
    process.stdout.write(
      `background-jobs-cli --check: OK (${plan.length} artifacts из ${MANIFEST_RELATIVE})\n`,
    );
    return 0;
  }

  if (flags.has('describe')) {
    const envId = values.get('env');
    const jobId = values.get('job');
    if (!envId || !jobId) throw new Error('--describe requires --env and --job');
    for (const line of describeJobAssignments(manifest, envId, jobId)) {
      process.stdout.write(`${line}\n`);
    }
    return 0;
  }

  if (flags.has('verify-installed')) {
    const envId = values.get('env');
    if (!envId) throw new Error('--verify-installed requires --env');
    if (!manifest.BACKGROUND_JOB_ENVIRONMENTS[envId]) {
      throw new Error(`unknown background job environment: ${envId}`);
    }
    const cronDir = values.get('cron-dir') ?? DEFAULT_INSTALLED_CRON_DIR;
    const environment = manifest.BACKGROUND_JOB_ENVIRONMENTS[envId];
    // На хосте deploy выполняется из канонического projectRoot этой среды, поэтому обе проверки
    // указывают на один и тот же файл; в произвольном checkout остаётся проверка поставки transport.
    const runnerExists =
      existsSync(manifest.internalJobRunnerPath(environment)) ||
      existsSync(path.join(repoRoot, 'deploy/host/run-internal-job.sh'));
    const problems = findInstalledScheduleProblems({
      plan,
      envId,
      installed: readInstalledCronDir(cronDir),
      runnerExists,
    });
    if (problems.length > 0) {
      reportProblems(
        `background-jobs-cli --verify-installed (${envId}, ${cronDir}): расписание хоста не соответствует manifest`,
        problems,
      );
      process.stderr.write(
        `\nПривести расписание ${envId} в соответствие (от root, по одному файлу):\n`,
      );
      for (const item of plan.filter((entry) => entry.envId === envId)) {
        process.stderr.write(
          `  install -m 0644 -o root -g root ${path.join(CRON_TEMPLATE_DIR, item.fileName)} ${path.join(cronDir, item.artifactName)}\n`,
        );
      }
      process.stderr.write(
        'Лишние строки снимаются тем же путём: убрать файл, которого нет в списке выше.\n',
      );
      return 1;
    }
    process.stdout.write(`background-jobs-cli --verify-installed (${envId}): OK\n`);
    return 0;
  }

  const envFilter = values.get('env');
  for (const item of plan) {
    if (envFilter && item.envId !== envFilter) continue;
    process.stdout.write(
      `${item.envId}\t${item.jobId}\t${item.required ? 'обязательное' : 'опциональное'}\t${item.cron}\t${item.artifactName}\n`,
    );
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`background-jobs-cli: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}

export { MANIFEST_PATH, MANIFEST_RELATIVE, TEMPLATE_SUFFIX, loadManifest };
