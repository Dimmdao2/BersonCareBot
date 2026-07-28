#!/usr/bin/env node
import { sourceTextIncludes, sourceTextIndexOf } from './source-text-guard.mjs';

import { readFileSync } from 'node:fs';

const files = {
  doc: 'docs/_TODO/SAAS_FOUNDATION/SAAS_C3_INTEGRATOR_FANOUT_INVENTORY.md',
  roadmap: 'docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md',
  t04Map: 'docs/_TODO/SAAS_FOUNDATION/T0_4_ENTRYPOINT_ORG_CONTEXT_MAP.md',
  t04Checker: 'docs/_TODO/SAAS_FOUNDATION/scripts/check-t0-4-entrypoint-org-map.mjs',
  routes: 'apps/integrator/src/app/routes.ts',
  withClient: 'apps/integrator/src/infra/db/withClient.ts',
  poolProvider: 'apps/integrator/src/infra/db/integratorPoolProvider.ts',
  withClientTest: 'apps/integrator/src/infra/db/withClient.test.ts',
  packageJson: 'package.json',
};

const registrarFiles = {
  registerBersoncareSendSmsRoute: 'apps/integrator/src/integrations/bersoncare/sendSmsRoute.ts',
  registerBersoncareSendEmailRoute: 'apps/integrator/src/integrations/bersoncare/sendEmailRoute.ts',
  registerBersoncareRelayOutboundRoute:
    'apps/integrator/src/integrations/bersoncare/relayOutboundRoute.ts',
  registerOperatorAlertRelayRoute:
    'apps/integrator/src/integrations/bersoncare/operatorAlertRelayRoute.ts',
  registerBersoncareRequestContactRoute:
    'apps/integrator/src/integrations/bersoncare/requestContactRoute.ts',
  registerBersoncareSendOtpRoute: 'apps/integrator/src/integrations/bersoncare/sendOtpRoute.ts',
  registerBersoncareReminderRulesRoute:
    'apps/integrator/src/integrations/bersoncare/reminderRulesRoute.ts',
  registerBersoncareSettingsSyncRoute:
    'apps/integrator/src/integrations/bersoncare/settingsSyncRoute.ts',
  registerBersoncareUserMergeM2mRoutes:
    'apps/integrator/src/integrations/bersoncare/userMergeM2mRoute.ts',
  registerOperatorHealthProbeRoute:
    'apps/integrator/src/integrations/bersoncare/operatorHealthProbeRoute.ts',
  registerBersoncareBookingLifecycleRoute:
    'apps/integrator/src/integrations/bersoncare/bookingLifecycleRoute.ts',
};

const conditionalRegistrarFiles = {
  registerTelegramWebhookRoutes: 'apps/integrator/src/integrations/telegram/webhook.ts',
  registerMaxWebhookRoutes: 'apps/integrator/src/integrations/max/webhook.ts',
};

const routeSourceFiles = {
  ...registrarFiles,
  ...conditionalRegistrarFiles,
};

