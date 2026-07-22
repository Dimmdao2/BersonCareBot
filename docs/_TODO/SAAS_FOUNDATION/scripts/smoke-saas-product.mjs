#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..', '..', '..');
const contractPath = resolve(
  repoRoot,
  'docs/_TODO/SAAS_FOUNDATION/saas-product-smoke-contract.json',
);

const modes = new Set(['dormant', 'shadow', 'locked']);
const allowedAuthHeaderNames = new Set(['authorization', 'cookie', 'x-bersoncare-smoke-auth']);
const browserMutationMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function usage() {
  return [
    'Usage:',
    '  node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-saas-product.mjs --check-contract',
    '  node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-saas-product.mjs --check-fixture --fixture-file=/run/bersoncarebot/saas-smoke.fixture [--categories=doctor] [--scenario-ids=doctor.workspace.home]',
    '  node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-saas-product.mjs --self-test',
    '  node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-saas-product.mjs --mode=dormant --base-url=https://test.bersoncare.ru --fixture-file=/run/bersoncarebot/saas-smoke.fixture [--json-output=out.json] [--junit-output=out.xml] [--include-mutations] [--categories=doctor,bookings] [--scenario-ids=doctor.workspace.home]',
    '',
    'Safety:',
    '  This runner never reads repo env files and never connects to a database.',
    '  --check-fixture performs no HTTP requests and prints only redacted aggregate fixture metadata.',
    '  Auth cookies/headers must come from an operator-managed fixture file outside the repo.',
  ].join('\n');
}

