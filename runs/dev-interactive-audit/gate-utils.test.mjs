import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalAuditUrl,
  exactUrlMatches,
  evaluatePageObservation,
  listRowNamePattern,
  routeContractMatches,
  routePatternMatches,
  routeTemplateKey,
  shouldIgnoreRequestFailure,
  summarizeBinaryGate,
} from './gate-utils.mjs';

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

test('collapses temporal pagination without collapsing semantic route state', () => {
  assert.equal(
    routeTemplateKey('/app/patient/diary?week=2026-08-10&tab=wellbeing'),
    '/app/patient/diary?tab=wellbeing&week=%3Asample',
  );
  assert.equal(
    routeTemplateKey('/app/patient/diary?week=2026-08-03&tab=wellbeing'),
    '/app/patient/diary?tab=wellbeing&week=%3Asample',
  );
  assert.notEqual(
    routeTemplateKey('/app/patient/diary?week=2026-08-03&tab=wellbeing'),
    routeTemplateKey('/app/patient/diary?week=2026-08-03&tab=symptoms'),
  );
});

test('matches explicit dynamic route contracts without weakening query-state matching', () => {
  assert.equal(
    routePatternMatches(
      '/app/patient/content/:slug',
      '/app/patient/content/daily-warmup',
    ),
    true,
  );
  assert.equal(
    routePatternMatches(
      '/app/doctor/patients/:uuid?tab=finances',
      '/app/doctor/patients/11111111-1111-4111-8111-111111111111?tab=finances',
    ),
    true,
  );
  assert.equal(
    routePatternMatches(
      '/app/doctor/patients/:uuid?tab=finances',
      '/app/doctor/patients/11111111-1111-4111-8111-111111111111?tab=overview',
    ),
    false,
  );
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

  const consoleWarning = evaluatePageObservation({
    responseOk: true,
    urlOk: true,
    visibleFatal: false,
    mainCount: 1,
    anchors: [{ name: '#diary-chart', count: 1, visible: true }],
    consoleWarnings: [{ message: 'chart has invalid dimensions' }],
  });
  assert.deepEqual(consoleWarning.reasons, ['console_warnings:1']);
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
  assert.equal(
    shouldIgnoreRequestFailure({
      errorText: 'net::ERR_ABORTED',
      harnessNavigationActive: false,
      url: 'http://127.0.0.1:5200/app/patient?_rsc=prefetch',
      resourceType: 'fetch',
    }),
    true,
  );
  assert.equal(
    shouldIgnoreRequestFailure({
      errorText: 'net::ERR_ABORTED',
      harnessNavigationActive: false,
      url: 'http://127.0.0.1:5200/api/patient/messages',
      resourceType: 'fetch',
    }),
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
  const warning = structuredClone(clean);
  warning.console_warnings = [{ message: 'runtime warning' }];
  assert.deepEqual(summarizeBinaryGate([warning]).violations, [
    'doctor:console_warning',
  ]);
  const incomplete = structuredClone(clean);
  incomplete.complete = false;
  assert.deepEqual(summarizeBinaryGate([incomplete]).violations, ['doctor:incomplete']);
  assert.deepEqual(summarizeBinaryGate([clean], ['doctor', 'patient']).violations, [
    'patient:missing_role_artifact',
  ]);
});

test('accepts a list row whose name carries the on-support marker and rejects a different person', () => {
  const pattern = listRowNamePattern('Берсон Дмитрий');
  // Rendered by DoctorCommentsTab PatientRow: the name span also contains the «★» marker.
  assert.equal(pattern.test('Берсон Дмитрий★'), true);
  assert.equal(pattern.test('Берсон Дмитрий'), true);
  // A different person must never satisfy the exact-identity contract.
  assert.equal(pattern.test('Берсон Дмитрий Юрьевич'), false);
  assert.equal(pattern.test('Берсон Дмитрий Юрьевич★'), false);
  assert.equal(pattern.test('Не Берсон Дмитрий'), false);
});

test('escapes regex metacharacters in the expected name instead of interpreting them', () => {
  const pattern = listRowNamePattern('A.B (C)');
  assert.equal(pattern.test('A.B (C)★'), true);
  assert.equal(pattern.test('AXB (C)'), false);
});