const expectedInventoryEntries = [
  { id: 'health', method: 'GET', path: '/health', source: files.routes },
  { id: 'projection-health', method: 'GET', path: '/health/projection', source: files.routes },
  {
    id: 'send-sms',
    method: 'POST',
    path: '/api/bersoncare/send-sms',
    source: registrarFiles.registerBersoncareSendSmsRoute,
  },
  {
    id: 'send-email',
    method: 'POST',
    path: '/api/bersoncare/send-email',
    source: registrarFiles.registerBersoncareSendEmailRoute,
  },
  {
    id: 'relay-outbound',
    method: 'POST',
    path: '/api/bersoncare/relay-outbound',
    source: registrarFiles.registerBersoncareRelayOutboundRoute,
  },
  {
    id: 'operator-alert-relay',
    method: 'POST',
    path: '/api/bersoncare/operator-alert-relay',
    source: registrarFiles.registerOperatorAlertRelayRoute,
  },
  {
    id: 'request-contact',
    method: 'POST',
    path: '/api/bersoncare/request-contact',
    source: registrarFiles.registerBersoncareRequestContactRoute,
  },
  {
    id: 'send-otp',
    method: 'POST',
    path: '/api/bersoncare/send-otp',
    source: registrarFiles.registerBersoncareSendOtpRoute,
  },
  {
    id: 'reminder-rules',
    method: 'POST',
    path: '/api/integrator/reminders/rules',
    source: registrarFiles.registerBersoncareReminderRulesRoute,
  },
  {
    id: 'settings-sync',
    method: 'POST',
    path: '/api/integrator/settings/sync',
    source: registrarFiles.registerBersoncareSettingsSyncRoute,
  },
  {
    id: 'users-canonical-pair',
    method: 'POST',
    path: '/api/integrator/users/canonical-pair',
    source: registrarFiles.registerBersoncareUserMergeM2mRoutes,
  },
  {
    id: 'users-merge',
    method: 'POST',
    path: '/api/integrator/users/merge',
    source: registrarFiles.registerBersoncareUserMergeM2mRoutes,
  },
  {
    id: 'operator-health-probe',
    method: 'POST',
    path: '/internal/operator-health-probe',
    source: registrarFiles.registerOperatorHealthProbeRoute,
  },
  {
    id: 'booking-lifecycle',
    method: 'POST',
    path: '/api/bersoncare/booking/lifecycle-event',
    source: registrarFiles.registerBersoncareBookingLifecycleRoute,
  },
  {
    id: 'telegram-webhook',
    method: 'POST',
    path: '/webhook/telegram',
    source: conditionalRegistrarFiles.registerTelegramWebhookRoutes,
  },
  {
    id: 'telegram-long-polling',
    method: 'LOOP',
    path: 'telegram getUpdates',
    source: 'apps/integrator/src/integrations/telegram/longPolling.ts',
  },
  {
    id: 'max-webhook',
    method: 'POST',
    path: '/webhook/max',
    source: conditionalRegistrarFiles.registerMaxWebhookRoutes,
  },
];

function fail(message) {
  throw new Error(message);
}

function read(path) {
  return readFileSync(path, 'utf8');
}

function requireFragments(label, text, fragments) {
  for (const fragment of fragments) {
    if (!sourceTextIncludes(text, fragment, label)) {
      fail(`${label} missing required fragment: ${fragment}`);
    }
  }
}

function requireFragmentBefore(label, text, before, after) {
  const beforeIndex = sourceTextIndexOf(text, before, label);
  const afterIndex = sourceTextIndexOf(text, after, label);
  if (beforeIndex < 0) fail(`${label} missing required fragment: ${before}`);
  if (afterIndex < 0) fail(`${label} missing required fragment: ${after}`);
  if (beforeIndex > afterIndex) fail(`${label} must contain ${before} before ${after}`);
}

function extractAppRoutes(text) {
  const out = [];
  const routePattern = /app\.(get|post)(?:<[^>]+>)?\(\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = routePattern.exec(text)) !== null) {
    out.push({ method: match[1].toUpperCase(), path: match[2] });
  }
  return out;
}