function parseArgs(argv) {
  const options = {
    mode: 'dormant',
    baseUrl: null,
    fixtureFile: null,
    jsonOutput: null,
    junitOutput: null,
    includeMutations: false,
    checkContract: false,
    checkFixture: false,
    selfTest: false,
    scenarioIds: new Set(),
    categories: new Set(),
  };

  for (const arg of argv) {
    if (arg === '--') {
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--check-contract') {
      options.checkContract = true;
      continue;
    }
    if (arg === '--check-fixture') {
      options.checkFixture = true;
      continue;
    }
    if (arg === '--self-test') {
      options.selfTest = true;
      continue;
    }
    if (arg === '--include-mutations') {
      options.includeMutations = true;
      continue;
    }
    if (arg.startsWith('--mode=')) {
      options.mode = arg.slice('--mode='.length);
      continue;
    }
    if (arg.startsWith('--base-url=')) {
      options.baseUrl = arg.slice('--base-url='.length);
      continue;
    }
    if (arg.startsWith('--fixture-file=')) {
      options.fixtureFile = arg.slice('--fixture-file='.length);
      continue;
    }
    if (arg.startsWith('--json-output=')) {
      options.jsonOutput = arg.slice('--json-output='.length);
      continue;
    }
    if (arg.startsWith('--junit-output=')) {
      options.junitOutput = arg.slice('--junit-output='.length);
      continue;
    }
    if (arg.startsWith('--scenario-id=')) {
      options.scenarioIds.add(arg.slice('--scenario-id='.length));
      continue;
    }
    if (arg.startsWith('--scenario-ids=')) {
      for (const id of arg.slice('--scenario-ids='.length).split(',')) {
        if (id.trim()) options.scenarioIds.add(id.trim());
      }
      continue;
    }
    if (arg.startsWith('--category=')) {
      options.categories.add(arg.slice('--category='.length));
      continue;
    }
    if (arg.startsWith('--categories=')) {
      for (const category of arg.slice('--categories='.length).split(',')) {
        if (category.trim()) options.categories.add(category.trim());
      }
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
  }

  if (!modes.has(options.mode)) {
    throw new Error(`Unsupported mode: ${options.mode}`);
  }

  return options;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function scenarioGroups(contract, includeMutations) {
  const scenarios = [...contract.readOnlyScenarios];
  if (includeMutations) {
    scenarios.push(...contract.mutationScenarios);
  }
  return scenarios;
}

function filterScenarios(scenarios, options) {
  const filtered = scenarios.filter((scenario) => {
    const matchesScenarioId =
      options.scenarioIds.size === 0 || options.scenarioIds.has(scenario.id);
    const matchesCategory =
      options.categories.size === 0 || options.categories.has(scenario.category);
    return matchesScenarioId && matchesCategory;
  });
  if (filtered.length === 0) {
    throw new Error('scenario filters selected zero scenarios');
  }
  return filtered;
}

function validateContract(contract) {
  assert(contract.schemaVersion === 1, 'contract schemaVersion must be 1');
  assert(contract.phase === 'A1', 'contract phase must be A1');
  assert(Array.isArray(contract.modes), 'contract modes must be an array');
  for (const mode of ['dormant', 'shadow', 'locked']) {
    assert(contract.modes.includes(mode), `contract missing mode ${mode}`);
  }
  assert(
    Array.isArray(contract.requiredFixtureRefs),
    'contract requiredFixtureRefs must be an array',
  );
  assert(Array.isArray(contract.readOnlyScenarios), 'contract readOnlyScenarios must be an array');
  assert(Array.isArray(contract.mutationScenarios), 'contract mutationScenarios must be an array');

  const ids = new Set();
  const categories = new Set();
  for (const scenario of scenarioGroups(contract, true)) {
    assert(typeof scenario.id === 'string' && scenario.id.length > 0, 'scenario id is required');
    assert(!ids.has(scenario.id), `duplicate scenario id ${scenario.id}`);
    ids.add(scenario.id);
    assert(
      typeof scenario.actor === 'string' && scenario.actor.length > 0,
      `${scenario.id}: actor is required`,
    );
    assert(
      typeof scenario.category === 'string' && scenario.category.length > 0,
      `${scenario.id}: category is required`,
    );
    assert(
      typeof scenario.method === 'string' && scenario.method.length > 0,
      `${scenario.id}: method is required`,
    );
    assert(
      typeof scenario.path === 'string' && scenario.path.startsWith('/'),
      `${scenario.id}: absolute path required`,
    );
    assert(
      Number.isInteger(scenario.expectStatus),
      `${scenario.id}: expectStatus must be an integer`,
    );
    assert(
      scenario.expectAuthDenial === undefined || scenario.expectAuthDenial === true,
      `${scenario.id}: expectAuthDenial must be true when present`,
    );
    if (scenario.expectAuthDenial === true) {
      assert(
        [401, 403].includes(scenario.expectStatus),
        `${scenario.id}: expected auth denial must use 401 or 403`,
      );
      assert(
        Array.isArray(scenario.expectedErrorValues) &&
          scenario.expectedErrorValues.length > 0 &&
          scenario.expectedErrorValues.every(
            (value) => typeof value === 'string' && value.length > 0,
          ),
        `${scenario.id}: expected auth denial requires expectedErrorValues`,
      );
    }
    if (scenario.requestJson !== undefined) {
      assert(
        scenario.requestJson &&
          typeof scenario.requestJson === 'object' &&
          !Array.isArray(scenario.requestJson),
        `${scenario.id}: requestJson must be an object`,
      );
      assert(
        scenario.method !== 'GET' && scenario.method !== 'HEAD',
        `${scenario.id}: GET/HEAD cannot have requestJson`,
      );
    }
    if (scenario.bodyIncludes !== undefined) {
      assert(
        Array.isArray(scenario.bodyIncludes) &&
          scenario.bodyIncludes.length > 0 &&
          scenario.bodyIncludes.every((value) => typeof value === 'string' && value.length > 0),
        `${scenario.id}: bodyIncludes must be non-empty strings`,
      );
    }
    validateJsonExpectation(scenario);
    categories.add(scenario.category);
  }

  for (const category of [
    'doctor',
    'schedule',
    'working_hours',
    'bookings',
    'client_card',
    'analytics',
    'content',
    'broadcasts',
    'admin_settings',
    'system_health',
    'patient_appointments',
    'patient_program',
    'patient_media',
    'public_auth',
    'public_booking',
    'server_actions',
  ]) {
    assert(categories.has(category), `contract missing category ${category}`);
  }

  const mutationDefaults = contract.mutationScenarios.every(
    (scenario) => scenario.disabledByDefault === true,
  );
  assert(mutationDefaults, 'all mutation scenarios must be disabledByDefault in A1');
}

function validateJsonExpectation(scenario) {
  const expectation = scenario.jsonExpectation;
  if (expectation === undefined) return;
  if (typeof expectation === 'string') {
    assert(
      ['object', 'non_empty'].includes(expectation),
      `${scenario.id}: unsupported jsonExpectation`,
    );
    return;
  }

  assert(
    expectation && typeof expectation === 'object' && !Array.isArray(expectation),
    `${scenario.id}: jsonExpectation must be a string or object`,
  );
  assert(expectation.type === 'object', `${scenario.id}: jsonExpectation.type must be object`);
  for (const field of ['requiredPaths', 'nonEmptyPaths']) {
    if (expectation[field] === undefined) continue;
    assert(
      Array.isArray(expectation[field]) && expectation[field].length > 0,
      `${scenario.id}: ${field} must be a non-empty array`,
    );
    assert(
      expectation[field].every((path) => typeof path === 'string' && path.length > 0),
      `${scenario.id}: ${field} paths must be non-empty strings`,
    );
  }
  for (const field of ['fixtureEquals', 'fixtureContains', 'fixtureKeys']) {
    if (expectation[field] === undefined) continue;
    assert(
      Array.isArray(expectation[field]) && expectation[field].length > 0,
      `${scenario.id}: ${field} must be a non-empty array`,
    );
    for (const check of expectation[field]) {
      assert(
        check && typeof check === 'object' && !Array.isArray(check),
        `${scenario.id}: ${field} entries must be objects`,
      );
      assert(
        typeof check.path === 'string' && check.path.length > 0,
        `${scenario.id}: ${field}.path is required`,
      );
      assert(
        typeof check.ref === 'string' && check.ref.length > 0,
        `${scenario.id}: ${field}.ref is required`,
      );
    }
  }
  if (expectation.allowedValues !== undefined) {
    assert(
      Array.isArray(expectation.allowedValues) && expectation.allowedValues.length > 0,
      `${scenario.id}: allowedValues must be a non-empty array`,
    );
    for (const check of expectation.allowedValues) {
      assert(
        check && typeof check === 'object' && !Array.isArray(check),
        `${scenario.id}: allowedValues entries must be objects`,
      );
      assert(
        typeof check.path === 'string' && check.path.length > 0,
        `${scenario.id}: allowedValues.path is required`,
      );
      assert(
        Array.isArray(check.values) && check.values.length > 0,
        `${scenario.id}: allowedValues.values must be a non-empty array`,
      );
    }
  }
  assert(
    expectation.requireSuccess === undefined || typeof expectation.requireSuccess === 'boolean',
    `${scenario.id}: requireSuccess must be boolean`,
  );
  assert(
    expectation.requireSuccess === true ||
      (expectation.requiredPaths?.length ?? 0) > 0 ||
      (expectation.nonEmptyPaths?.length ?? 0) > 0 ||
      (expectation.fixtureEquals?.length ?? 0) > 0 ||
      (expectation.fixtureContains?.length ?? 0) > 0 ||
      (expectation.allowedValues?.length ?? 0) > 0 ||
      (expectation.fixtureKeys?.length ?? 0) > 0,
    `${scenario.id}: object jsonExpectation must assert a meaningful response fact`,
  );
}

function validateFixture(contract, fixture) {
  assert(fixture.schemaVersion === 1, 'fixture schemaVersion must be 1');
  assert(
    fixture.authProfiles &&
      typeof fixture.authProfiles === 'object' &&
      !Array.isArray(fixture.authProfiles),
    'fixture authProfiles object is required',
  );
  assert(
    fixture.refs && typeof fixture.refs === 'object' && !Array.isArray(fixture.refs),
    'fixture refs object is required',
  );

  for (const actor of ['doctor', 'clinic_admin', 'patient', 'global_admin', 'public']) {
    const profile = fixture.authProfiles[actor];
    assert(
      profile && typeof profile === 'object' && !Array.isArray(profile),
      `fixture missing auth profile ${actor}`,
    );
    const headers = profile.headers ?? {};
    assert(
      headers && typeof headers === 'object' && !Array.isArray(headers),
      `${actor}: headers must be an object`,
    );
    const headerEntries = Object.entries(headers);
    assert(
      actor === 'public' ? headerEntries.length === 0 : headerEntries.length > 0,
      actor === 'public'
        ? 'public auth profile must not contain auth headers'
        : `${actor}: at least one auth header is required`,
    );
    for (const [headerName, headerValue] of headerEntries) {
      const normalized = headerName.toLowerCase();
      assert(
        allowedAuthHeaderNames.has(normalized) || normalized.startsWith('x-smoke-'),
        `${actor}: unsupported auth header ${headerName}`,
      );
      assert(
        typeof headerValue === 'string' && headerValue.trim().length > 0,
        `${actor}: auth header ${headerName} must be a non-empty string`,
      );
    }
    if (actor === 'global_admin') {
      assert(profile.adminMode === true, 'global_admin: adminMode=true is required');
    } else {
      assert(
        profile.adminMode === undefined,
        `${actor}: adminMode marker is reserved for global_admin`,
      );
    }
  }

  for (const refName of contract.requiredFixtureRefs) {
    assert(
      typeof fixture.refs[refName] === 'string' && fixture.refs[refName].trim().length > 0,
      `fixture missing ref ${refName}`,
    );
  }

  if (fixture.forbiddenBodyText !== undefined) {
    assert(
      Array.isArray(fixture.forbiddenBodyText),
      'fixture forbiddenBodyText must be an array when present',
    );
  }
}

function summarizeFixturePreflight({ contract, fixture, scenarios, options }) {
  return {
    schemaVersion: 1,
    phase: contract.phase,
    check: 'fixture-preflight',
    mode: options.mode,
    fixtureSchemaVersion: fixture.schemaVersion,
    authProfiles: Object.fromEntries(
      Object.entries(fixture.authProfiles)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, profile]) => [
          name,
          { headerCount: Object.keys(profile.headers ?? {}).length },
        ]),
    ),
    refKeys: Object.keys(fixture.refs).sort(),
    requiredRefCount: contract.requiredFixtureRefs.length,
    forbiddenBodyTextCount: Array.isArray(fixture.forbiddenBodyText)
      ? fixture.forbiddenBodyText.length
      : 0,
    selectedScenarioCount: scenarios.length,
    selectedCategories: [...new Set(scenarios.map((scenario) => scenario.category))].sort(),
    filters: {
      scenarioIds: [...options.scenarioIds].sort(),
      categories: [...options.categories].sort(),
      includeMutations: options.includeMutations,
    },
  };
}

