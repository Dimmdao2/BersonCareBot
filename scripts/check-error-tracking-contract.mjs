import { readFile } from 'node:fs/promises';
import process from 'node:process';

const files = {
  shared: 'packages/error-tracking/src/runtime.ts',
  webapp: 'apps/webapp/src/instrumentation.ts',
  webappAdapter: 'apps/webapp/src/app-layer/observability/errorTracking.ts',
  api: 'apps/integrator/src/main.ts',
  integratorAdapter: 'apps/integrator/src/infra/observability/errorTracking.ts',
  worker: 'apps/integrator/src/infra/runtime/worker/main.ts',
  scheduler: 'apps/integrator/src/infra/runtime/scheduler/main.ts',
  mediaWorker: 'apps/media-worker/src/main.ts',
  mediaWorkerAdapter: 'apps/media-worker/src/errorTracking.ts',
};

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([name, path]) => [name, await readFile(path, 'utf8')]),
  ),
);
const combined = Object.values(sources).join('\n');

const failures = [];
function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) failures.push(message);
}
function forbid(pattern, message) {
  if (pattern.test(combined)) failures.push(message);
}

requireMatch(sources.shared, /await import\("@sentry\/node"\)/, 'SDK must be dynamically imported');
if (/^import .*@sentry\/node/m.test(sources.shared))
  failures.push('top-level SDK import is forbidden');
requireMatch(
  sources.shared,
  /defaultIntegrations:\s*false/,
  'default integrations must be disabled',
);
requireMatch(sources.shared, /tracesSampleRate:\s*0/, 'tracing must be disabled');
requireMatch(sources.shared, /profilesSampleRate:\s*0/, 'profiling must be disabled');
requireMatch(sources.shared, /enableLogs:\s*false/, 'SDK logs must be disabled');
requireMatch(sources.shared, /maxBreadcrumbs:\s*0/, 'breadcrumbs must be disabled');
requireMatch(sources.shared, /sendDefaultPii:\s*false/, 'default PII must be disabled');
requireMatch(sources.shared, /includeLocalVariables:\s*false/, 'local variables must be disabled');

for (const [name, role, capture] of [
  ['webapp', 'webapp', 'webapp_request_error'],
  ['api', 'api', 'integrator_startup_fatal'],
  ['worker', 'worker', 'worker_startup_fatal'],
  ['scheduler', 'scheduler', 'scheduler_startup_fatal'],
  ['mediaWorker', 'media-worker', 'media_worker_startup_fatal'],
]) {
  const source =
    name === 'webapp'
      ? `${sources.webapp}\n${sources.webappAdapter}`
      : name === 'mediaWorker'
        ? `${sources.mediaWorker}\n${sources.mediaWorkerAdapter}`
        : ['api', 'worker', 'scheduler'].includes(name)
          ? `${sources[name]}\n${sources.integratorAdapter}`
          : sources[name];
  requireMatch(source, new RegExp(`['"]${role}['"]`), `${name} process role is missing`);
  requireMatch(
    source,
    new RegExp(`['"]${capture}['"]`),
    `${name} fatal/request capture hook is missing`,
  );
}

forbid(/\bSENTRY_[A-Z0-9_]+\b/, 'SENTRY_* configuration is forbidden');
forbid(/@sentry\/browser|@sentry\/nextjs/, 'browser/Next SDK is forbidden');
forbid(/(?:tracesSampleRate|profilesSampleRate):\s*[1-9]/, 'non-zero sampling is forbidden');
forbid(
  /enableLogs:\s*true|autoSessionTracking:\s*true|sendDefaultPii:\s*true|includeLocalVariables:\s*true/,
  'forbidden telemetry is enabled',
);
forbid(
  /source.?map.{0,40}(upload|send)|upload.{0,40}source.?map/is,
  'source-map upload wiring is forbidden',
);

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    'error-tracking static contract: ok (5 process entrypoints, errors-only, no env/browser/upload wiring)',
  );
}
