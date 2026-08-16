import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalAuditUrl,
  classifyRoute,
  discoverBounded,
  aggregateRoleArtifacts,
  exactUrlMatches,
  evaluatePageObservation,
  routeContractMatches,
  routeTemplateKey,
  shouldIgnoreRequestFailure,
  summarizeBinaryGate,
} from './gate-utils.mjs';
import { ROLE_SCENARIOS } from './scenarios.mjs';

test('preserves tab and section query while redacting only entity identifiers', () => {
  const url =
    '/app/doctor/patients/59fbb0c9-371d-4fcc-8602-78e174c81062?tab=finances&organizationId=f5c1da34-5a25-4ac5-a7c4-74b45cb979ba';
  assert.equal(
    canonicalAuditUrl(url),
    '/app/doctor/patients/:uuid?organizationId=%3Auuid&tab=finances',
  );
});

test('collapses different entity rows to one route template without collapsing semantic tabs', () => {
  const first = routeTemplateKey(
    '/app/doctor/patients/11111111-1111-4111-8111-111111111111?tab=overview',
  );
  const second = routeTemplateKey(
    '/app/doctor/patients/22222222-2222-4222-8222-222222222222?tab=overview',
  );
  const finances = routeTemplateKey(
    '/app/doctor/patients/22222222-2222-4222-8222-222222222222?tab=finances',
  );
  assert.equal(first, second);
  assert.notEqual(first, finances);
});

test('exact URL comparison catches a dropped query parameter', () => {
  assert.equal(
    exactUrlMatches(
      '/app/doctor/schedule?tab=setup&section=locations',
      '/app/doctor/schedule?tab=setup&section=locations',
    ),
    true,
  );
  assert.equal(
    exactUrlMatches(
      '/app/doctor/schedule?tab=setup',
      '/app/doctor/schedule?tab=setup&section=locations',
    ),
    false,
  );
});

test('accepts only a declared dynamic route shape, never an arbitrary redirect', () => {
  assert.equal(
    routeContractMatches(
      '/app/doctor/patients/11111111-1111-4111-8111-111111111111/programs/22222222-2222-4222-8222-222222222222',
      '/app/doctor/patients/11111111-1111-4111-8111-111111111111?tab=program',
      ['/app/doctor/patients/:uuid/programs/:uuid'],
    ),
    true,
  );
  assert.equal(
    routeContractMatches(
      '/app/doctor/patients/11111111-1111-4111-8111-111111111111?tab=overview',
      '/app/doctor/patients/11111111-1111-4111-8111-111111111111?tab=program',
      ['/app/doctor/patients/:uuid/programs/:uuid'],
    ),
    false,
  );
});

test('rejects a shell-only page and a missing functional anchor', () => {
  const shellOnly = evaluatePageObservation({
    responseOk: true,
    urlOk: true,
    visibleFatal: false,
    mainCount: 1,
    anchors: [],
  });
  assert.equal(shellOnly.pass, false);
  assert.deepEqual(shellOnly.reasons, ['route_semantic_contract_missing']);

  const missingAnchor = evaluatePageObservation({
    responseOk: true,
    urlOk: true,
    visibleFatal: false,
    mainCount: 1,
    anchors: [{ name: '#real-control', count: 0, visible: false }],
  });
  assert.equal(missingAnchor.pass, false);
});

test('rejects duplicated controls and captures a real HTTP 5xx on its page', () => {
  const duplicated = evaluatePageObservation({
    responseOk: true,
    urlOk: true,
    visibleFatal: false,
    mainCount: 1,
    anchors: [{ name: '#phone-action', count: 2, visible: false }],
  });
  assert.equal(duplicated.pass, false);

  const serverFailure = evaluatePageObservation({
    responseOk: true,
    urlOk: true,
    visibleFatal: false,
    mainCount: 1,
    anchors: [{ name: '#payment-form', count: 1, visible: true }],
    failures: [{ kind: 'http', status: 503 }],
  });
  assert.equal(serverFailure.pass, false);
  assert.deepEqual(serverFailure.reasons, ['network_failures:1']);
});

test('ignores harness-created aborts only while a harness navigation is active', () => {
  assert.equal(
    shouldIgnoreRequestFailure({ errorText: 'net::ERR_ABORTED', harnessNavigationActive: true }),
    true,
  );
  assert.equal(
    shouldIgnoreRequestFailure({ errorText: 'net::ERR_ABORTED', harnessNavigationActive: false }),
    false,
  );
  assert.equal(
    shouldIgnoreRequestFailure({ errorText: 'net::ERR_FAILED', harnessNavigationActive: true }),
    false,
  );
});

