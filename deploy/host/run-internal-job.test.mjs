import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

/**
 * Поведение общего transport фоновых заданий (находка B1 сводного аудита 27.08.2026).
 *
 * Kill-set: неизвестный `Host` снова отсекается маршрутизацией поверхностей и cron молча считает
 * это успехом; тело ответа уходит в `/dev/null`; отказ сети выглядит как выполненная работа;
 * задание без записи в manifest всё равно выполняется; пустой `INTERNAL_JOB_SECRET` даёт
 * анонимный запрос.
 *
 * Скрипт выводит REPO_ROOT из собственного расположения, поэтому проверка работает на копии дерева
 * во временном каталоге: продуктовый код не получает ни одной тестовой лазейки.
 */

const hostDir = path.dirname(fileURLToPath(import.meta.url));

const PUBLIC_HOST = 'test.bersoncare.ru';
const PUBLIC_ORIGIN = `https://${PUBLIC_HOST}`;

const FIXTURE_MANIFEST = (root) => `
export const BACKGROUND_JOB_ENVIRONMENT_IDS = ['test'];

export const BACKGROUND_JOB_ENVIRONMENTS = {
  test: {
    id: 'test',
    envFile: '${root}/env/webapp.test',
    projectRoot: '${root}',
    cronFilePrefix: 'bersoncarebot-test-',
  },
};

export const BACKGROUND_JOB_MANIFEST = [
  {
    id: 'probe_ok',
    jobFamily: 'health',
    jobKey: 'health.probe_ok.tick',
    label: 'probe ok',
    kind: 'internal_http',
    scheduleOwner: 'host_cron',
    scheduleHint: 'каждую минуту',
    cron: '* * * * *',
    artifactSlug: 'probe-ok',
    environments: ['test'],
    route: { method: 'POST', path: '/api/internal/probe-ok/tick', query: 'limit=3' },
    principal: 'internal_job_bearer',
    surfaceIdentity: 'app_public_origin',
    timeoutSec: 10,
    staleAfterSec: 180,
    required: true,
    why: 'fixture',
  },
  {
    id: 'probe_gated',
    jobFamily: 'media',
    jobKey: 'media.probe_gated.tick',
    label: 'probe gated',
    kind: 'internal_http',
    scheduleOwner: 'host_cron',
    scheduleHint: 'каждые 10 мин',
    cron: '*/10 * * * *',
    artifactSlug: 'probe-gated',
    environments: ['test'],
    route: { method: 'POST', path: '/api/internal/probe-gated/tick', jsonBody: '{"limit":5}' },
    principal: 'internal_job_bearer',
    surfaceIdentity: 'app_public_origin',
    timeoutSec: 10,
    acceptStatuses: [200, 503],
    staleAfterSec: 1500,
    required: false,
    why: 'fixture',
  },
  {
    id: 'probe_strict',
    jobFamily: 'maintenance',
    jobKey: 'maintenance.probe_strict.tick',
    label: 'probe strict',
    kind: 'internal_http',
    scheduleOwner: 'host_cron',
    scheduleHint: 'ежечасно',
    cron: '0 * * * *',
    artifactSlug: 'probe-strict',
    environments: ['test'],
    route: { method: 'POST', path: '/api/internal/probe-gated/tick' },
    principal: 'internal_job_bearer',
    surfaceIdentity: 'app_public_origin',
    timeoutSec: 10,
    staleAfterSec: 10800,
    required: true,
    why: 'fixture',
  },
];

export function findBackgroundJob(id) {
  return BACKGROUND_JOB_MANIFEST.find((entry) => entry.id === id);
}

export function hostCronJobsForEnvironment(environmentId) {
  return BACKGROUND_JOB_MANIFEST.filter(
    (entry) => entry.scheduleOwner === 'host_cron' && entry.environments.includes(environmentId),
  );
}

export function cronArtifactName(entry, environment) {
  return environment.cronFilePrefix + entry.artifactSlug;
}

export function internalJobRunnerPath(environment) {
  return environment.projectRoot + '/deploy/host/run-internal-job.sh';
}

export function renderCronCommand(entry, environment) {
  return internalJobRunnerPath(environment) + ' ' + environment.id + ' ' + entry.id;
}

export function renderCronArtifact(entry, environment) {
  return '# fixture\\n' + entry.cron + ' root ' + renderCronCommand(entry, environment) + '\\n';
}
`;

function buildFakeHostTree() {
  const root = mkdtempSync(path.join(tmpdir(), 'bcb-transport-'));
  const manifestDir = path.join(root, 'apps/webapp/src/modules/operator-health');
  mkdirSync(manifestDir, { recursive: true });
  mkdirSync(path.join(root, 'deploy/host'), { recursive: true });
  mkdirSync(path.join(root, 'env'), { recursive: true });
  mkdirSync(path.join(root, 'apps/webapp'), { recursive: true });

  writeFileSync(path.join(manifestDir, 'backgroundJobManifest.ts'), FIXTURE_MANIFEST(root));
  // `apps/webapp` объявлен ESM-пакетом, иначе node прочитает манифест как CommonJS.
  writeFileSync(
    path.join(root, 'apps/webapp/package.json'),
    JSON.stringify({ name: 'fixture-webapp', type: 'module' }),
  );
  for (const name of ['run-internal-job.sh', 'background-jobs-cli.mjs', 'webapp-health-host.mjs']) {
    copyFileSync(path.join(hostDir, name), path.join(root, 'deploy/host', name));
  }
  return root;
}