function runFixturePreflight({ contract, fixture, options }) {
  validateContract(contract);
  validateFixture(contract, fixture);
  const scenarios = filterScenarios(scenarioGroups(contract, options.includeMutations), options);
  for (const scenario of scenarios) {
    renderPath(scenario.path, fixture.refs);
  }
  return summarizeFixturePreflight({ contract, fixture, scenarios, options });
}

function renderPath(pathTemplate, refs) {
  return pathTemplate.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    const value = refs[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`missing fixture ref ${key} for path ${pathTemplate}`);
    }
    return encodeURIComponent(value);
  });
}

function headersForActor(fixture, actor) {
  return { ...(fixture.authProfiles[actor]?.headers ?? {}) };
}

function browserMutationHeadersForBaseUrl(baseUrl, method) {
  if (!browserMutationMethods.has(method.toUpperCase())) return {};
  const parsedBaseUrl = new URL(baseUrl);
  assert(
    parsedBaseUrl.protocol === 'http:' || parsedBaseUrl.protocol === 'https:',
    'mutation smoke base URL must use http or https',
  );
  return { Origin: parsedBaseUrl.origin };
}

function classifyResponse({
  scenario,
  status,
  bodyText,
  expectedStatus,
  forbiddenBodyText,
  fixtureRefs = {},
}) {
  if (status === 401 || status === 403) {
    if (scenario.expectAuthDenial === true && status === expectedStatus) {
      try {
        const denial = JSON.parse(bodyText);
        return denial &&
          typeof denial === 'object' &&
          denial.ok === false &&
          scenario.expectedErrorValues.includes(denial.error)
          ? null
          : 'unexpected_auth_denial_body';
      } catch {
        return 'unexpected_auth_denial_body';
      }
    }
    if (
      scenario.knownFailureHint === 'G1' &&
      (scenario.actor === 'doctor' || scenario.actor === 'clinic_admin')
    ) {
      return 'known_g1_doctor_admin_identity';
    }
    return 'auth_denied';
  }

  if (status >= 500) {
    return 'server_error';
  }

  if (status !== expectedStatus) {
    return 'unexpected_status';
  }

  if (
    /digest["']?\s*[:=]\s*["']?[a-z0-9_-]{6,}/i.test(bodyText) ||
    /Next\.js.+digest/i.test(bodyText)
  ) {
    return 'next_render_digest';
  }

  if (
    /(permission denied|row-level security|RLS|tenant_principal_violation|missing principal)/i.test(
      bodyText,
    )
  ) {
    return 'permission_or_rls_error';
  }

  for (const forbidden of forbiddenBodyText) {
    if (typeof forbidden === 'string' && forbidden.length > 0 && bodyText.includes(forbidden)) {
      return 'forbidden_body_text';
    }
  }

  for (const required of scenario.bodyIncludes ?? []) {
    if (!bodyText.includes(required)) return 'required_body_text_missing';
  }

  if (Number.isInteger(scenario.minBodyBytes) && bodyText.length < scenario.minBodyBytes) {
    return 'unexpected_empty_fixture';
  }

  if (scenario.jsonExpectation) {
    const jsonResult = classifyJsonExpectation(bodyText, scenario.jsonExpectation, fixtureRefs);
    if (jsonResult) return jsonResult;
  }

  return null;
}

function valueAtPath(value, path) {
  let current = value;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, segment)) {
      return { found: false, value: undefined };
    }
    current = current[segment];
  }
  return { found: true, value: current };
}

