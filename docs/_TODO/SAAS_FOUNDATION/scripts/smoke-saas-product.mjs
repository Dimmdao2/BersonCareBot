#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..", "..");
const contractPath = resolve(repoRoot, "docs/_TODO/SAAS_FOUNDATION/saas-product-smoke-contract.json");

const modes = new Set(["dormant", "shadow", "locked"]);
const allowedAuthHeaderNames = new Set(["authorization", "cookie", "x-bersoncare-smoke-auth"]);

function usage() {
  return [
    "Usage:",
    "  node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-saas-product.mjs --check-contract",
    "  node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-saas-product.mjs --self-test",
    "  node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-saas-product.mjs --mode=dormant --base-url=https://test.bersoncare.ru --fixture-file=/run/bersoncarebot/saas-smoke.fixture [--json-output=out.json] [--junit-output=out.xml] [--include-mutations]",
    "",
    "Safety:",
    "  This runner never reads repo env files and never connects to a database.",
    "  Auth cookies/headers must come from an operator-managed fixture file outside the repo.",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    mode: "dormant",
    baseUrl: null,
    fixtureFile: null,
    jsonOutput: null,
    junitOutput: null,
    includeMutations: false,
    checkContract: false,
    selfTest: false,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--check-contract") {
      options.checkContract = true;
      continue;
    }
    if (arg === "--self-test") {
      options.selfTest = true;
      continue;
    }
    if (arg === "--include-mutations") {
      options.includeMutations = true;
      continue;
    }
    if (arg.startsWith("--mode=")) {
      options.mode = arg.slice("--mode=".length);
      continue;
    }
    if (arg.startsWith("--base-url=")) {
      options.baseUrl = arg.slice("--base-url=".length);
      continue;
    }
    if (arg.startsWith("--fixture-file=")) {
      options.fixtureFile = arg.slice("--fixture-file=".length);
      continue;
    }
    if (arg.startsWith("--json-output=")) {
      options.jsonOutput = arg.slice("--json-output=".length);
      continue;
    }
    if (arg.startsWith("--junit-output=")) {
      options.junitOutput = arg.slice("--junit-output=".length);
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
  return JSON.parse(readFileSync(path, "utf8"));
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

function validateContract(contract) {
  assert(contract.schemaVersion === 1, "contract schemaVersion must be 1");
  assert(contract.phase === "A1", "contract phase must be A1");
  assert(Array.isArray(contract.modes), "contract modes must be an array");
  for (const mode of ["dormant", "shadow", "locked"]) {
    assert(contract.modes.includes(mode), `contract missing mode ${mode}`);
  }
  assert(Array.isArray(contract.requiredFixtureRefs), "contract requiredFixtureRefs must be an array");
  assert(Array.isArray(contract.readOnlyScenarios), "contract readOnlyScenarios must be an array");
  assert(Array.isArray(contract.mutationScenarios), "contract mutationScenarios must be an array");

  const ids = new Set();
  const categories = new Set();
  for (const scenario of scenarioGroups(contract, true)) {
    assert(typeof scenario.id === "string" && scenario.id.length > 0, "scenario id is required");
    assert(!ids.has(scenario.id), `duplicate scenario id ${scenario.id}`);
    ids.add(scenario.id);
    assert(typeof scenario.actor === "string" && scenario.actor.length > 0, `${scenario.id}: actor is required`);
    assert(typeof scenario.category === "string" && scenario.category.length > 0, `${scenario.id}: category is required`);
    assert(typeof scenario.method === "string" && scenario.method.length > 0, `${scenario.id}: method is required`);
    assert(typeof scenario.path === "string" && scenario.path.startsWith("/"), `${scenario.id}: absolute path required`);
    assert(Number.isInteger(scenario.expectStatus), `${scenario.id}: expectStatus must be an integer`);
    categories.add(scenario.category);
  }

  for (const category of [
    "doctor",
    "schedule",
    "working_hours",
    "bookings",
    "client_card",
    "analytics",
    "content",
    "broadcasts",
    "admin_settings",
    "system_health",
    "patient_appointments",
    "patient_program",
    "patient_media",
    "public_booking",
    "server_actions",
  ]) {
    assert(categories.has(category), `contract missing category ${category}`);
  }

  const mutationDefaults = contract.mutationScenarios.every((scenario) => scenario.disabledByDefault === true);
  assert(mutationDefaults, "all mutation scenarios must be disabledByDefault in A1");
}

function validateFixture(contract, fixture) {
  assert(fixture.schemaVersion === 1, "fixture schemaVersion must be 1");
  assert(fixture.authProfiles && typeof fixture.authProfiles === "object", "fixture authProfiles object is required");
  assert(fixture.refs && typeof fixture.refs === "object", "fixture refs object is required");

  for (const actor of ["doctor", "clinic_admin", "patient", "public"]) {
    assert(fixture.authProfiles[actor], `fixture missing auth profile ${actor}`);
    const headers = fixture.authProfiles[actor].headers ?? {};
    assert(headers && typeof headers === "object" && !Array.isArray(headers), `${actor}: headers must be an object`);
    for (const headerName of Object.keys(headers)) {
      const normalized = headerName.toLowerCase();
      assert(
        allowedAuthHeaderNames.has(normalized) || normalized.startsWith("x-smoke-"),
        `${actor}: unsupported auth header ${headerName}`,
      );
    }
  }

  for (const refName of contract.requiredFixtureRefs) {
    assert(typeof fixture.refs[refName] === "string" && fixture.refs[refName].length > 0, `fixture missing ref ${refName}`);
  }

  if (fixture.forbiddenBodyText !== undefined) {
    assert(Array.isArray(fixture.forbiddenBodyText), "fixture forbiddenBodyText must be an array when present");
  }
}

function renderPath(pathTemplate, refs) {
  return pathTemplate.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    const value = refs[key];
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`missing fixture ref ${key} for path ${pathTemplate}`);
    }
    return encodeURIComponent(value);
  });
}

