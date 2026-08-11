import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

import { declaration } from './declaration.ts';

const PRODUCTION_SOURCE_ROOTS = [
  ['integrator', 'apps/integrator/src'],
  ['webapp', 'apps/webapp/src'],
];
const EXCLUDED_DIRECTORIES = new Set(['.next', 'coverage', 'dist', 'generated', '__generated__', 'node_modules']);
const TEST_FILE_RE = /(?:^|\.)(?:test|spec|unit|integration|e2e)\.[cm]?[jt]sx?$/;

const EXPECTED_ROOTS = new Map(Object.entries({
  'app.password_login_acquire(text,text,uuid,text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.password.acquire', argCount: 4,
    source: 'apps/webapp/src/infra/repos/pgPasswordLoginProtection.ts',
  },
  'app.password_login_complete(uuid,boolean)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.password.complete', argCount: 2,
    source: 'apps/webapp/src/infra/repos/pgPasswordLoginProtection.ts',
  },
  'app.password_login_read_altcha_secret()': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.password.altcha-secret', argCount: 0,
    source: 'apps/webapp/src/infra/repos/pgPasswordLoginProtection.ts',
  },
  'app.password_login_issue_altcha_challenge(text,uuid,text,timestamp with time zone)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.password.altcha-issue', argCount: 4,
    source: 'apps/webapp/src/infra/repos/pgPasswordLoginProtection.ts',
  },
  'app.resolve_outgoing_delivery_scope(uuid)': {
    port: 'integrator', targetRole: 'app_operational_delivery_worker', contextClass: 'service',
    purpose: 'delivery.resolve-scope', argCount: 1,
    source: 'apps/integrator/src/infra/db/repos/outgoingDeliveryScope.ts',
  },
  'app.operator_incident_alert_already_sent(uuid)': {
    port: 'integrator', targetRole: 'app_operational_delivery_worker', contextClass: 'service',
    purpose: 'delivery.incident-alert-status', argCount: 1,
    source: 'apps/integrator/src/infra/db/repos/outgoingDeliveryScope.ts',
  },
  'app.mark_operator_incident_alert_sent(uuid)': {
    port: 'integrator', targetRole: 'app_operational_delivery_worker', contextClass: 'service',
    purpose: 'delivery.incident-alert-mark', argCount: 1,
    source: 'apps/integrator/src/infra/db/repos/outgoingDeliveryScope.ts',
  },
  'app.list_scheduler_reminder_organization_ids()': {
    port: 'integrator', targetRole: 'app_operational_scheduler', contextClass: 'service',
    purpose: 'scheduler.reminder-organizations', argCount: 0,
    source: 'apps/integrator/src/infra/db/repos/schedulerReminderOrganizations.ts',
  },
  'app.revalidate_appointment_reminder_materialization(uuid)': {
    port: 'integrator', targetRole: 'app_operational_delivery_worker', contextClass: 'service',
    purpose: 'delivery.appointment-reminder-revalidate', argCount: 1,
    source: 'apps/integrator/src/infra/db/repos/appointmentReminderDelivery.ts',
  },
  'app.advance_appointment_reminder_messenger_ladder(uuid,integer,text)': {
    port: 'integrator', targetRole: 'app_operational_delivery_worker', contextClass: 'service',
    purpose: 'delivery.appointment-reminder-advance', argCount: 3,
    source: 'apps/integrator/src/infra/db/repos/appointmentReminderDelivery.ts',
  },
}));

const EXPECTED_RUNTIME_SOURCES = new Map(Object.entries({
  'integrator:delivery': [
    'delivery-handler',
    'max-webhook:record-outcome',
    'telegram-webhook:record-outcome',
    'worker:job-queue-drain',
    'worker:outgoing-delivery-tick',
    'worker:projection-outbox-tick',
  ],
  'integrator:scheduler': [
    'scheduler:acquire-lock',
    'scheduler:claim-due-jobs',
    'scheduler:handle-tick-event',
  ],
  'integrator:service': ['integrator-health-check', 'integrator-projection-health'],
  'integrator:migration_ledger': ['integrator-startup-migration-ledger'],
  'webapp:worker': [
    'api/integrator/operator-health/digest-wake:POST',
    'api/integrator/system-health/guard-wake:POST',
    'api/internal/operator-health-digest/tick:POST',
    'api/internal/operator-health-critical/tick:POST',
    'api/internal/system-health-guard/tick:POST',
    'api/internal/product-analytics/retention:POST',
    'api/internal/specialist-task-reminders/tick:POST',
    'api/internal/heartbeat/pipeline_delivery:POST',
    'api/internal/heartbeat/pipeline_delivery:GET',
    'api/internal/heartbeat/digest:POST',
    'api/internal/heartbeat/digest:GET',
    'webapp-health-check',
    'api/health:GET',
  ],
  'webapp:media_worker': [
    'api/internal/media-worker/control:POST',
    'api/internal/media-hls-proxy-errors/retention:POST',
    'api/internal/media-playback-stats/retention:POST',
    'api/internal/media-pending-delete/purge:POST',
    'api/internal/media-multipart/cleanup:POST',
    'api/internal/media-preview/process:POST',
    'api/internal/media-transcode/enqueue:POST',
    'api/internal/media-transcode/reconcile:POST',
  ],
  'webapp:pre_session': [
    'webapp-public-runtime-config',
    'webapp-server-runtime-config',
    'webapp-public-smtp-config',
  ],
  'webapp:telemetry': ['webapp-saas-isolation-telemetry'],
}));

