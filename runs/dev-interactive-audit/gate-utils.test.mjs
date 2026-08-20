import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  canonicalAuditUrl,
  classifyRenderedControl,
  classifyRoute,
  createPageEvidenceLedger,
  discoverBounded,
  aggregateRoleArtifacts,
  exactUrlMatches,
  evaluatePageObservation,
  listRowNamePattern,
  routePatternMatches,
  routeContractMatches,
  routeTemplateKey,
  shouldIgnoreRequestFailure,
  summarizeBinaryGate,
} from './gate-utils.mjs';
import { DOCTOR_PATIENT_CARD_TABS, ROLE_SCENARIOS } from './scenarios.mjs';
import {
  buildTraversalPlan,
  classifyInventoryLink,
  classifyControlInventory,
  initializeRenderedTraversal,
  missingCanonicalNavigation,
  staticContractViolations,
  validateDoctorPatientTabTraversal,
} from './audit-engine.mjs';

const auditDirectory = dirname(fileURLToPath(import.meta.url));
const productSourceRoot = join(auditDirectory, '../../apps/webapp/src');
const productSources = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  if (entry.isDirectory()) return productSources(path);
  return /\.[cm]?[jt]sx?$/.test(entry.name) && !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)
    ? [{ path, source: readFileSync(path, 'utf8') }]
    : [];
});

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

test('collapses pagination but preserves semantic route state', () => {
  assert.equal(
    routeTemplateKey('/app/patient/diary?week=2026-08-10&tab=wellbeing'),
    '/app/patient/diary?tab=wellbeing&week=%3Asample',
  );
  assert.notEqual(
    routeTemplateKey('/app/patient/diary?week=2026-08-03&tab=wellbeing'),
    routeTemplateKey('/app/patient/diary?week=2026-08-03&tab=symptoms'),
  );
});