test('binary gate fails for identity, page, action, network, or console evidence', () => {
  const clean = {
    role: 'doctor',
    authenticated: true,
    identity_assertion: { pass: true },
    pages: [{ url: '/app/doctor', pass: true }],
    action_checks: [{ id: 'doctor.schedule', pass: true }],
    failures: [],
    console_errors: [],
  };
  assert.deepEqual(summarizeBinaryGate([clean]), { pass: true, violations: [] });
  const broken = structuredClone(clean);
  broken.pages[0].pass = false;
  assert.equal(summarizeBinaryGate([broken]).pass, false);
  assert.deepEqual(summarizeBinaryGate([clean], ['doctor', 'patient']).violations, [
    'patient:missing_role_artifact',
  ]);
});

test('bounded rendered-link discovery fails closed for a new route and for its cap', () => {
  const scenario = {
    allowedPathnames: ['/app/patient'],
    routeClassifications: [{ template: '/app/patient', classification: 'substantive' }],
  };
  const first = discoverBounded({
    knownTemplates: new Set(['/app/patient']),
    hrefs: ['/app/patient/new-surface'],
    scenario,
    limit: 2,
  });
  assert.equal(first.discovered[0].classification.pass, false);
  assert.equal(first.discovered[0].classification.reason, 'route_unclassified');
  const capped = discoverBounded({
    knownTemplates: new Set(),
    hrefs: ['/app/patient/a', '/app/patient/b'],
    scenario,
    limit: 1,
  });
  assert.deepEqual(capped.violations, ['discovery_cap_exceeded:1']);
});

test('requires an explicit selector contract and one route classification', () => {
  assert.deepEqual(classifyRoute({ routeClassifications: [] }, '/app/patient'), {
    template: '/app/patient', pass: false, reason: 'route_unclassified',
  });
  const ambiguous = classifyRoute({
    routeClassifications: [
      { template: '/app/patient', classification: 'substantive' },
      { template: '/app/patient', classification: 'conditional' },
    ],
  }, '/app/patient');
  assert.equal(ambiguous.reason, 'route_classification_ambiguous');
});

test('aggregate rejects duplicate, stale or incompatible role artifacts instead of last-wins', () => {
  const result = (role, provenance) => ({ role, audit_provenance: provenance });
  const expected = { run_id: 'run-current', base_url: 'http://127.0.0.1:5200', mutations_enabled: false, organization_id: 'org-1' };
  const aggregate = aggregateRoleArtifacts({
    currentResults: [result('doctor', { ...expected })],
    artifacts: [{ results: [result('doctor', { ...expected }), result('patient', { ...expected, run_id: 'run-stale', base_url: 'http://bad' })] }],
    requiredRoles: ['doctor', 'patient', 'global_admin'],
    expected,
  });
  assert.deepEqual(aggregate.violations.sort(), [
    'doctor:duplicate_role_artifact',
    'global_admin:missing_role_artifact',
    'patient:artifact_base_url_mismatch',
    'patient:artifact_run_id_mismatch',
  ]);
});

test('binary gate rejects an unclassified rendered mutating control', () => {
  const result = {
    role: 'patient', authenticated: true, identity_assertion: { pass: true }, pages: [], action_checks: [],
    failures: [], console_errors: [], rendered_controls: [{ id: 'purchase', classification: null }],
  };
  assert.deepEqual(summarizeBinaryGate([result]).violations, ['patient:control_unclassified:purchase']);
});

test('admin discovery starts from clinics and declares every proven alias', () => {
  const admin = ROLE_SCENARIOS.global_admin;
  assert.equal(admin.allowedPathnames.includes('/app/admin/organizations/'), false);
  assert.deepEqual(
    admin.requiredStateSeeds.filter((route) => route.startsWith('/app/admin/booking/') || route === '/app/admin/promo').sort(),
    ['/app/admin/booking/catalog', '/app/admin/booking/form-public', '/app/admin/booking/payments', '/app/admin/promo'],
  );
  assert.equal(classifyRoute(admin, '/app/admin/clinics/11111111-1111-4111-8111-111111111111').pass, true);
});