function writeEnvFile(root, { appBaseUrl, port, secret = 'fixture-secret' }) {
  writeFileSync(
    path.join(root, 'env/webapp.test'),
    [
      'NODE_ENV=production',
      'HOST=127.0.0.1',
      `PORT=${port}`,
      `APP_BASE_URL=${appBaseUrl}`,
      `INTERNAL_JOB_SECRET=${secret}`,
      '',
    ].join('\n'),
  );
}

/**
 * Асинхронный запуск обязателен: HTTP-сервер живёт в этом же процессе, а `spawnSync` заблокировал бы
 * event loop и превратил бы любой ответ в timeout.
 */
function runJob(root, jobId) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [path.join(root, 'deploy/host/run-internal-job.sh'), 'test', jobId], {
      encoding: 'utf8',
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

/** Сервер повторяет решение маршрутизации поверхностей: неизвестный Host — 404 до маршрута. */
async function startSurfaceServer(seen) {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, headers: { ...req.headers }, body });
      if (req.headers.host !== PUBLIC_HOST) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end('{"ok":false,"error":"surface_not_resolved"}');
        return;
      }
      if (req.url.startsWith('/api/internal/probe-gated/tick')) {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end('{"ok":false,"error":"pipeline_disabled"}');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

test('общий transport предъявляет публичную surface identity, а не голый loopback Host', async (t) => {
  const root = buildFakeHostTree();
  const seen = [];
  const server = await startSurfaceServer(seen);
  t.after(() => {
    server.close();
    rmSync(root, { recursive: true, force: true });
  });

  writeEnvFile(root, { appBaseUrl: PUBLIC_ORIGIN, port: server.address().port });
  const result = await runJob(root, 'probe_ok');

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '', 'успешный прогон не должен спамить cron выводом');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].method, 'POST');
  assert.equal(seen[0].url, '/api/internal/probe-ok/tick?limit=3');
  assert.equal(seen[0].headers.host, PUBLIC_HOST);
  assert.equal(seen[0].headers.origin, PUBLIC_ORIGIN);
  assert.equal(seen[0].headers['x-forwarded-proto'], 'https');
  assert.equal(seen[0].headers.authorization, 'Bearer fixture-secret');
});

test('неизвестный Host: 404 маршрутизации — громкий отказ с телом ответа, а не тихий успех', async (t) => {
  const root = buildFakeHostTree();
  const seen = [];
  const server = await startSurfaceServer(seen);
  t.after(() => {
    server.close();
    rmSync(root, { recursive: true, force: true });
  });

  writeEnvFile(root, {
    appBaseUrl: `http://127.0.0.1:${server.address().port}`,
    port: server.address().port,
  });
  const result = await runJob(root, 'probe_ok');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /HTTP 404/);
  assert.match(result.stderr, /surface_not_resolved/, 'тело ответа не должно исчезать');
});

test('заявленный в manifest 503 feature-flag не считается отказом transport', async (t) => {
  const root = buildFakeHostTree();
  const seen = [];
  const server = await startSurfaceServer(seen);
  t.after(() => {
    server.close();
    rmSync(root, { recursive: true, force: true });
  });

  writeEnvFile(root, { appBaseUrl: PUBLIC_ORIGIN, port: server.address().port });

  const gated = await runJob(root, 'probe_gated');
  assert.equal(gated.status, 0, gated.stderr);
  assert.equal(seen[0].body, '{"limit":5}');
  assert.equal(seen[0].headers['content-type'], 'application/json');

  const strict = await runJob(root, 'probe_strict');
  assert.equal(strict.status, 1, 'тот же 503 у задания без объявленного статуса — отказ');
  assert.match(strict.stderr, /HTTP 503/);
  assert.match(strict.stderr, /pipeline_disabled/);
});

test('отказ сети не превращается в выполненную работу', async (t) => {
  const root = buildFakeHostTree();
  const seen = [];
  const server = await startSurfaceServer(seen);
  const port = server.address().port;
  server.close();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  await new Promise((resolve) => setTimeout(resolve, 50));
  writeEnvFile(root, { appBaseUrl: PUBLIC_ORIGIN, port });
  const result = await runJob(root, 'probe_ok');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /transport failed/);
  assert.equal(seen.length, 0);
});

test('пустой INTERNAL_JOB_SECRET останавливает задание до запроса', async (t) => {
  const root = buildFakeHostTree();
  const seen = [];
  const server = await startSurfaceServer(seen);
  t.after(() => {
    server.close();
    rmSync(root, { recursive: true, force: true });
  });

  writeEnvFile(root, { appBaseUrl: PUBLIC_ORIGIN, port: server.address().port, secret: '' });
  const result = await runJob(root, 'probe_ok');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /INTERNAL_JOB_SECRET/);
  assert.equal(seen.length, 0, 'анонимный запрос не должен уходить');
});

test('APP_BASE_URL без валидного origin останавливает задание до запроса', async (t) => {
  const root = buildFakeHostTree();
  const seen = [];
  const server = await startSurfaceServer(seen);
  t.after(() => {
    server.close();
    rmSync(root, { recursive: true, force: true });
  });

  writeEnvFile(root, {
    appBaseUrl: 'https://test.bersoncare.ru/path',
    port: server.address().port,
  });
  const result = await runJob(root, 'probe_ok');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /surface identity/);
  assert.equal(seen.length, 0);
});

test('задание без записи в manifest не выполняется', async (t) => {
  const root = buildFakeHostTree();
  const seen = [];
  const server = await startSurfaceServer(seen);
  t.after(() => {
    server.close();
    rmSync(root, { recursive: true, force: true });
  });

  writeEnvFile(root, { appBaseUrl: PUBLIC_ORIGIN, port: server.address().port });
  const result = await runJob(root, 'probe_forgotten');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /not declared in the background job manifest/);
  assert.equal(seen.length, 0);
});