function isNonEmpty(value) {
  if (Array.isArray(value) || typeof value === 'string') return value.length > 0;
  return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0);
}

function isMeaningfulRequiredValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function classifyJsonExpectation(bodyText, expectation, fixtureRefs = {}) {
  let value;
  try {
    value = JSON.parse(bodyText);
  } catch {
    return 'unexpected_empty_fixture';
  }

  if (!value || typeof value !== 'object') {
    return 'unexpected_empty_fixture';
  }

  if (Array.isArray(value)) {
    return expectation === 'non_empty' && value.length > 0 ? null : 'unexpected_empty_fixture';
  }

  if (Object.keys(value).length === 0) return 'unexpected_empty_fixture';

  const responseError = Object.hasOwn(value, 'error') ? value.error : undefined;
  if (
    value.ok === false ||
    (typeof responseError === 'string'
      ? responseError.trim().length > 0
      : responseError !== null && responseError !== undefined)
  ) {
    return 'unexpected_empty_fixture';
  }

  if (expectation === 'object') return null;

  if (expectation === 'non_empty') {
    for (const nestedValue of Object.values(value)) {
      if (isNonEmpty(nestedValue)) return null;
    }
    return 'unexpected_empty_fixture';
  }

  if (!expectation || typeof expectation !== 'object' || expectation.type !== 'object') {
    return `unsupported_json_expectation:${String(expectation)}`;
  }

  if (expectation.requireSuccess === true && value.ok !== true) return 'unexpected_empty_fixture';

  for (const path of expectation.requiredPaths ?? []) {
    const found = valueAtPath(value, path);
    if (!found.found || !isMeaningfulRequiredValue(found.value)) {
      return 'unexpected_empty_fixture';
    }
  }

  for (const path of expectation.nonEmptyPaths ?? []) {
    const found = valueAtPath(value, path);
    if (!found.found || !isNonEmpty(found.value)) return 'unexpected_empty_fixture';
  }

  for (const check of expectation.fixtureEquals ?? []) {
    const found = valueAtPath(value, check.path);
    const fixtureValue = fixtureRefs[check.ref];
    if (
      typeof fixtureValue !== 'string' ||
      fixtureValue.length === 0 ||
      !found.found ||
      found.value !== fixtureValue
    ) {
      return 'unexpected_empty_fixture';
    }
  }

  for (const check of expectation.fixtureContains ?? []) {
    const found = valueAtPath(value, check.path);
    const fixtureValue = fixtureRefs[check.ref];
    if (
      typeof fixtureValue !== 'string' ||
      fixtureValue.trim().length === 0 ||
      !found.found ||
      typeof found.value !== 'string' ||
      !found.value.includes(fixtureValue)
    ) {
      return 'unexpected_empty_fixture';
    }
  }

  for (const check of expectation.allowedValues ?? []) {
    const found = valueAtPath(value, check.path);
    if (!found.found || !check.values.includes(found.value)) return 'unexpected_empty_fixture';
  }

  for (const check of expectation.fixtureKeys ?? []) {
    const found = valueAtPath(value, check.path);
    const fixtureKey = fixtureRefs[check.ref];
    if (
      !found.found ||
      !found.value ||
      typeof found.value !== 'object' ||
      Array.isArray(found.value) ||
      typeof fixtureKey !== 'string' ||
      fixtureKey.length === 0 ||
      !Object.hasOwn(found.value, fixtureKey)
    ) {
      return 'unexpected_empty_fixture';
    }
    const keyedValue = found.value[fixtureKey];
    if (!isMeaningfulRequiredValue(keyedValue)) return 'unexpected_empty_fixture';
  }

  return null;
}

function compactError(error) {
  return error instanceof Error ? error.message : String(error);
}

