#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const files = {
  a1Doc: 'docs/_TODO/SAAS_FOUNDATION/SAAS_PRODUCT_SMOKE_A1.md',
  fixtureOperatorPacket: 'docs/_TODO/SAAS_FOUNDATION/SAAS_PRODUCT_SMOKE_FIXTURE_OPERATOR_PACKET.md',
  roadmap: 'docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md',
  hardProtocol: 'docs/_TODO/SAAS_FOUNDATION/HARD_MIGRATION_PROTOCOL.md',
  tenantLog: 'docs/_TODO/SAAS_FOUNDATION/TENANT_HARD_MODE_LOG.md',
  deployTestSaas: 'deploy/host/deploy-test-saas.sh',
  contract: 'docs/_TODO/SAAS_FOUNDATION/saas-product-smoke-contract.json',
  smokeRunner: 'docs/_TODO/SAAS_FOUNDATION/scripts/smoke-saas-product.mjs',
};

function read(path) {
  return readFileSync(resolve(path), 'utf8');
}

function requireFragments(label, text, fragments) {
  const missing = fragments.filter((fragment) => !text.includes(fragment));
  if (missing.length > 0) {
    throw new Error(
      `${label} missing required fixture-gate fragment(s):\n- ${missing.join('\n- ')}`,
    );
  }
}