function headersForActor(fixture, actor) {
  return { ...(fixture.authProfiles[actor]?.headers ?? {}) };
}

function classifyResponse({ scenario, status, bodyText, expectedStatus, forbiddenBodyText }) {
  if (status === 401 || status === 403) {
    if (scenario.knownFailureHint === "G1" && (scenario.actor === "doctor" || scenario.actor === "clinic_admin")) {
      return "known_g1_doctor_admin_identity";
    }
    return "auth_denied";
  }

  if (status >= 500) {
    return "server_error";
  }

  if (status !== expectedStatus) {
    return "unexpected_status";
  }

  if (/digest["']?\s*[:=]\s*["']?[a-z0-9_-]{6,}/i.test(bodyText) || /Next\.js.+digest/i.test(bodyText)) {
    return "next_render_digest";
  }

  if (/(permission denied|row-level security|RLS|tenant_principal_violation|missing principal)/i.test(bodyText)) {
    return "permission_or_rls_error";
  }

  for (const forbidden of forbiddenBodyText) {
    if (typeof forbidden === "string" && forbidden.length > 0 && bodyText.includes(forbidden)) {
      return "forbidden_body_text";
    }
  }

  if (Number.isInteger(scenario.minBodyBytes) && bodyText.length < scenario.minBodyBytes) {
    return "unexpected_empty_fixture";
  }

  if (scenario.jsonExpectation) {
    const jsonResult = classifyJsonExpectation(bodyText, scenario.jsonExpectation);
    if (jsonResult) return jsonResult;
  }

  return null;
}

function classifyJsonExpectation(bodyText, expectation) {
  let value;
  try {
    value = JSON.parse(bodyText);
  } catch {
    return "unexpected_empty_fixture";
  }

  if (expectation === "object") {
    if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0) {
      return null;
    }
    return "unexpected_empty_fixture";
  }

  if (expectation === "non_empty") {
    if (Array.isArray(value)) {
      return value.length > 0 ? null : "unexpected_empty_fixture";
    }
    if (value && typeof value === "object") {
      if (Object.keys(value).length === 0) return "unexpected_empty_fixture";
      for (const nestedValue of Object.values(value)) {
        if (Array.isArray(nestedValue) && nestedValue.length > 0) return null;
      }
      return null;
    }
    return "unexpected_empty_fixture";
  }

  return `unsupported_json_expectation:${expectation}`;
}

function compactError(error) {
  return error instanceof Error ? error.message : String(error);
}

async function runScenario({ baseUrl, fixture, scenario }) {
  const path = renderPath(scenario.path, fixture.refs);
  const url = new URL(path, baseUrl).toString();
  const startedAt = Date.now();
  const headers = headersForActor(fixture, scenario.actor);
  headers["User-Agent"] = "bersoncarebot-saas-product-smoke-a1";

  try {
    const response = await fetch(url, {
      method: scenario.method,
      headers,
      redirect: "manual",
    });
    const bodyText = await response.text();
    const failureCode = classifyResponse({
      scenario,
      status: response.status,
      bodyText,
      expectedStatus: scenario.expectStatus,
      forbiddenBodyText: fixture.forbiddenBodyText ?? [],
    });

    return {
      id: scenario.id,
      actor: scenario.actor,
      category: scenario.category,
      method: scenario.method,
      path,
      status: response.status,
      durationMs: Date.now() - startedAt,
      requestId: response.headers.get("x-request-id") ?? response.headers.get("x-bc-auth-correlation-id") ?? null,
      outcome: failureCode ? "fail" : "pass",
      failureCode,
    };
  } catch (error) {
    return {
      id: scenario.id,
      actor: scenario.actor,
      category: scenario.category,
      method: scenario.method,
      path,
      status: null,
      durationMs: Date.now() - startedAt,
      requestId: null,
      outcome: "fail",
      failureCode: "request_failed",
      error: compactError(error),
    };
  }
}