async function runScenario({ baseUrl, fixture, scenario }) {
  const path = renderPath(scenario.path, fixture.refs);
  const url = new URL(path, baseUrl).toString();
  const startedAt = Date.now();
  const headers = headersForActor(fixture, scenario.actor);
  Object.assign(headers, browserMutationHeadersForBaseUrl(baseUrl, scenario.method));
  headers['User-Agent'] = 'bersoncarebot-saas-product-smoke-a1';
  if (scenario.requestJson !== undefined) headers['Content-Type'] = 'application/json';

  try {
    const response = await fetch(url, {
      method: scenario.method,
      headers,
      ...(scenario.requestJson !== undefined ? { body: JSON.stringify(scenario.requestJson) } : {}),
      redirect: 'manual',
    });
    const bodyText = await response.text();
    const failureCode = classifyResponse({
      scenario,
      status: response.status,
      bodyText,
      expectedStatus: scenario.expectStatus,
      forbiddenBodyText: fixture.forbiddenBodyText ?? [],
      fixtureRefs: fixture.refs,
    });

    return {
      id: scenario.id,
      actor: scenario.actor,
      category: scenario.category,
      method: scenario.method,
      path: scenario.path,
      status: response.status,
      durationMs: Date.now() - startedAt,
      requestId:
        response.headers.get('x-request-id') ??
        response.headers.get('x-bc-auth-correlation-id') ??
        null,
      outcome: failureCode ? 'fail' : 'pass',
      failureCode,
    };
  } catch {
    return {
      id: scenario.id,
      actor: scenario.actor,
      category: scenario.category,
      method: scenario.method,
      path: scenario.path,
      status: null,
      durationMs: Date.now() - startedAt,
      requestId: null,
      outcome: 'fail',
      failureCode: 'request_failed',
    };
  }
}