function runFixtureGateDocChecks(overrides = new Map()) {
  const load = (path) => overrides.get(path) ?? read(path);
  const a1Doc = load(files.a1Doc);
  const fixtureOperatorPacket = load(files.fixtureOperatorPacket);
  const roadmap = load(files.roadmap);
  const hardProtocol = load(files.hardProtocol);
  const tenantLog = load(files.tenantLog);
  const deployTestSaas = load(files.deployTestSaas);
  const smokeRunner = load(files.smokeRunner);

  requireFragments(files.a1Doc, a1Doc, [
    '## D3.0 Fixture Gate Contract',
    '`SAAS_PRODUCT_SMOKE_FIXTURE` unset means **SKIPPED/BLOCKED**, never PASS.',
    'owner/operator-managed',
    '--fixture-file=/run/bersoncarebot/saas-smoke.fixture',
    'must not read `/opt/env`, TEST/prod databases',
    'SAAS_PRODUCT_SMOKE_FIXTURE_OPERATOR_PACKET.md',
    'not D3/R1/R2 PASS evidence',
    '## D3.3 Meaningful JSON Evidence',
    'Empty or mismatched fixture facts keep D3/R1/R2 blocked',
    '"publicBookingBranchId": "opaque-branch-id"',
    '"publicBookingClinicServiceId": "opaque-clinic-service-id"',
  ]);

  requireFragments(files.fixtureOperatorPacket, fixtureOperatorPacket, [
    '# SaaS Product Smoke Fixture Operator Packet',
    'not D3, R1, or R2\nPASS evidence',
    '/run/bersoncarebot/saas-smoke.fixture',
    'REDACTED_PLACEHOLDER_NON_RUNNABLE',
    'REDACTED_OPAQUE_TEST_REF_NON_RUNNABLE',
    '--check-fixture',
    '--mode=locked',
    '--base-url=https://test.bersoncare.ru',
    'Do not use dev auth bypass on TEST.',
    'Do not read `/opt/env`',
    'Do not manually clean up DB rows',
    'Do not trigger real delivery beyond owner-approved TEST send-safety.',
    'public profile must have no headers',
    'never the rendered ref values',
    'Successful offline preflight means only',
    'D3/R1/R2 product-smoke PASS requires actual live smoke command output with exit 0.',
    '"publicBookingBranchId": "REDACTED_OPAQUE_TEST_REF_NON_RUNNABLE"',
    '"publicBookingClinicServiceId": "REDACTED_OPAQUE_TEST_REF_NON_RUNNABLE"',
  ]);

  requireFragments(files.roadmap, roadmap, [
    // The R1/R2 finish line was rewritten 2026-07-15 (owner: no prod cutover; TEST-first, then a
    // fresh new-domain copy). The two fragments previously pinned here quoted the superseded
    // cutover wording. The RULE they protected — a missing fixture is SKIPPED/BLOCKED, never PASS —
    // is unchanged and is now stated once for both R1 and R2; only the prose moved.
    'If the\noperator-managed fixture is absent, product smoke is **SKIPPED/BLOCKED**, not PASS.',
    'Confirm an owner/operator-managed product smoke fixture file path is supplied.',
    'If the fixture is absent, record\n  **SKIPPED/BLOCKED** and stop before claiming D3/R1/R2 evidence.',
    '`SAAS_PRODUCT_SMOKE_FIXTURE` unset is a documented blocker,\nnot a successful D3 exit.',
  ]);

  requireFragments(files.hardProtocol, hardProtocol, [
    'A1/product smoke when `SAAS_PRODUCT_SMOKE_FIXTURE` is supplied',
    "If `SAAS_PRODUCT_SMOKE_FIXTURE` is unset, the wrapper's product smoke line is **SKIPPED/BLOCKED** for product parity",
    'D3/R1/R2 product-smoke evidence remains open',
    'owner/operator-managed secret file path outside the repo',
  ]);

  requireFragments(files.deployTestSaas, deployTestSaas, [
    'local fixture_path="${SAAS_PRODUCT_SMOKE_FIXTURE:-/run/bersoncarebot/saas-smoke.fixture}"',
    'assert_locked_product_smoke_fixture_ready',
    'fixture_path="$LOCKED_PRODUCT_SMOKE_FIXTURE_CANONICAL"',
    'bash "$validator" --validate "$fixture_path" "$SRC_REPO" "$DEPLOY_REPO"',
    '--fixture-file="$fixture_path"',
  ]);

  requireFragments(files.smokeRunner, smokeRunner, [
    "const responseError = Object.hasOwn(value, 'error') ? value.error : undefined;",
    'responseError !== null && responseError !== undefined',
    'function isMeaningfulRequiredValue(value)',
    '!isMeaningfulRequiredValue(found.value)',
    'const keyedValue = found.value[fixtureKey];',
    '!isMeaningfulRequiredValue(keyedValue)',
    "actor === 'public' ? headerEntries.length === 0 : headerEntries.length > 0",
    "'public auth profile must not contain auth headers'",
    'profile.adminMode === true',
    'scenario.expectAuthDenial === true && status === expectedStatus',
    'function browserMutationHeadersForBaseUrl(baseUrl, method)',
    'return { Origin: parsedBaseUrl.origin };',
    'Object.assign(headers, browserMutationHeadersForBaseUrl(baseUrl, scenario.method));',
    'mutation smoke must send only the canonical base URL Origin header',
    'read-only smoke must not synthesize mutation browser headers',
    'canonical global-admin clinical-write denial scenario is required',
    'canonical global-admin denial must reject csrf_origin_forbidden',
    "redirect: 'manual'",
    'path: scenario.path',
    "name: 'object expectation rejects object-valued error'",
    "name: 'required path rejects empty string'",
    "name: 'required path rejects empty object'",
    "name: 'discussion summary rejects null fixture item fact'",
    "name: 'discussion summary rejects empty fixture item fact'",
    "name: 'playback fixtureEquals rejects mismatched mediaFileId'",
    "name: 'playback fixtureEquals rejects missing mediaFileId'",
    "name: 'playback rejects invalid delivery descriptor'",
    "name: 'playback rejects URL for different media fixture'",
  ]);

  requireFragments(files.tenantLog, tenantLog, [
    'D3.2 product-smoke fixture operator packet',
    'REDACTED non-runnable placeholders',
    'D3 real execution remains blocked until owner/operator supplies a readable fixture path and authorizes live TEST smoke.',
    'D3.0 product-smoke fixture gate contract',
    'missing `SAAS_PRODUCT_SMOKE_FIXTURE` is `SKIPPED/BLOCKED`, not PASS',
    'Remaining blocker for D3 real execution',
  ]);

  const contract = JSON.parse(load(files.contract));
  const patientMediaPlayback = contract.readOnlyScenarios?.find(
    (scenario) => scenario.id === 'patient.media.playback',
  );
  if (patientMediaPlayback?.actor !== 'patient') {
    throw new Error(
      `${files.contract} must run patient.media.playback as the patient actor; a staff actor would mask the D3 patient wall`,
    );
  }

  const scenariosById = new Map(
    contract.readOnlyScenarios.map((scenario) => [scenario.id, scenario]),
  );
  const systemHealth = scenariosById.get('global-admin.system-health.api');
  if (
    systemHealth?.actor !== 'global_admin' ||
    !systemHealth.jsonExpectation?.requiredPaths?.includes('saasIsolation.schemaVersion') ||
    !systemHealth.jsonExpectation?.requiredPaths?.includes('saasIsolation.coverageComplete') ||
    !systemHealth.jsonExpectation?.requiredPaths?.includes('saasIsolation.trend.daily7Days')
  ) {
    throw new Error(`${files.contract} must probe versioned SaaS isolation health as global_admin`);
  }
  const specialistEngagementAnalytics = scenariosById.get(
    'doctor.analytics.patient-engagement',
  );
  if (
    !['doctor', 'clinic_admin'].includes(specialistEngagementAnalytics?.actor) ||
    specialistEngagementAnalytics?.category !== 'analytics' ||
    specialistEngagementAnalytics?.method !== 'GET' ||
    specialistEngagementAnalytics?.path !==
      '/api/doctor/treatment-program-instances/{patientProgramInstanceId}/action-log' ||
    specialistEngagementAnalytics.path.startsWith('/api/admin') ||
    specialistEngagementAnalytics.path.startsWith('/app/doctor/analytics') ||
    specialistEngagementAnalytics.expectStatus !== 200 ||
    specialistEngagementAnalytics.jsonExpectation?.requireSuccess !== true ||
    !specialistEngagementAnalytics.jsonExpectation?.nonEmptyPaths?.includes('entries')
  ) {
    throw new Error(
      `${files.contract} must prove non-empty tenant-scoped specialist patient engagement analytics without an admin API or the mixed global analytics page`,
    );
  }
  for (const scenarioId of ['doctor.system-health.denied', 'clinic-admin.system-health.denied']) {
    const scenario = scenariosById.get(scenarioId);
    if (scenario?.expectStatus !== 403 || scenario.expectAuthDenial !== true) {
      throw new Error(
        `${files.contract} must keep ${scenarioId} as an explicit negative authorization probe`,
      );
    }
  }
  const clinicalWriteDenied = contract.mutationScenarios.find(
    (scenario) => scenario.id === 'global-admin.clinical-write.denied',
  );
  const exactClinicalWriteDenials = [
    'doctor_workspace_membership_required',
    'forbidden',
  ];
  if (
    clinicalWriteDenied?.actor !== 'global_admin' ||
    clinicalWriteDenied.category !== 'bookings' ||
    clinicalWriteDenied.method !== 'POST' ||
    clinicalWriteDenied.path !==
      '/api/doctor/booking-engine/appointments/{clinicAAppointmentId}/comments' ||
    clinicalWriteDenied.expectStatus !== 403 ||
    clinicalWriteDenied.expectAuthDenial !== true ||
    clinicalWriteDenied.disabledByDefault !== true ||
    JSON.stringify(clinicalWriteDenied.expectedErrorValues) !==
      JSON.stringify(exactClinicalWriteDenials)
  ) {
    throw new Error(
      `${files.contract} must keep global-admin.clinical-write.denied bound to the exact tenant authorization denial contract`,
    );
  }
  for (const scenarioId of [
    'public.app.entry',
    'public.login.config',
    'public.specialist-clinic-registration.entry',
    'public.booking.entry',
  ]) {
    if (scenariosById.get(scenarioId)?.actor !== 'public') {
      throw new Error(`${files.contract} must run ${scenarioId} with the no-cookie public profile`);
    }
  }
  const publicAppEntry = scenariosById.get('public.app.entry');
  if (
    publicAppEntry?.path !== '/app' ||
    !publicAppEntry.bodyIncludes?.includes('app-entry-content')
  ) {
    throw new Error(
      `${files.contract} must assert a server-rendered /app marker instead of client-hydrated login copy`,
    );
  }
  const specialistSignupEntry = scenariosById.get(
    'public.specialist-clinic-registration.entry',
  );
  if (
    specialistSignupEntry?.path !== '/api/auth/login/alternatives-config' ||
    specialistSignupEntry.jsonExpectation?.requireSuccess !== true ||
    !specialistSignupEntry.jsonExpectation.allowedValues?.some(
      (check) =>
        check.path === 'specialistSignupEnabled' &&
        check.values?.length === 1 &&
        check.values[0] === true,
    )
  ) {
    throw new Error(
      `${files.contract} must prove specialist signup through its safe public config boolean`,
    );
  }
  for (const [scenarioId, path] of [
    ['doctor.working-hours.api', 'rows'],
    ['doctor.appointments.list', 'appointments'],
    ['public.booking.slots', 'slots'],
  ]) {
    const expectation = scenariosById.get(scenarioId)?.jsonExpectation;
    if (
      expectation?.type !== 'object' ||
      expectation.requireSuccess !== true ||
      !expectation.nonEmptyPaths?.includes(path)
    ) {
      throw new Error(
        `${files.contract} must require successful non-empty ${path} for ${scenarioId}`,
      );
    }
  }
  const publicBookingSlots = scenariosById.get('public.booking.slots');
  const expectedPublicBookingSlotQuery = new Map([
    ['type', 'in_person'],
    ['branchId', '{publicBookingBranchId}'],
    ['serviceId', '{publicBookingClinicServiceId}'],
    ['orgSlug', '{publicBookingOrganizationSlug}'],
  ]);
  let publicBookingSlotsUrl;
  try {
    publicBookingSlotsUrl = new URL(publicBookingSlots?.path ?? '', 'https://smoke.invalid');
  } catch {
    throw new Error(`${files.contract} public.booking.slots must contain a valid URL path`);
  }
  const publicBookingSlotQueryKeys = [...publicBookingSlotsUrl.searchParams.keys()];
  if (
    !contract.requiredFixtureRefs?.includes('publicBookingBranchId') ||
    !contract.requiredFixtureRefs?.includes('publicBookingClinicServiceId') ||
    !contract.requiredFixtureRefs?.includes('publicBookingOrganizationSlug') ||
    publicBookingSlotsUrl.pathname !== '/api/booking/public/slots' ||
    publicBookingSlotQueryKeys.length !== expectedPublicBookingSlotQuery.size ||
    [...expectedPublicBookingSlotQuery].some(
      ([key, value]) =>
        publicBookingSlotsUrl.searchParams.getAll(key).length !== 1 ||
        publicBookingSlotsUrl.searchParams.get(key) !== value,
    )
  ) {
    throw new Error(
      `${files.contract} must bind public booking slots to canonical branch, clinic service, and organization refs`,
    );
  }
  const serializedContract = JSON.stringify(contract);
  if (
    serializedContract.includes('branchServiceId') ||
    serializedContract.includes('publicBookingServiceId')
  ) {
    throw new Error(
      `${files.contract} must not retain retired branchServiceId/publicBookingServiceId contract names`,
    );
  }

  const discussionExpectation = scenariosById.get(
    'patient.program.item.discussion-summary',
  )?.jsonExpectation;
  if (
    discussionExpectation?.requireSuccess !== true ||
    !discussionExpectation.fixtureKeys?.some(
      (check) => check.path === 'summaryByItemId' && check.ref === 'patientProgramItemId',
    )
  ) {
    throw new Error(
      `${files.contract} must bind discussion summary evidence to patientProgramItemId`,
    );
  }

  const playbackExpectation = patientMediaPlayback?.jsonExpectation;
  if (
    !playbackExpectation?.fixtureEquals?.some(
      (check) => check.path === 'mediaId' && check.ref === 'mediaFileId',
    ) ||
    !playbackExpectation.fixtureContains?.some(
      (check) => check.path === 'mp4.url' && check.ref === 'mediaFileId',
    ) ||
    !playbackExpectation.allowedValues?.some(
      (check) =>
        check.path === 'delivery' &&
        ['hls', 'mp4', 'file'].every((delivery) => check.values?.includes(delivery)),
    ) ||
    !playbackExpectation.requiredPaths?.includes('delivery') ||
    !playbackExpectation.requiredPaths?.includes('mp4.url')
  ) {
    throw new Error(
      `${files.contract} must bind playback evidence to mediaFileId and a delivery descriptor`,
    );
  }
}