function summarize({ mode, baseUrl, results }) {
  const failures = results.filter((result) => result.outcome !== "pass");
  return {
    schemaVersion: 1,
    phase: "A1",
    mode,
    baseUrl,
    startedAt: new Date().toISOString(),
    total: results.length,
    passed: results.length - failures.length,
    failed: failures.length,
    failureCodes: failures.reduce((acc, result) => {
      const key = result.failureCode ?? "unknown";
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
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function toJunit(summary) {
  const cases = summary.results
    .map((result) => {
      const attrs = `classname="saas.product.${xmlEscape(result.category)}" name="${xmlEscape(result.id)}" time="${(result.durationMs / 1000).toFixed(3)}"`;
      if (result.outcome === "pass") {
        return `    <testcase ${attrs}/>`;
      }
      const message = result.failureCode ?? "unknown";
      const detail = JSON.stringify({
        status: result.status,
        actor: result.actor,
        method: result.method,
        path: result.path,
        requestId: result.requestId,
        error: result.error,
      });
      return `    <testcase ${attrs}><failure message="${xmlEscape(message)}">${xmlEscape(detail)}</failure></testcase>`;
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="saas-product-smoke-a1" tests="${summary.total}" failures="${summary.failed}" errors="0">`,
    cases,
    "</testsuite>",
    "",
  ].join("\n");
}

function runSelfTest(contract) {
  validateContract(contract);
  const baseScenario = {
    id: "doctor.workspace.home",
    actor: "doctor",
    category: "doctor",
    method: "GET",
    path: "/app/doctor",
    expectStatus: 200,
    minBodyBytes: 10,
    knownFailureHint: "G1",
  };

  const cases = [
    {
      name: "known G1 classifier",
      input: { scenario: baseScenario, status: 403, bodyText: "Forbidden", expectedStatus: 200, forbiddenBodyText: [] },
      expected: "known_g1_doctor_admin_identity",
    },
    {
      name: "server error classifier",
      input: { scenario: { ...baseScenario, knownFailureHint: undefined }, status: 502, bodyText: "", expectedStatus: 200, forbiddenBodyText: [] },
      expected: "server_error",
    },
    {
      name: "Next digest classifier",
      input: { scenario: baseScenario, status: 200, bodyText: "Application error: digest: abc123xyz", expectedStatus: 200, forbiddenBodyText: [] },
      expected: "next_render_digest",
    },
    {
      name: "permission classifier",
      input: { scenario: baseScenario, status: 200, bodyText: "permission denied for table patients", expectedStatus: 200, forbiddenBodyText: [] },
      expected: "permission_or_rls_error",
    },
    {
      name: "empty fixture classifier",
      input: { scenario: { ...baseScenario, minBodyBytes: 50 }, status: 200, bodyText: "short", expectedStatus: 200, forbiddenBodyText: [] },
      expected: "unexpected_empty_fixture",
    },
    {
      name: "forbidden text classifier",
      input: { scenario: baseScenario, status: 200, bodyText: "contains sentinel", expectedStatus: 200, forbiddenBodyText: ["sentinel"] },
      expected: "forbidden_body_text",
    },
  ];

  for (const testCase of cases) {
    const actual = classifyResponse(testCase.input);
    assert(actual === testCase.expected, `${testCase.name}: expected ${testCase.expected}, got ${actual}`);
  }

  const fixture = {
    schemaVersion: 1,
    authProfiles: {
      doctor: { headers: { Cookie: "masked" } },
      clinic_admin: { headers: { Cookie: "masked" } },
      patient: { headers: { Cookie: "masked" } },
      public: { headers: {} },
    },
    refs: Object.fromEntries(contract.requiredFixtureRefs.map((key) => [key, `fixture-${key}`])),
  };
  validateFixture(contract, fixture);
  assert(
    renderPath("/x/{doctorClientUserId}", fixture.refs) === "/x/fixture-doctorClientUserId",
    "fixture path interpolation failed",
  );

  console.log("smoke-saas-product self-test: OK");
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
    console.log("smoke-saas-product contract: OK");
    return;
  }

  if (!options.baseUrl || !options.fixtureFile) {
    throw new Error(`Real smoke requires --base-url and --fixture-file.\n\n${usage()}`);
  }

  const fixture = readJson(options.fixtureFile);
  validateFixture(contract, fixture);
  const scenarios = scenarioGroups(contract, options.includeMutations);
  const results = [];

  for (const scenario of scenarios) {
    results.push(await runScenario({ baseUrl: options.baseUrl, fixture, scenario }));
  }

  const summary = summarize({ mode: options.mode, baseUrl: options.baseUrl, results });

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
    const suffix = result.outcome === "pass" ? "PASS" : `FAIL ${result.failureCode}`;
    console.log(`${suffix}: ${result.id} status=${result.status ?? "n/a"} requestId=${result.requestId ?? "n/a"}`);
  }

  if (summary.failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`smoke-saas-product: ${compactError(error)}`);
  process.exit(1);
});