function summarize({ mode, baseUrl, results, filters }) {
  const failures = results.filter((result) => result.outcome !== 'pass');
  return {
    schemaVersion: 1,
    phase: 'A1',
    mode,
    baseUrl,
    startedAt: new Date().toISOString(),
    total: results.length,
    passed: results.length - failures.length,
    failed: failures.length,
    filters,
    failureCodes: failures.reduce((acc, result) => {
      const key = result.failureCode ?? 'unknown';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
    results,
  };
}

function ensureParent(path) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
}

function writeJson(path, value) {
  ensureParent(path);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function toJunit(summary) {
  const cases = summary.results
    .map((result) => {
      const attrs = `classname="saas.product.${xmlEscape(result.category)}" name="${xmlEscape(result.id)}" time="${(result.durationMs / 1000).toFixed(3)}"`;
      if (result.outcome === 'pass') {
        return `    <testcase ${attrs}/>`;
      }
      const message = result.failureCode ?? 'unknown';
      const detail = JSON.stringify({
        status: result.status,
        actor: result.actor,
        method: result.method,
        path: result.path,
        requestId: result.requestId,
      });
      return `    <testcase ${attrs}><failure message="${xmlEscape(message)}">${xmlEscape(detail)}</failure></testcase>`;
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="saas-product-smoke-a1" tests="${summary.total}" failures="${summary.failed}" errors="0">`,
    cases,
    '</testsuite>',
    '',
  ].join('\n');
}

function runSelfTest(contract) {
  validateContract(contract);
  const baseScenario = {
    id: 'doctor.workspace.home',
    actor: 'doctor',
    category: 'doctor',
    method: 'GET',
    path: '/app/doctor',
    expectStatus: 200,
    minBodyBytes: 10,
    knownFailureHint: 'G1',
  };

  const mutationHeaders = browserMutationHeadersForBaseUrl(
    'https://test.bersoncare.ru/smoke-base-path',
    'POST',
  );
  assert(
    JSON.stringify(mutationHeaders) === '{"Origin":"https://test.bersoncare.ru"}',
    'mutation smoke must send only the canonical base URL Origin header',
  );
  assert(
    Object.keys(browserMutationHeadersForBaseUrl('https://test.bersoncare.ru', 'GET')).length === 0,
    'read-only smoke must not synthesize mutation browser headers',
  );

  const cases = [
    {
      name: 'known G1 classifier',
      input: {
        scenario: baseScenario,
        status: 403,
        bodyText: 'Forbidden',
        expectedStatus: 200,
        forbiddenBodyText: [],
      },
      expected: 'known_g1_doctor_admin_identity',
    },
    {
      name: 'server error classifier',
      input: {
        scenario: { ...baseScenario, knownFailureHint: undefined },
        status: 502,
        bodyText: '',
        expectedStatus: 200,
        forbiddenBodyText: [],
      },
      expected: 'server_error',
    },
    {
      name: 'Next digest classifier',
      input: {
        scenario: baseScenario,
        status: 200,
        bodyText: 'Application error: digest: abc123xyz',
        expectedStatus: 200,
        forbiddenBodyText: [],
      },
      expected: 'next_render_digest',
    },
    {
      name: 'permission classifier',
      input: {
        scenario: baseScenario,
        status: 200,
        bodyText: 'permission denied for table patients',
        expectedStatus: 200,
        forbiddenBodyText: [],
      },
      expected: 'permission_or_rls_error',
    },
    {
      name: 'empty fixture classifier',
      input: {
        scenario: { ...baseScenario, minBodyBytes: 50 },
        status: 200,
        bodyText: 'short',
        expectedStatus: 200,
        forbiddenBodyText: [],
      },
      expected: 'unexpected_empty_fixture',
    },
    {
      name: 'forbidden text classifier',
      input: {
        scenario: baseScenario,
        status: 200,
        bodyText: 'contains sentinel',
        expectedStatus: 200,
        forbiddenBodyText: ['sentinel'],
      },
      expected: 'forbidden_body_text',
    },
    {
      name: 'object expectation rejects ok false',
      input: {
        scenario: { ...baseScenario, jsonExpectation: 'object' },
        status: 200,
        bodyText: '{"ok":false,"error":"permission_failed"}',
        expectedStatus: 200,
        forbiddenBodyText: [],
      },
      expected: 'unexpected_empty_fixture',
    },
    {
      name: 'non-empty expectation rejects ok false',
      input: {
        scenario: { ...baseScenario, jsonExpectation: 'non_empty' },
        status: 200,
        bodyText: '{"ok":false,"appointments":[{"id":"should-not-pass"}]}',
        expectedStatus: 200,
        forbiddenBodyText: [],
      },
      expected: 'unexpected_empty_fixture',
    },
    {
      name: 'object expectation rejects object-valued error',
      input: {
        scenario: { ...baseScenario, jsonExpectation: 'object' },
        status: 200,
        bodyText: '{"ok":true,"error":{"code":"permission_failed"},"rows":[{"id":"false-pass"}]}',
        expectedStatus: 200,
        forbiddenBodyText: [],
      },
      expected: 'unexpected_empty_fixture',
    },
    {
      name: 'required path rejects empty string',
      input: {
        scenario: {
          ...baseScenario,
          jsonExpectation: { type: 'object', requiredPaths: ['delivery'] },
        },
        status: 200,
        bodyText: '{"delivery":""}',
        expectedStatus: 200,
        forbiddenBodyText: [],
      },
      expected: 'unexpected_empty_fixture',
    },
    {
      name: 'required path rejects empty object',
      input: {
        scenario: {
          ...baseScenario,
          jsonExpectation: { type: 'object', requiredPaths: ['meta.probes'] },
        },
        status: 200,
        bodyText: '{"meta":{"probes":{}}}',
        expectedStatus: 200,
        forbiddenBodyText: [],
      },
      expected: 'unexpected_empty_fixture',
    },
    {
      name: 'appointments expectation rejects empty facts',
      input: {
        scenario: {
          ...baseScenario,
          jsonExpectation: {
            type: 'object',
            requireSuccess: true,
            nonEmptyPaths: ['appointments'],
          },
        },
        status: 200,
        bodyText: '{"ok":true,"appointments":[]}',
        expectedStatus: 200,
        forbiddenBodyText: [],
      },
      expected: 'unexpected_empty_fixture',
    },
    {
      name: 'working hours expectation rejects empty facts',
      input: {
        scenario: {
          ...baseScenario,
          jsonExpectation: { type: 'object', requireSuccess: true, nonEmptyPaths: ['rows'] },
        },
        status: 200,
        bodyText: '{"ok":true,"rows":[],"usesFallback":false}',
        expectedStatus: 200,
        forbiddenBodyText: [],
      },
      expected: 'unexpected_empty_fixture',
    },
    {
      name: 'slots expectation rejects empty facts',
      input: {
        scenario: {
          ...baseScenario,
          jsonExpectation: { type: 'object', requireSuccess: true, nonEmptyPaths: ['slots'] },
        },
        status: 200,
        bodyText: '{"ok":true,"slots":[]}',
        expectedStatus: 200,
        forbiddenBodyText: [],
      },
      expected: 'unexpected_empty_fixture',
    },
    {
      name: 'slots expectation accepts non-empty facts',
      input: {
        scenario: {
          ...baseScenario,
          jsonExpectation: { type: 'object', requireSuccess: true, nonEmptyPaths: ['slots'] },
        },
        status: 200,
        bodyText: '{"ok":true,"slots":[{"start":"fixture"}]}',
        expectedStatus: 200,
        forbiddenBodyText: [],
      },
      expected: null,
    },
    {
      name: 'discussion summary rejects missing fixture item',
      input: {
        scenario: {
          ...baseScenario,
          jsonExpectation: {
            type: 'object',
            requireSuccess: true,
            fixtureKeys: [{ path: 'summaryByItemId', ref: 'patientProgramItemId' }],
          },
        },
        status: 200,
        bodyText: '{"ok":true,"summaryByItemId":{}}',
        expectedStatus: 200,
        forbiddenBodyText: [],
        fixtureRefs: { patientProgramItemId: 'fixture-item' },
      },
      expected: 'unexpected_empty_fixture',
    },
    {
      name: 'discussion summary accepts fixture item fact',
      input: {
        scenario: {
          ...baseScenario,
          jsonExpectation: {
            type: 'object',
            requireSuccess: true,
            fixtureKeys: [{ path: 'summaryByItemId', ref: 'patientProgramItemId' }],
          },
        },
        status: 200,
        bodyText: '{"ok":true,"summaryByItemId":{"fixture-item":{"totalCount":0}}}',
        expectedStatus: 200,
        forbiddenBodyText: [],
        fixtureRefs: { patientProgramItemId: 'fixture-item' },
      },
      expected: null,
    },
    {
      name: 'discussion summary rejects null fixture item fact',
      input: {
        scenario: {
          ...baseScenario,
          jsonExpectation: {
            type: 'object',
            requireSuccess: true,
            fixtureKeys: [{ path: 'summaryByItemId', ref: 'patientProgramItemId' }],
          },
        },
        status: 200,
        bodyText: '{"ok":true,"summaryByItemId":{"fixture-item":null}}',
        expectedStatus: 200,
        forbiddenBodyText: [],
        fixtureRefs: { patientProgramItemId: 'fixture-item' },
      },
      expected: 'unexpected_empty_fixture',
    },
    {
      name: 'discussion summary rejects empty fixture item fact',
      input: {
        scenario: {
          ...baseScenario,
          jsonExpectation: {
            type: 'object',
            requireSuccess: true,
            fixtureKeys: [{ path: 'summaryByItemId', ref: 'patientProgramItemId' }],
          },
        },
        status: 200,
        bodyText: '{"ok":true,"summaryByItemId":{"fixture-item":{}}}',
        expectedStatus: 200,
        forbiddenBodyText: [],
        fixtureRefs: { patientProgramItemId: 'fixture-item' },
      },
      expected: 'unexpected_empty_fixture',
    },
    {
      name: 'playback fixtureEquals rejects mismatched mediaFileId',
      input: {
        scenario: {
          ...baseScenario,
          jsonExpectation: {
            type: 'object',
            requiredPaths: ['delivery', 'mp4.url'],
            fixtureEquals: [{ path: 'mediaId', ref: 'mediaFileId' }],
          },
        },
        status: 200,
        bodyText: '{"mediaId":"other-media","delivery":{"kind":"mp4"},"mp4":{"url":"/media.mp4"}}',
        expectedStatus: 200,
        forbiddenBodyText: [],
        fixtureRefs: { mediaFileId: 'fixture-media' },
      },
      expected: 'unexpected_empty_fixture',
    },
    {
      name: 'playback fixtureEquals rejects missing mediaFileId',
      input: {
        scenario: {
          ...baseScenario,
          jsonExpectation: {
            type: 'object',
            requiredPaths: ['delivery', 'mp4.url'],
            fixtureEquals: [{ path: 'mediaId', ref: 'mediaFileId' }],
          },
        },
        status: 200,
        bodyText: '{"delivery":{"kind":"mp4"},"mp4":{"url":"/media.mp4"}}',
        expectedStatus: 200,
        forbiddenBodyText: [],
        fixtureRefs: { mediaFileId: 'fixture-media' },
      },
      expected: 'unexpected_empty_fixture',
    },
    {
      name: 'playback rejects invalid delivery descriptor',
      input: {
        scenario: {
          ...baseScenario,
          jsonExpectation: {
            type: 'object',
            requiredPaths: ['delivery', 'mp4.url'],
            fixtureEquals: [{ path: 'mediaId', ref: 'mediaFileId' }],
            fixtureContains: [{ path: 'mp4.url', ref: 'mediaFileId' }],
            allowedValues: [{ path: 'delivery', values: ['hls', 'mp4', 'file'] }],
          },
        },
        status: 200,
        bodyText:
          '{"mediaId":"fixture-media","delivery":"unknown","mp4":{"url":"/api/media/fixture-media"}}',
        expectedStatus: 200,
        forbiddenBodyText: [],
        fixtureRefs: { mediaFileId: 'fixture-media' },
      },
      expected: 'unexpected_empty_fixture',
    },
    {
      name: 'playback rejects URL for different media fixture',
      input: {
        scenario: {
          ...baseScenario,
          jsonExpectation: {
            type: 'object',
            requiredPaths: ['delivery', 'mp4.url'],
            fixtureEquals: [{ path: 'mediaId', ref: 'mediaFileId' }],
            fixtureContains: [{ path: 'mp4.url', ref: 'mediaFileId' }],
            allowedValues: [{ path: 'delivery', values: ['hls', 'mp4', 'file'] }],
          },
        },
        status: 200,
        bodyText: '{"mediaId":"fixture-media","delivery":"mp4","mp4":{"url":"/api/media/other"}}',
        expectedStatus: 200,
        forbiddenBodyText: [],
        fixtureRefs: { mediaFileId: 'fixture-media' },
      },
      expected: 'unexpected_empty_fixture',
    },
  ];

  for (const testCase of cases) {
    const actual = classifyResponse(testCase.input);
    assert(
      actual === testCase.expected,
      `${testCase.name}: expected ${testCase.expected}, got ${actual}`,
    );
  }

  const fixture = {
    schemaVersion: 1,
    authProfiles: {
      doctor: { headers: { Cookie: 'masked' } },
      clinic_admin: { headers: { Cookie: 'masked' } },
      patient: { headers: { Cookie: 'masked' } },
      global_admin: { headers: { Cookie: 'masked' }, adminMode: true },
      public: { headers: {} },
    },
    refs: Object.fromEntries(contract.requiredFixtureRefs.map((key) => [key, `fixture-${key}`])),
  };
  validateFixture(contract, fixture);
  assert(
    renderPath('/x/{doctorClientUserId}', fixture.refs) === '/x/fixture-doctorClientUserId',
    'fixture path interpolation failed',
  );
  const filtered = filterScenarios(contract.readOnlyScenarios, {
    scenarioIds: new Set(),
    categories: new Set(['doctor']),
  });
  assert(
    filtered.length > 0 && filtered.every((scenario) => scenario.category === 'doctor'),
    'category filter failed',
  );

  const fixturePreflight = runFixturePreflight({
    contract,
    fixture,
    options: {
      mode: 'dormant',
      scenarioIds: new Set(),
      categories: new Set(['doctor']),
      includeMutations: false,
    },
  });
  assert(
    fixturePreflight.selectedScenarioCount === filtered.length,
    'fixture preflight scenario count failed',
  );
  assert(
    fixturePreflight.authProfiles.doctor.headerCount === 1,
    'fixture preflight redacted header count failed',
  );
  assert(
    fixturePreflight.refKeys.includes('doctorClientUserId') &&
      !JSON.stringify(fixturePreflight).includes('fixture-doctorClientUserId'),
    'fixture preflight must expose ref keys without ref values',
  );

  const invalidFixture = {
    ...fixture,
    refs: { ...fixture.refs, doctorClientUserId: '' },
  };
  let invalidFixtureFailed = false;
  try {
    runFixturePreflight({
      contract,
      fixture: invalidFixture,
      options: {
        mode: 'dormant',
        scenarioIds: new Set(),
        categories: new Set(['doctor']),
        includeMutations: false,
      },
    });
  } catch (error) {
    invalidFixtureFailed = compactError(error).includes('fixture missing ref doctorClientUserId');
  }
  assert(invalidFixtureFailed, 'invalid fixture preflight must fail');

  let authenticatedPublicFixtureFailed = false;
  try {
    validateFixture(contract, {
      ...fixture,
      authProfiles: {
        ...fixture.authProfiles,
        public: { headers: { Cookie: 'must-not-be-present' } },
      },
    });
  } catch (error) {
    authenticatedPublicFixtureFailed = compactError(error).includes(
      'public auth profile must not contain auth headers',
    );
  }
  assert(authenticatedPublicFixtureFailed, 'public smoke profile must remain unauthenticated');

  let unauthenticatedPatientFixtureFailed = false;
  try {
    validateFixture(contract, {
      ...fixture,
      authProfiles: {
        ...fixture.authProfiles,
        patient: { headers: {} },
      },
    });
  } catch (error) {
    unauthenticatedPatientFixtureFailed = compactError(error).includes(
      'patient: at least one auth header is required',
    );
  }
  assert(unauthenticatedPatientFixtureFailed, 'patient smoke profile must carry auth material');

  let globalAdminWithoutModeFailed = false;
  try {
    validateFixture(contract, {
      ...fixture,
      authProfiles: {
        ...fixture.authProfiles,
        global_admin: { headers: { Cookie: 'masked' } },
      },
    });
  } catch (error) {
    globalAdminWithoutModeFailed = compactError(error).includes(
      'global_admin: adminMode=true is required',
    );
  }
  assert(
    globalAdminWithoutModeFailed,
    'global admin smoke profile must prove admin mode was enabled',
  );

  const expectedDenialScenario = {
    ...baseScenario,
    actor: 'doctor',
    expectStatus: 403,
    expectAuthDenial: true,
    expectedErrorValues: ['forbidden', 'admin_mode_required'],
  };
  assert(
    classifyResponse({
      scenario: expectedDenialScenario,
      status: 403,
      bodyText: '{"ok":false,"error":"forbidden"}',
      expectedStatus: 403,
      forbiddenBodyText: [],
    }) === null,
    'explicit negative auth probe must accept only its expected denial contract',
  );
  assert(
    classifyResponse({
      scenario: expectedDenialScenario,
      status: 403,
      bodyText: '{"ok":false,"error":"different_denial"}',
      expectedStatus: 403,
      forbiddenBodyText: [],
    }) === 'unexpected_auth_denial_body',
    'negative auth probe must reject a different denial body',
  );
  assert(
    classifyResponse({
      scenario: { ...baseScenario, bodyIncludes: ['required registration marker'] },
      status: 200,
      bodyText: 'long enough but missing the requested marker',
      expectedStatus: 200,
      forbiddenBodyText: [],
    }) === 'required_body_text_missing',
    'public surface probe must reject a missing required UI marker',
  );

  console.log('smoke-saas-product self-test: OK');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const contract = readJson(contractPath);

  if (options.selfTest) {
    runSelfTest(contract);
    return;
  }

  validateContract(contract);

  if (options.checkContract) {
    console.log('smoke-saas-product contract: OK');
    return;
  }

  if (options.checkFixture) {
    if (!options.fixtureFile) {
      throw new Error(`Fixture preflight requires --fixture-file.\n\n${usage()}`);
    }
    const fixture = readJson(options.fixtureFile);
    const summary = runFixturePreflight({ contract, fixture, options });
    console.log(`smoke-saas-product fixture preflight: ${JSON.stringify(summary)}`);
    return;
  }

  if (!options.baseUrl || !options.fixtureFile) {
    throw new Error(`Real smoke requires --base-url and --fixture-file.\n\n${usage()}`);
  }

  const fixture = readJson(options.fixtureFile);
  validateFixture(contract, fixture);
  const scenarios = filterScenarios(scenarioGroups(contract, options.includeMutations), options);
  const results = [];

  for (const scenario of scenarios) {
    results.push(await runScenario({ baseUrl: options.baseUrl, fixture, scenario }));
  }

  const summary = summarize({
    mode: options.mode,
    baseUrl: options.baseUrl,
    results,
    filters: {
      scenarioIds: [...options.scenarioIds],
      categories: [...options.categories],
    },
  });

  if (options.jsonOutput) {
    writeJson(options.jsonOutput, summary);
  }

  if (options.junitOutput) {
    ensureParent(options.junitOutput);
    writeFileSync(options.junitOutput, toJunit(summary));
  }

  console.log(
    `smoke-saas-product: mode=${summary.mode} total=${summary.total} passed=${summary.passed} failed=${summary.failed}`,
  );
  for (const result of summary.results) {
    const suffix = result.outcome === 'pass' ? 'PASS' : `FAIL ${result.failureCode}`;
    console.log(
      `${suffix}: ${result.id} status=${result.status ?? 'n/a'} requestId=${result.requestId ?? 'n/a'}`,
    );
  }

  if (summary.failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`smoke-saas-product: ${compactError(error)}`);
  process.exit(1);
});