function makeSyntheticFixtureFile({ globalAdminMode = true } = {}) {
  const contract = JSON.parse(read(files.contract));
  const tempDir = mkdtempSync(resolve(tmpdir(), 'bcb-saas-product-smoke-'));
  const fixturePath = resolve(tempDir, 'synthetic.fixture.json');
  const fixture = {
    schemaVersion: 1,
    authProfiles: {
      doctor: { headers: { Cookie: 'synthetic-doctor-cookie' } },
      clinic_admin: { headers: { Cookie: 'synthetic-admin-cookie' } },
      patient: { headers: { Cookie: 'synthetic-patient-cookie' } },
      global_admin: {
        headers: { Cookie: 'synthetic-global-admin-cookie' },
        ...(globalAdminMode ? { adminMode: true } : {}),
      },
      public: { headers: {} },
    },
    refs: Object.fromEntries(contract.requiredFixtureRefs.map((key) => [key, `synthetic-${key}`])),
    forbiddenBodyText: ['synthetic-forbidden-sentinel'],
  };
  writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`);
  return { tempDir, fixturePath };
}

function runStep(step, stdio = 'inherit') {
  const result = spawnSync(step[0], step.slice(1), { stdio });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function expectDocMutationRejected(label, path, mutatedText) {
  let rejected = false;
  try {
    runFixtureGateDocChecks(new Map([[path, mutatedText]]));
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error(`self-test failed to reject ${label}`);
}

function runSelfTest() {
  const contractText = read(files.contract);
  expectDocMutationRejected(
    'global-admin authority mutation',
    files.contract,
    contractText.replace('"actor": "global_admin"', '"actor": "clinic_admin"'),
  );
  const runnerText = read(files.smokeRunner);
  expectDocMutationRejected(
    'global-admin adminMode enforcement mutation',
    files.smokeRunner,
    runnerText.replace('profile.adminMode === true', 'profile.adminMode === false'),
  );
  expectDocMutationRejected(
    'same-origin mutation header removal',
    files.smokeRunner,
    runnerText.replace('return { Origin: parsedBaseUrl.origin };', 'return {};'),
  );
  expectDocMutationRejected(
    'same-origin mutation header wiring removal',
    files.smokeRunner,
    runnerText.replace(
      'Object.assign(headers, browserMutationHeadersForBaseUrl(baseUrl, scenario.method));',
      '',
    ),
  );
  const csrfDenialEquivalentMutation = JSON.parse(contractText);
  csrfDenialEquivalentMutation.mutationScenarios.find(
    (scenario) => scenario.id === 'global-admin.clinical-write.denied',
  ).expectedErrorValues.push('csrf_origin_forbidden');
  expectDocMutationRejected(
    'csrf origin denial accepted as tenant authorization proof',
    files.contract,
    JSON.stringify(csrfDenialEquivalentMutation),
  );
  const specialistAnalyticsAuthorityMutation = JSON.parse(contractText);
  specialistAnalyticsAuthorityMutation.readOnlyScenarios.find(
    (scenario) => scenario.id === 'doctor.analytics.patient-engagement',
  ).actor = 'global_admin';
  expectDocMutationRejected(
    'specialist engagement analytics authority mutation',
    files.contract,
    JSON.stringify(specialistAnalyticsAuthorityMutation),
  );
  expectDocMutationRejected(
    'specialist engagement analytics admin-path mutation',
    files.contract,
    contractText.replace(
      '/api/doctor/treatment-program-instances/{patientProgramInstanceId}/action-log',
      '/api/admin/product-analytics',
    ),
  );
  expectDocMutationRejected(
    'public booking organization binding mutation',
    files.contract,
    contractText.replace('&orgSlug={publicBookingOrganizationSlug}', ''),
  );
  expectDocMutationRejected(
    'public booking branch binding mutation',
    files.contract,
    contractText.replace('branchId={publicBookingBranchId}', 'branchId='),
  );
  expectDocMutationRejected(
    'public booking clinic service binding mutation',
    files.contract,
    contractText.replace('serviceId={publicBookingClinicServiceId}', 'serviceId='),
  );
  expectDocMutationRejected(
    'retired public booking branchServiceId mutation',
    files.contract,
    contractText.replace(
      'branchId={publicBookingBranchId}',
      'branchServiceId={publicBookingBranchId}',
    ),
  );
  for (const [label, currentKey, prefixedKey] of [
    ['prefixed public booking branch key', 'branchId', 'xbranchId'],
    ['prefixed public booking clinic service key', 'serviceId', 'xserviceId'],
    ['prefixed public booking organization key', 'orgSlug', 'xorgSlug'],
  ]) {
    expectDocMutationRejected(
      label,
      files.contract,
      contractText.replace(`${currentKey}=`, `${prefixedKey}=`),
    );
  }
  expectDocMutationRejected(
    'hidden retired publicBookingServiceId fixture ref',
    files.contract,
    contractText.replace(
      '"publicBookingBranchId",',
      '"publicBookingBranchId", "publicBookingServiceId",',
    ),
  );

  const { tempDir, fixturePath } = makeSyntheticFixtureFile({ globalAdminMode: false });
  try {
    const status = runStep(
      [
        'node',
        files.smokeRunner,
        '--check-fixture',
        `--fixture-file=${fixturePath}`,
        '--categories=system_health',
      ],
      'ignore',
    );
    if (status === 0)
      throw new Error('self-test failed to reject fixture without global-admin adminMode');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
  console.log('check-saas-product-smoke-contract self-test: OK');
}

function runMain() {
  const steps = [
    ['node', '--check', files.smokeRunner],
    ['node', files.smokeRunner, '--check-contract'],
    ['node', files.smokeRunner, '--self-test'],
  ];
  const { tempDir, fixturePath } = makeSyntheticFixtureFile();
  steps.push([
    'node',
    files.smokeRunner,
    '--check-fixture',
    `--fixture-file=${fixturePath}`,
    '--categories=doctor',
  ]);
  try {
    for (const step of steps) {
      console.log(`check-saas-product-smoke-contract: $ ${step.join(' ')}`);
      const status = runStep(step);
      if (status !== 0) {
        console.error(`check-saas-product-smoke-contract: FAILED ${step.join(' ')}`);
        process.exit(status);
      }
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
  runFixtureGateDocChecks();
  console.log('check-saas-product-smoke-contract: OK');
}

if (process.argv.includes('--self-test')) runSelfTest();
else runMain();