function extractMountedRegistrars(routesText) {
  const out = new Set();
  const callPattern = /await\s+(register[A-Za-z0-9]+Routes?)\(/g;
  let match;
  while ((match = callPattern.exec(routesText)) !== null) {
    out.add(match[1]);
  }
  return [...out].sort();
}

function assertRouteInventoryMatchesSource(loaded) {
  const routesText = loaded.routes;
  const mountedRegistrars = extractMountedRegistrars(routesText);
  const knownRegistrars = Object.keys(registrarFiles).sort();

  for (const registrar of mountedRegistrars) {
    if (!knownRegistrars.includes(registrar)) {
      fail(`${files.routes} mounts ${registrar}, but C3 checker has no registrar file mapping`);
    }
  }
  for (const registrar of knownRegistrars) {
    if (!mountedRegistrars.includes(registrar)) {
      fail(
        `${files.routes} no longer mounts ${registrar}; update C3 inventory/checker intentionally`,
      );
    }
  }

  const discoveredRoutes = [
    ...extractAppRoutes(routesText).map((route) => ({ ...route, source: files.routes })),
  ];
  for (const [registrar, path] of Object.entries(routeSourceFiles)) {
    const moduleRoutes = extractAppRoutes(loaded[path] ?? read(path));
    if (moduleRoutes.length === 0) {
      fail(`${path} has no app.get/app.post route for ${registrar}`);
    }
    discoveredRoutes.push(...moduleRoutes.map((route) => ({ ...route, source: path })));
  }

  for (const route of discoveredRoutes) {
    const expected = expectedInventoryEntries.find(
      (entry) =>
        entry.method === route.method && entry.path === route.path && entry.source === route.source,
    );
    if (!expected) {
      fail(
        `C3 inventory missing registered route ${route.method} ${route.path} from ${route.source}`,
      );
    }
  }

  for (const entry of expectedInventoryEntries) {
    const routeLabel = entry.method === 'LOOP' ? entry.path : `${entry.method} ${entry.path}`;
    requireFragments(files.doc, loaded.doc, [`| \`${entry.id}\` | \`${routeLabel}\` |`]);
  }

  requireFragments(files.routes, routesText, [
    'deps.registerTelegramWebhookRoutes',
    'startTelegramLongPolling(telegramWebhookDeps);',
    'deps.registerMaxWebhookRoutes',
  ]);
}

function runChecks(overrides = {}) {
  const loaded = Object.fromEntries(
    Object.entries(files).map(([key, path]) => [key, overrides[key] ?? read(path)]),
  );
  for (const path of Object.values(routeSourceFiles)) {
    loaded[path] = overrides[path] ?? read(path);
  }

  requireFragments(files.roadmap, loaded.roadmap, [
    '### Phase C3',
    'Inventory every integrator API/worker entrypoint',
    'Reject unclassified jobs/events in locked mode',
    'no outbound delivery occurs',
  ]);

  requireFragments(files.t04Map, loaded.t04Map, [
    'Telegram webhook',
    'Telegram long polling',
    'MAX webhook',
    'BersonCare request-contact M2M',
    'BersonCare reminder-rules M2M',
    'Scheduler tick',
    'Runtime worker: outgoing delivery queue',
    'Runtime worker: projection outbox',
    'Runtime worker: generic retry jobs',
  ]);
  requireFragments(files.t04Checker, loaded.t04Checker, [
    'check-t0-4-entrypoint-org-map',
    'assertNoRuntimeMailingsWriter',
    'runWithOrganizationPrincipal(organizationId, handleEvent)',
  ]);

  assertRouteInventoryMatchesSource(loaded);

  requireFragments(files.withClient, loaded.withClient, [
    'getCurrentDbPrincipal',
    'allowedLockedBootstrapSources',
    'allowedLockedInfraSources',
    'export function assertIntegratorLockedPrincipalClassified(',
    "options.mode !== 'locked'",
    'DB principal context is required before integrator scoped DB access in locked mode',
    'DB bootstrap principal source is not allowed on integrator request pool in locked mode',
    'DB infra principal source is not allowed on integrator request pool in locked mode',
    'client.release(toReleaseError(cleanupError));',
    'assertIntegratorLockedPrincipalClassified(principalApplyOptions);',
    "'integrator-user-org-resolution'",
    "'integrator-deployment-org-resolution'",
    "'integrator-projection-health'",
  ]);
  requireFragments(files.routes, loaded.routes, [
    '{ source: `${resource}-webhook:pre-routing` }',
    "{ source: 'integrator-user-org-resolution' }",
    "{ source: 'integrator-deployment-org-resolution' }",
  ]);
  requireFragmentBefore(
    files.withClient,
    loaded.withClient,
    'assertIntegratorLockedPrincipalClassified(principalApplyOptions);',
    'const client = await pool.connect();',
  );

  requireFragments(files.poolProvider, loaded.poolProvider, [
    'assertIntegratorLockedPrincipalClassified',
    'function releasePoolClient(',
    'const principalApplyOptions = buildDbPrincipalApplyOptionsFromEnv(process.env);',
    'assertIntegratorLockedPrincipalClassified(principalApplyOptions);',
    'const client = await pool.connect();',
    'releasePoolClient(client, cleanupError);',
  ]);
  requireFragmentBefore(
    files.poolProvider,
    loaded.poolProvider,
    'assertIntegratorLockedPrincipalClassified(principalApplyOptions);',
    'const client = await pool.connect();',
  );

  requireFragments(files.withClientTest, loaded.withClientTest, [
    'fails closed in locked mode before checkout when no DB principal is active',
    'fails closed in locked mode before checkout for unknown bootstrap principals',
    'fails closed in locked mode before checkout for unknown infra principals',
    'allows explicitly listed bootstrap principals in locked mode',
    'destroys checked-out clients when locked cleanup fails',
    'destroys transaction clients when locked cleanup fails after commit',
    'destroys provider pool.query clients when locked cleanup fails',
    'rejects missing locked DB principal before pool.query checkout',
    'expect(pool.connect).not.toHaveBeenCalled();',
    'expect(connect).not.toHaveBeenCalled();',
  ]);

  requireFragments(files.doc, loaded.doc, [
    '# C3 integrator fanout inventory and missing-principal gate',
    'every HTTP registrar mounted from `apps/integrator/src/app/routes.ts` is inventoried below',
    'locked-mode bootstrap/infra request-pool access is explicitly source-allowlisted',
    'cleanup failure in integrator client release destroys/poisons the connection',
    'The inventory checker derives the mounted registrar list',
    'It also parses conditional Telegram/MAX webhook registrar',
    'real staff/nonstaff or operational integrator pool split',
    'no-real-delivery/no-real-S3 runtime proof',
    'controlled queued fixtures consumed once under strict roles',
  ]);

  const packageJson = JSON.parse(loaded.packageJson);
  const scripts = packageJson.scripts ?? {};
  if (
    scripts['check:saas-c3-integrator-fanout-inventory'] !==
    'node --check docs/_TODO/SAAS_FOUNDATION/scripts/check-c3-integrator-fanout-inventory.mjs && node docs/_TODO/SAAS_FOUNDATION/scripts/check-c3-integrator-fanout-inventory.mjs && node docs/_TODO/SAAS_FOUNDATION/scripts/check-c3-integrator-fanout-inventory.mjs --self-test'
  ) {
    fail('package.json has an unexpected check:saas-c3-integrator-fanout-inventory script');
  }
}

if (process.argv.includes('--self-test')) {
  const withClient = read(files.withClient).replace(
    'assertIntegratorLockedPrincipalClassified(principalApplyOptions);',
    '// removed by self-test',
  );
  const doc = read(files.doc).replace(
    '`POST /api/bersoncare/send-otp`',
    '`POST /api/bersoncare/send-otp-missing`',
  );
  const routes = `${read(files.routes)}\nawait registerUnexpectedFutureRoute(app, {});\n`;
  const telegramWebhook = read(conditionalRegistrarFiles.registerTelegramWebhookRoutes).replace(
    "  app.post('/webhook/telegram', async (request, reply) => {",
    "  app.post('/webhook/telegram/future', async () => ({}));\n\n  app.post('/webhook/telegram', async (request, reply) => {",
  );
  const maxWebhook = read(conditionalRegistrarFiles.registerMaxWebhookRoutes).replace(
    "  app.post('/webhook/max', async (request, reply) => {",
    "  app.get('/webhook/max/future', async () => ({}));\n\n  app.post('/webhook/max', async (request, reply) => {",
  );
  const cases = [
    { withClient },
    { doc },
    { routes },
    { [conditionalRegistrarFiles.registerTelegramWebhookRoutes]: telegramWebhook },
    { [conditionalRegistrarFiles.registerMaxWebhookRoutes]: maxWebhook },
  ];
  let detected = 0;
  for (const testCase of cases) {
    try {
      runChecks(testCase);
    } catch {
      detected += 1;
    }
  }
  if (detected === cases.length) {
    console.log('check-c3-integrator-fanout-inventory self-test: OK');
    process.exit(0);
  }
  fail('self-test did not detect all C3 inventory/checker regressions');
}

try {
  runChecks();
  console.log('check-c3-integrator-fanout-inventory: OK');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-c3-integrator-fanout-inventory: ${message}`);
  process.exit(1);
}