test('matches explicit dynamic route contracts without weakening query-state matching', () => {
  assert.equal(routePatternMatches('/app/patient/content/:slug', '/app/patient/content/daily-warmup'), true);
  assert.equal(
    routePatternMatches('/app/doctor/patients/:uuid?tab=finances', '/app/doctor/patients/11111111-1111-4111-8111-111111111111?tab=overview'),
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

test('a state seed without an explicit route disposition and semantic contract is red', () => {
  const scenario = {
    requiredStateSeeds: ['/app/patient/messages'],
    routeClassifications: [],
  };
  assert.equal(classifyRoute(scenario, '/app/patient/messages').reason, 'route_unclassified');
  const noContract = classifyRoute(
    { routeClassifications: [{ template: '/app/patient/messages', classification: 'substantive' }] },
    '/app/patient/messages',
  );
  assert.equal(noContract.reason, 'route_semantic_contract_missing');
});

test('rejects generic message textarea and accepts only the route-specific message contract', () => {
  const generic = classifyRoute(
    {
      routeClassifications: [{
        template: '/app/patient/messages', classification: 'substantive', semanticContract: { selectors: ['textarea'] },
      }],
    },
    '/app/patient/messages',
  );
  assert.equal(generic.reason, 'route_semantic_contract_generic');
  assert.equal(
    classifyRoute(ROLE_SCENARIOS.patient, '/app/patient/messages').pass,
    true,
  );
});

test('rejects generic standalone text as a substantive route contract', () => {
  const generic = classifyRoute({
    routeClassifications: [{
      template: '/app/patient/empty', classification: 'substantive',
      semanticContract: { selectors: [{ kind: 'text', text: 'Сохранить' }] },
    }],
  }, '/app/patient/empty');
  assert.equal(generic.reason, 'route_semantic_contract_generic');
});

test('a route adapter cannot classify a different rendered control', () => {
  const adapters = [{
    role: 'patient', route: '/app/patient/reminders', controlKind: 'switch', controlId: 'program-reminder-toggle', disposition: 'reversible_adapter',
  }];
  assert.equal(
    classifyRenderedControl({ role: 'patient', route: '/app/patient/reminders', kind: 'switch', identity: 'irreversible-delete' }, adapters),
    null,
  );
  assert.equal(
    classifyRenderedControl({ role: 'patient', route: '/app/patient/reminders', kind: 'switch', identity: 'program-reminder-toggle' }, adapters),
    'reversible_adapter',
  );
});

test('doctor card and program detail require rendered, explicitly contracted dynamic hrefs', () => {
  const doctor = ROLE_SCENARIOS.doctor;
  const hrefs = [
    'http://127.0.0.1:5200/app/doctor/patients/11111111-1111-4111-8111-111111111111?tab=overview',
    'http://127.0.0.1:5200/app/doctor/patients/11111111-1111-4111-8111-111111111111/programs/22222222-2222-4222-8222-222222222222',
  ];
  const discovered = discoverBounded({
    knownTemplates: new Set(['/app/doctor/patients']), hrefs, scenario: doctor, limit: 2,
  });
  assert.deepEqual(discovered.discovered.map((item) => item.classification.pass), [true, true]);
  const missingProgram = discoverBounded({
    knownTemplates: new Set(['/app/doctor/patients']), hrefs: [hrefs[0]], scenario: doctor, limit: 2,
  });
  assert.equal(missingProgram.discovered.some((item) => item.template.includes('/programs/')), false);
});

test('bounded traversal never discovers a foreign-origin doctor patient link', () => {
  const discovery = discoverBounded({
    knownTemplates: new Set(['/app/doctor/patients']),
    hrefs: ['https://evil.example/app/doctor/patients/11111111-1111-4111-8111-111111111111?tab=overview'],
    scenario: ROLE_SCENARIOS.doctor,
    limit: 1,
  });
  assert.deepEqual(discovery, { discovered: [], violations: [] });
});

test('late request remains with A and console without a proven origin fails globally during B', () => {
  const ledger = createPageEvidenceLedger();
  const request = {};
  ledger.begin('/app/patient/a');
  ledger.ownRequest(request);
  ledger.end();
  ledger.begin('/app/patient/b');
  ledger.recordRequest(request, { kind: 'http', status: 500 });
  ledger.recordConsole({ message: 'B error' }, '/app/patient/b');
  assert.deepEqual(ledger.snapshot('/app/patient/a').failures, [{ kind: 'http', status: 500 }]);
  assert.deepEqual(ledger.snapshot('/app/patient/b').failures, []);
  assert.deepEqual(ledger.snapshot('/app/patient/b').consoleErrors, [{ message: 'B error' }]);
  ledger.end();
  ledger.recordConsole({ message: 'late unknown error' }, null);
  assert.equal(ledger.unattributed.length, 1);
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

test('aggregate derives the shared tenant from doctor and patient while preserving global-admin null', () => {
  const provenance = (organization_id) => ({
    run_id: 'run-current', base_url: 'http://127.0.0.1:5200', mutations_enabled: false, organization_id,
  });
  const result = (role, organization_id) => ({ role, audit_provenance: provenance(organization_id) });
  const aggregate = aggregateRoleArtifacts({
    currentResults: [result('global_admin', null), result('doctor', 'org-1'), result('patient', 'org-1')],
    artifacts: [], requiredRoles: ['global_admin', 'doctor', 'patient'],
    expected: { ...provenance(null) },
  });
  assert.deepEqual(aggregate.violations, []);
  assert.equal(aggregate.organization_id, 'org-1');

  const adminTenantLeak = aggregateRoleArtifacts({
    currentResults: [result('global_admin', 'org-1'), result('doctor', 'org-1'), result('patient', 'org-1')],
    artifacts: [], requiredRoles: ['global_admin', 'doctor', 'patient'], expected: { ...provenance(null) },
  });
  assert.deepEqual(adminTenantLeak.violations, ['global_admin:artifact_organization_id_mismatch']);

  const explicitTenantMismatch = aggregateRoleArtifacts({
    currentResults: [result('global_admin', null), result('doctor', 'org-actual'), result('patient', 'org-actual')],
    artifacts: [], requiredRoles: ['global_admin', 'doctor', 'patient'],
    expected: { ...provenance('org-required') },
  });
  assert.deepEqual(explicitTenantMismatch.violations, [
    'doctor:artifact_organization_id_mismatch',
    'patient:artifact_organization_id_mismatch',
  ]);
});

test('binary gate rejects an unclassified rendered mutating control', () => {
  const result = {
    role: 'patient', authenticated: true, identity_assertion: { pass: true }, pages: [], action_checks: [],
    failures: [], console_errors: [], rendered_controls: [{ kind: 'button', identity: 'purchase', classification: null }],
  };
  assert.deepEqual(summarizeBinaryGate([result]).violations, ['patient:control_unclassified:button:purchase']);
});

test('the 64-route census has exactly one explicit, route-specific contract per state', () => {
  const seeds = Object.values(ROLE_SCENARIOS).flatMap((scenario) => scenario.requiredStateSeeds);
  assert.equal(seeds.length, 64);
  for (const scenario of Object.values(ROLE_SCENARIOS)) {
    for (const route of scenario.requiredStateSeeds) {
      assert.equal(classifyRoute(scenario, route).pass, true, route);
    }
  }
});

test('runner static contract gate rejects an invented selector while real contracts map to product primitives', () => {
  const source = [
    { path: '/repo/apps/webapp/src/app/app/doctor/invented/page.tsx', source: '<section id="real-product-surface" />' },
    { path: '/repo/apps/webapp/src/app/app/doctor/real/page.tsx', source: '<section id="real-product-surface" />' },
  ];
  const invented = {
    doctor: {
      routeClassifications: [{
        template: '/app/doctor/invented',
        classification: 'substantive',
        semanticContract: { selectors: ['#invented-route-anchor'] },
      }],
    },
  };
  assert.deepEqual(staticContractViolations(invented, source), [
    'doctor:/app/doctor/invented:product_semantic_primitive_missing:invented-route-anchor',
  ]);
  assert.deepEqual(staticContractViolations({ doctor: {
    routeClassifications: [{
      template: '/app/doctor/real', classification: 'substantive',
      semanticContract: { selectors: ['#real-product-surface'] },
    }],
  } }, source), []);
  assert.deepEqual(
    staticContractViolations(ROLE_SCENARIOS, productSources(productSourceRoot), DOCTOR_PATIENT_CARD_TABS),
    [],
  );
});

test('runner static contract gate rejects a selector exported only by another route owner', () => {
  const sources = [
    { path: '/repo/apps/webapp/src/app/app/patient/empty/page.tsx', source: '<section id="patient-empty" />' },
    { path: '/repo/apps/webapp/src/app/app/patient/other/page.tsx', source: '<section id="other-route-anchor" />' },
  ];
  const scenario = { patient: { routeClassifications: [{
    template: '/app/patient/empty', classification: 'substantive',
    semanticContract: { selectors: ['#other-route-anchor'] },
  }] } };
  assert.deepEqual(staticContractViolations(scenario, sources), [
    'patient:/app/patient/empty:product_semantic_primitive_missing:other-route-anchor',
  ]);
});

test('runner static contract gate rejects a child-only anchor but reaches an explicitly imported component', () => {
  const sources = [
    { path: '/repo/apps/webapp/src/app/app/patient/parent/page.tsx', source: "import ParentPanel from './ParentPanel'; export default function Page() { return <ParentPanel />; }" },
    { path: '/repo/apps/webapp/src/app/app/patient/parent/ParentPanel.tsx', source: '<section id="parent-component-anchor" />' },
    { path: '/repo/apps/webapp/src/app/app/patient/parent/child/page.tsx', source: '<section id="child-only-anchor" />' },
  ];
  const scenario = (anchor) => ({ patient: { routeClassifications: [{
    template: '/app/patient/parent', classification: 'substantive', semanticContract: { selectors: [anchor] },
  }] } });
  assert.deepEqual(staticContractViolations(scenario('#child-only-anchor'), sources), [
    'patient:/app/patient/parent:product_semantic_primitive_missing:child-only-anchor',
  ]);
  assert.deepEqual(staticContractViolations(scenario('#parent-component-anchor'), sources), []);
});

test('canonical navigation is distinct from query-state seeds and a missing manifest destination is red', () => {
  const scenario = ROLE_SCENARIOS.doctor;
  const plan = buildTraversalPlan(scenario, 'http://127.0.0.1:5200');
  assert.equal(plan.stateSeeds.some((route) => route.includes('lfk-templates')), false);
  assert.equal(plan.stateSeeds.some((route) => route.includes('section=locations')), true);
  const rendered = scenario.canonicalNavigationDestinations
    .filter((route) => route !== '/app/doctor/lfk-templates')
    .map((route) => `http://127.0.0.1:5200${route}`);
  const traversal = initializeRenderedTraversal({
    scenario,
    baseUrl: 'http://127.0.0.1:5200',
    navigationHrefs: rendered,
  });
  assert.equal(traversal.queue.some((route) => route.includes('/app/doctor/lfk-templates')), false);
  assert.deepEqual(missingCanonicalNavigation(scenario, traversal.canonicalNavigationSeen), ['/app/doctor/lfk-templates']);
  for (const route of scenario.canonicalNavigationDestinations) {
    assert.equal(classifyRoute(scenario, route).pass, true, `canonical ${route}`);
  }
});

test('the runner inventory rejects text/index fallback, duplicates, and every actionable kind', () => {
  const adapters = [{ role: 'doctor', route: '/app/doctor', controlKind: 'switch', controlId: 'stable-switch', disposition: 'non_mutating' }];
  const controls = classifyControlInventory([
    { kind: 'button', id: 'save' }, { kind: 'link', name: 'patient-link' },
    { kind: 'switch', ariaLabel: 'stable-switch' }, { kind: 'checkbox', id: 'flag' },
    { kind: 'radio', id: 'choice' }, { kind: 'combobox', id: 'select' },
    { kind: 'editable', id: 'note' }, { kind: 'editable' }, { kind: 'switch', ariaLabel: 'stable-switch' },
  ], 'doctor', '/app/doctor', adapters, classifyRenderedControl);
  assert.equal(controls.filter((control) => control.kind === 'editable').length, 2);
  assert.equal(controls.find((control) => control.identity === null)?.classification, null);
  assert.equal(controls.filter((control) => control.identity === 'stable-switch').every((control) => control.duplicate), true);
});

test('rendered links require explicit safe disposition before the binary gate accepts them', () => {
  const scenario = {
    allowedPathnames: ['/app/patient'],
    routeClassifications: [{
      template: '/app/patient/diary', classification: 'substantive',
      semanticContract: { selectors: ['#patient-diary'] },
    }],
  };
  const controls = classifyControlInventory([
    { kind: 'link', ariaLabel: 'Дневник', href: 'http://127.0.0.1:5200/app/patient/diary' },
    { kind: 'link', ariaLabel: 'Evil external', href: 'https://evil.example/app/patient/treatment' },
    { kind: 'link', ariaLabel: 'Unregistered mail', href: 'mailto:evil@example.test' },
    { kind: 'link', ariaLabel: 'Unregistered phone', href: 'tel:+79990000000' },
    { kind: 'link', ariaLabel: 'Cross-role doctor', href: 'http://127.0.0.1:5200/app/doctor' },
    { kind: 'link', ariaLabel: 'Logout', href: 'http://127.0.0.1:5200/app/logout' },
  ], 'patient', '/app/patient', [], classifyRenderedControl, {
    scenario,
    observedTemplates: new Set(['/app/patient/diary']),
  });
  assert.deepEqual(controls.map((control) => control.classification), [
    'inspected_navigation',
    null,
    null,
    null,
    null,
    null,
  ]);
  const binaryResult = (control) => summarizeBinaryGate([{
    role: 'patient', authenticated: true, identity_assertion: { pass: true }, pages: [], action_checks: [],
    failures: [], console_errors: [], rendered_controls: [control],
  }]);
  for (const control of controls.slice(1)) assert.equal(binaryResult(control).pass, false, control.href);

  const safeManualAdapter = [{
    id: 'patient.support-phone',
    role: 'patient',
    route: '/app/patient/help',
    controlKind: 'link',
    controlId: 'Поддержка по телефону',
    href: 'tel:+78005553535',
    disposition: 'external_manual_only',
    reason: 'opens the documented support phone without changing product state',
  }];
  const safeManual = classifyInventoryLink({
    node: { kind: 'link', ariaLabel: 'Поддержка по телефону', href: 'tel:+78005553535' },
    role: 'patient', route: '/app/patient/help', scenario, observedTemplates: new Set(),
    adapters: safeManualAdapter, classify: classifyRenderedControl,
  });
  assert.equal(safeManual, 'external_manual_only');
  assert.equal(binaryResult({ kind: 'link', identity: 'Поддержка по телефону', classification: safeManual }).pass, true);
  assert.equal(classifyInventoryLink({
    node: { kind: 'link', ariaLabel: 'Поддержка по телефону', href: 'tel:+78005550000' },
    role: 'patient', route: '/app/patient/help', scenario, observedTemplates: new Set(),
    adapters: safeManualAdapter, classify: classifyRenderedControl,
  }), null);
  assert.equal(classifyInventoryLink({
    node: { kind: 'link', ariaLabel: 'Поддержка по телефону', href: 'tel:+78005553535' },
    role: 'patient', route: '/app/patient/help', scenario, observedTemplates: new Set(),
    adapters: [{ ...safeManualAdapter[0], reason: '' }], classify: classifyRenderedControl,
  }), null);
});

test('eight patient-card tab contracts and program href are fail-closed at runner engine boundary', () => {
  const expected = [
    ['overview'], ['karta'], ['program'], ['records'], ['files'], ['comms'], ['finances'], ['account'],
  ];
  const all = expected.map(([tab]) => ({ tab, pass: true }));
  assert.deepEqual(validateDoctorPatientTabTraversal({
    expectedTabs: expected,
    tabProofs: all,
    programHref: '/app/doctor/patients/11111111-1111-4111-8111-111111111111/programs/22222222-2222-4222-8222-222222222222',
  }), { pass: true, violations: [] });
  const lateProgram = validateDoctorPatientTabTraversal({
    expectedTabs: expected,
    tabProofs: all.filter((proof) => proof.tab !== 'files'),
    programHref: null,
  });
  assert.deepEqual(lateProgram.violations, [
    'doctor_patient_tab_missing_or_failed:files',
    'rendered_program_detail_href_missing_while_program_tab_active',
  ]);
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

test('accepts a rendered on-support marker but not another patient identity', () => {
  const pattern = listRowNamePattern('Берсон Дмитрий');
  assert.equal(pattern.test('Берсон Дмитрий★'), true);
  assert.equal(pattern.test('Берсон Дмитрий Юрьевич★'), false);
  assert.equal(pattern.test('Не Берсон Дмитрий'), false);
});

test('escapes regex metacharacters in the expected patient name', () => {
  const pattern = listRowNamePattern('A.B (C)');
  assert.equal(pattern.test('A.B (C)★'), true);
  assert.equal(pattern.test('AXB (C)'), false);
});
