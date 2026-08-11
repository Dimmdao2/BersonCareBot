import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

import { declaration } from './declaration.ts';

const CALLSITE_FILES = [
  ['integrator', 'apps/integrator/src/infra/db/repos/outgoingDeliveryScope.ts'],
  ['integrator', 'apps/integrator/src/infra/db/repos/schedulerReminderOrganizations.ts'],
  ['integrator', 'apps/integrator/src/infra/db/repos/appointmentReminderDelivery.ts'],
  ['webapp', 'apps/webapp/src/infra/repos/pgPasswordLoginProtection.ts'],
];

const EXPECTED_ROOTS = new Map(Object.entries({
  'app.password_login_acquire(text,text,uuid,text)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.password.acquire', argCount: 4,
  },
  'app.password_login_complete(uuid,boolean)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.password.complete', argCount: 2,
  },
  'app.password_login_read_altcha_secret()': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.password.altcha-secret', argCount: 0,
  },
  'app.password_login_issue_altcha_challenge(text,uuid,text,timestamp with time zone)': {
    port: 'webapp', targetRole: 'app_pre_session', contextClass: 'pre_session',
    purpose: 'auth.password.altcha-issue', argCount: 4,
  },
  'app.resolve_outgoing_delivery_scope(uuid)': {
    port: 'integrator', targetRole: 'app_operational_delivery_worker', contextClass: 'service',
    purpose: 'delivery.resolve-scope', argCount: 1,
  },
  'app.operator_incident_alert_already_sent(uuid)': {
    port: 'integrator', targetRole: 'app_operational_delivery_worker', contextClass: 'service',
    purpose: 'delivery.incident-alert-status', argCount: 1,
  },
  'app.mark_operator_incident_alert_sent(uuid)': {
    port: 'integrator', targetRole: 'app_operational_delivery_worker', contextClass: 'service',
    purpose: 'delivery.incident-alert-mark', argCount: 1,
  },
  'app.list_scheduler_reminder_organization_ids()': {
    port: 'integrator', targetRole: 'app_operational_scheduler', contextClass: 'service',
    purpose: 'scheduler.reminder-organizations', argCount: 0,
  },
  'app.revalidate_appointment_reminder_materialization(uuid)': {
    port: 'integrator', targetRole: 'app_operational_delivery_worker', contextClass: 'service',
    purpose: 'delivery.appointment-reminder-revalidate', argCount: 1,
  },
  'app.advance_appointment_reminder_messenger_ladder(uuid,integer,text)': {
    port: 'integrator', targetRole: 'app_operational_delivery_worker', contextClass: 'service',
    purpose: 'delivery.appointment-reminder-advance', argCount: 3,
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
  'webapp:service': ['webapp-health-check', 'api/health:GET'],
}));

function collectNamedRootCallsites() {
  const result = [];
  for (const [port, path] of CALLSITE_FILES) {
    const source = ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    function visit(node) {
      if (ts.isCallExpression(node)
        && ts.isIdentifier(node.expression)
        && ['runIntegratorNamedRoot', 'runWebappNamedRoot'].includes(node.expression.text)) {
        const identity = node.arguments[1];
        const typedArgs = node.arguments[2];
        assert.ok(ts.isStringLiteralLike(identity), `${path}: named root identity must be a literal`);
        assert.ok(ts.isArrayLiteralExpression(typedArgs), `${path}: typed arguments must be an array literal`);
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        result.push({ port, path, line, identity: identity.text, argCount: typedArgs.elements.length });
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return result;
}

function assertCallsiteCatalog(candidate) {
  const callsites = collectNamedRootCallsites();
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
});