function productionSourceFiles(root) {
  const files = [];
  const visit = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name)) visit(join(path, entry.name));
        continue;
      }
      if (!entry.isFile() || !/\.[cm]?[jt]sx?$/.test(entry.name) || TEST_FILE_RE.test(entry.name)) continue;
      files.push(join(path, entry.name));
    }
  };
  visit(root);
  return files.sort();
}

function collectNamedRootCallsites() {
  const result = [];
  for (const [port, root] of PRODUCTION_SOURCE_ROOTS) {
    for (const path of productionSourceFiles(root)) {
      const source = ts.createSourceFile(
        path,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      function visit(node) {
        if (ts.isCallExpression(node)
          && ts.isIdentifier(node.expression)
          && ['runIntegratorNamedRoot', 'runWebappNamedRoot'].includes(node.expression.text)) {
          const identity = node.arguments[1];
          const typedArgs = node.arguments[2];
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          assert.ok(identity, `${path}:${line}: named root identity is required`);
          assert.ok(typedArgs, `${path}:${line}: typed arguments are required`);
          if (ts.isStringLiteralLike(identity)) {
            assert.ok(ts.isArrayLiteralExpression(typedArgs),
              `${path}:${line}: literal named root arguments must be an array literal`);
            result.push({ kind: 'literal', port, path, line, identity: identity.text,
              argCount: typedArgs.elements.length });
          } else {
            assert.ok(ts.isIdentifier(identity) && identity.text === 'functionIdentity',
              `${path}:${line}: unexpected dynamic named-root identity`);
            assert.ok(ts.isIdentifier(typedArgs) && typedArgs.text === 'functionArgs',
              `${path}:${line}: unexpected dynamic named-root arguments`);
            result.push({ kind: 'dynamic', port, path, line });
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  return result;
}

function assertCallsiteCatalog(candidate, discovered = collectNamedRootCallsites()) {
  const callsites = discovered.filter((row) => row.kind === 'literal');
  const dynamicWrappers = discovered.filter((row) => row.kind === 'dynamic');
  assert.equal(dynamicWrappers.length, 1, 'one generic named-root readiness wrapper must exist');
  assert.equal(dynamicWrappers[0].port, 'integrator', 'generic named-root wrapper belongs to integrator');
  assert.equal(dynamicWrappers[0].path, 'apps/integrator/src/infra/db/operationalPoolReadiness.ts',
    'generic named-root wrapper moved from the reviewed production source');
  assert.equal(callsites.length, EXPECTED_ROOTS.size, 'named-root callsite census changed');
  assert.equal(new Set(callsites.map((row) => row.identity)).size, callsites.length,
    'each production named root must have one exact callsite');

  const roots = Object.values(candidate.portContext.capabilities)
    .filter((descriptor) => descriptor.functionIdentity);
  assert.equal(roots.length, EXPECTED_ROOTS.size, 'function-bound catalog size changed');
  const byIdentity = new Map(roots.map((descriptor) => [descriptor.functionIdentity, descriptor]));
  assert.equal(byIdentity.size, roots.length, 'function-bound catalog identities must be unique');

  for (const callsite of callsites) {
    const expected = EXPECTED_ROOTS.get(callsite.identity);
    assert.ok(expected, `${callsite.path}:${callsite.line}: undeclared named-root callsite`);
    assert.equal(callsite.path, expected.source,
      `${callsite.path}:${callsite.line}: named root moved from the reviewed production source`);
    assert.equal(callsite.port, expected.port,
      `${callsite.path}:${callsite.line}: named root moved to the wrong port`);
    assert.equal(callsite.argCount, expected.argCount,
      `${callsite.path}:${callsite.line}: typed argument count does not match function identity`);
    const descriptor = byIdentity.get(callsite.identity);
    assert.ok(descriptor, `${callsite.path}:${callsite.line}: missing catalog descriptor`);
    assert.deepEqual({
      port: descriptor.port,
      targetRole: descriptor.targetRole,
      contextClass: descriptor.contextClass,
      purpose: descriptor.purpose,
    }, {
      port: expected.port,
      targetRole: expected.targetRole,
      contextClass: expected.contextClass,
      purpose: expected.purpose,
    }, `${callsite.path}:${callsite.line}: wrong catalog descriptor`);
  }
  assert.deepEqual([...byIdentity.keys()].sort(), [...EXPECTED_ROOTS.keys()].sort(),
    'catalog contains a function-bound root without a production callsite');
}

test('production named-root callsites exactly match the independent capability oracle', () => {
  assertCallsiteCatalog(declaration);
});

test('relation descriptors carry the full exact production runtime-source partition', () => {
  const actual = new Map(Object.values(declaration.portContext.capabilities)
    .filter((descriptor) => descriptor.runtimeSources)
    .map((descriptor) => [
      `${descriptor.port}:${descriptor.runtimeName}`,
      [...descriptor.runtimeSources],
    ]));
  assert.deepEqual(actual, EXPECTED_RUNTIME_SOURCES);
});

test('the oracle reds on identity mutation, a missing descriptor, and a wrong descriptor', () => {
  const find = (candidate, identity) => Object.entries(candidate.portContext.capabilities)
    .find(([, descriptor]) => descriptor.functionIdentity === identity);

  const mutatedIdentity = structuredClone(declaration);
  find(mutatedIdentity, 'app.password_login_acquire(text,text,uuid,text)')[1].functionIdentity =
    'app.password_login_complete(uuid,boolean)';
  assert.throws(() => assertCallsiteCatalog(mutatedIdentity));

  const missing = structuredClone(declaration);
  delete missing.portContext.capabilities.password_login_acquire;
  assert.throws(() => assertCallsiteCatalog(missing));

  const wrong = structuredClone(declaration);
  find(wrong, 'app.password_login_acquire(text,text,uuid,text)')[1].targetRole = 'app_staff';
  assert.throws(() => assertCallsiteCatalog(wrong));

  const wrongPort = structuredClone(declaration);
  find(wrongPort, 'app.password_login_acquire(text,text,uuid,text)')[1].port = 'integrator';
  assert.throws(() => assertCallsiteCatalog(wrongPort));
});

test('the oracle reds on added, moved, removed, extra and cross-port production callsites', () => {
  const discovered = collectNamedRootCallsites();
  const firstLiteralIndex = discovered.findIndex((row) => row.kind === 'literal');
  assert.notEqual(firstLiteralIndex, -1);

  assert.throws(() => assertCallsiteCatalog(declaration, [...discovered, discovered[firstLiteralIndex]]));
  assert.throws(() => assertCallsiteCatalog(
    declaration,
    discovered.filter((_, index) => index !== firstLiteralIndex),
  ));

  const moved = structuredClone(discovered);
  moved[firstLiteralIndex].path = 'apps/integrator/src/infra/db/repos/movedRoot.ts';
  assert.throws(() => assertCallsiteCatalog(declaration, moved));

  const crossPort = structuredClone(discovered);
  crossPort[firstLiteralIndex].port = crossPort[firstLiteralIndex].port === 'webapp'
    ? 'integrator'
    : 'webapp';
  assert.throws(() => assertCallsiteCatalog(declaration, crossPort));

  const extra = structuredClone(discovered);
  extra[firstLiteralIndex].identity = 'app.undeclared_extra_root()';
  assert.throws(() => assertCallsiteCatalog(declaration, extra));
});

test('production discovery is path-independent and excludes tests/generated output', () => {
  const files = PRODUCTION_SOURCE_ROOTS.flatMap(([, root]) => productionSourceFiles(root));
  assert.ok(files.length > 10);
  assert.equal(files.some((path) => TEST_FILE_RE.test(path) || path.includes('/generated/')), false);
  const discovered = collectNamedRootCallsites();
  assert.equal(discovered.filter((row) => row.kind === 'literal').length, 10);
  assert.equal(discovered.filter((row) => row.kind === 'dynamic').length, 1);
});
