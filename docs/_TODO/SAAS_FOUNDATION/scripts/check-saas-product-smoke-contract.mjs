#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const files = {
  a1Doc: "docs/_TODO/SAAS_FOUNDATION/SAAS_PRODUCT_SMOKE_A1.md",
  fixtureOperatorPacket: "docs/_TODO/SAAS_FOUNDATION/SAAS_PRODUCT_SMOKE_FIXTURE_OPERATOR_PACKET.md",
  roadmap: "docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md",
  hardProtocol: "docs/_TODO/SAAS_FOUNDATION/HARD_MIGRATION_PROTOCOL.md",
  tenantLog: "docs/_TODO/SAAS_FOUNDATION/TENANT_HARD_MODE_LOG.md",
  deployTestSaas: "deploy/host/deploy-test-saas.sh",
  contract: "docs/_TODO/SAAS_FOUNDATION/saas-product-smoke-contract.json",
  smokeRunner: "docs/_TODO/SAAS_FOUNDATION/scripts/smoke-saas-product.mjs",
};

function read(path) {
  return readFileSync(resolve(path), "utf8");
}

function requireFragments(label, text, fragments) {
  const missing = fragments.filter((fragment) => !text.includes(fragment));
  if (missing.length > 0) {
    throw new Error(`${label} missing required fixture-gate fragment(s):\n- ${missing.join("\n- ")}`);
  }
}

function runFixtureGateDocChecks() {
  const a1Doc = read(files.a1Doc);
  const fixtureOperatorPacket = read(files.fixtureOperatorPacket);
  const roadmap = read(files.roadmap);
  const hardProtocol = read(files.hardProtocol);
  const tenantLog = read(files.tenantLog);
  const deployTestSaas = read(files.deployTestSaas);
  const smokeRunner = read(files.smokeRunner);

  requireFragments(files.a1Doc, a1Doc, [
    "## D3.0 Fixture Gate Contract",
    "`SAAS_PRODUCT_SMOKE_FIXTURE` unset means **SKIPPED/BLOCKED**, never PASS.",
    "owner/operator-managed",
    "--fixture-file=/run/bersoncarebot/saas-smoke.fixture",
    "must not read `/opt/env`, TEST/prod databases",
    "SAAS_PRODUCT_SMOKE_FIXTURE_OPERATOR_PACKET.md",
    "not D3/R1/R2 PASS evidence",
    "## D3.3 Meaningful JSON Evidence",
    "Empty or mismatched fixture facts keep D3/R1/R2 blocked",
  ]);

  requireFragments(files.fixtureOperatorPacket, fixtureOperatorPacket, [
    "# SaaS Product Smoke Fixture Operator Packet",
    "not D3, R1, or R2\nPASS evidence",
    "/run/bersoncarebot/saas-smoke.fixture",
    "REDACTED_PLACEHOLDER_NON_RUNNABLE",
    "REDACTED_OPAQUE_TEST_REF_NON_RUNNABLE",
    "--check-fixture",
    "--mode=locked",
    "--base-url=https://test.bersoncare.ru",
    "Do not use dev auth bypass on TEST.",
    "Do not read `/opt/env`",
    "Do not manually clean up DB rows",
    "Do not trigger real delivery beyond owner-approved TEST send-safety.",
    "public profile must have no headers",
    "never the rendered ref values",
    "Successful offline preflight means only",
    "D3/R1/R2 product-smoke PASS requires actual live smoke command output with exit 0.",
  ]);

  requireFragments(files.roadmap, roadmap, [
    "If the operator-managed\n`SAAS_PRODUCT_SMOKE_FIXTURE` / `--fixture-file` path is absent, this gate is **SKIPPED/BLOCKED**, not PASS.",
    "Missing `SAAS_PRODUCT_SMOKE_FIXTURE` remains a **SKIPPED/BLOCKED** product gate and cannot be\nused as R2 evidence.",
    "Confirm an owner/operator-managed product smoke fixture file path is supplied.",
    "If the fixture is absent, record\n  **SKIPPED/BLOCKED** and stop before claiming D3/R1/R2 evidence.",
    "`SAAS_PRODUCT_SMOKE_FIXTURE` unset is a documented blocker,\nnot a successful D3 exit.",
  ]);

  requireFragments(files.hardProtocol, hardProtocol, [
    "A1/product smoke when `SAAS_PRODUCT_SMOKE_FIXTURE` is supplied",
    "If `SAAS_PRODUCT_SMOKE_FIXTURE` is unset, the wrapper's product smoke line is **SKIPPED/BLOCKED** for product parity",
    "D3/R1/R2 product-smoke evidence remains open",
    "owner/operator-managed secret file path outside the repo",
  ]);

  requireFragments(files.deployTestSaas, deployTestSaas, [
    "saas product smoke: skipped (SAAS_PRODUCT_SMOKE_FIXTURE not set)",
    "[ -r \"$SAAS_PRODUCT_SMOKE_FIXTURE\" ]",
    "--fixture-file=\"$SAAS_PRODUCT_SMOKE_FIXTURE\"",
  ]);

  requireFragments(files.smokeRunner, smokeRunner, [
    'const responseError = Object.hasOwn(value, "error") ? value.error : undefined;',
    'responseError !== null && responseError !== undefined',
    "function isMeaningfulRequiredValue(value)",
    "!isMeaningfulRequiredValue(found.value)",
    'const keyedValue = found.value[fixtureKey];',
    "!isMeaningfulRequiredValue(keyedValue)",
    'actor === "public" ? headerEntries.length === 0 : headerEntries.length > 0',
    '"public auth profile must not contain auth headers"',
    'redirect: "manual"',
    "path: scenario.path",
    'name: "object expectation rejects object-valued error"',
    'name: "required path rejects empty string"',
    'name: "required path rejects empty object"',
    'name: "discussion summary rejects null fixture item fact"',
    'name: "discussion summary rejects empty fixture item fact"',
    'name: "playback fixtureEquals rejects mismatched mediaFileId"',
    'name: "playback fixtureEquals rejects missing mediaFileId"',
    'name: "playback rejects invalid delivery descriptor"',
    'name: "playback rejects URL for different media fixture"',
  ]);

  requireFragments(files.tenantLog, tenantLog, [
    "D3.2 product-smoke fixture operator packet",
    "REDACTED non-runnable placeholders",
    "D3 real execution remains blocked until owner/operator supplies a readable fixture path and authorizes live TEST smoke.",
    "D3.0 product-smoke fixture gate contract",
    "missing `SAAS_PRODUCT_SMOKE_FIXTURE` is `SKIPPED/BLOCKED`, not PASS",
    "Remaining blocker for D3 real execution",
  ]);

  const contract = JSON.parse(read(files.contract));
  const patientMediaPlayback = contract.readOnlyScenarios?.find(
    (scenario) => scenario.id === "patient.media.playback",
  );
  if (patientMediaPlayback?.actor !== "patient") {
    throw new Error(
      `${files.contract} must run patient.media.playback as the patient actor; a staff actor would mask the D3 patient wall`,
    );
  }

  const scenariosById = new Map(contract.readOnlyScenarios.map((scenario) => [scenario.id, scenario]));
  for (const [scenarioId, path] of [
    ["doctor.working-hours.api", "rows"],
    ["doctor.appointments.list", "appointments"],
    ["public.booking.slots", "slots"],
  ]) {
    const expectation = scenariosById.get(scenarioId)?.jsonExpectation;
    if (
      expectation?.type !== "object" ||
      expectation.requireSuccess !== true ||
      !expectation.nonEmptyPaths?.includes(path)
    ) {
      throw new Error(`${files.contract} must require successful non-empty ${path} for ${scenarioId}`);
    }
  }

  const discussionExpectation = scenariosById.get("patient.program.item.discussion-summary")?.jsonExpectation;
  if (
    discussionExpectation?.requireSuccess !== true ||
    !discussionExpectation.fixtureKeys?.some(
      (check) => check.path === "summaryByItemId" && check.ref === "patientProgramItemId",
    )
  ) {
    throw new Error(`${files.contract} must bind discussion summary evidence to patientProgramItemId`);
  }

  const playbackExpectation = patientMediaPlayback?.jsonExpectation;
  if (
    !playbackExpectation?.fixtureEquals?.some(
      (check) => check.path === "mediaId" && check.ref === "mediaFileId",
    ) ||
    !playbackExpectation.fixtureContains?.some(
      (check) => check.path === "mp4.url" && check.ref === "mediaFileId",
    ) ||
    !playbackExpectation.allowedValues?.some(
      (check) =>
        check.path === "delivery" &&
        ["hls", "mp4", "file"].every((delivery) => check.values?.includes(delivery)),
    ) ||
    !playbackExpectation.requiredPaths?.includes("delivery") ||
    !playbackExpectation.requiredPaths?.includes("mp4.url")
  ) {
    throw new Error(`${files.contract} must bind playback evidence to mediaFileId and a delivery descriptor`);
  }
}

function makeSyntheticFixtureFile() {
  const contract = JSON.parse(read(files.contract));
  const tempDir = mkdtempSync(resolve(tmpdir(), "bcb-saas-product-smoke-"));
  const fixturePath = resolve(tempDir, "synthetic.fixture.json");
  const fixture = {
    schemaVersion: 1,
    authProfiles: {
      doctor: { headers: { Cookie: "synthetic-doctor-cookie" } },
      clinic_admin: { headers: { Cookie: "synthetic-admin-cookie" } },
      patient: { headers: { Cookie: "synthetic-patient-cookie" } },
      public: { headers: {} },
    },
    refs: Object.fromEntries(contract.requiredFixtureRefs.map((key) => [key, `synthetic-${key}`])),
    forbiddenBodyText: ["synthetic-forbidden-sentinel"],
  };
  writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`);
  return { tempDir, fixturePath };
}

const steps = [
  ["node", "--check", "docs/_TODO/SAAS_FOUNDATION/scripts/smoke-saas-product.mjs"],
  ["node", "docs/_TODO/SAAS_FOUNDATION/scripts/smoke-saas-product.mjs", "--check-contract"],
  ["node", "docs/_TODO/SAAS_FOUNDATION/scripts/smoke-saas-product.mjs", "--self-test"],
];

const { tempDir, fixturePath } = makeSyntheticFixtureFile();
steps.push([
  "node",
  "docs/_TODO/SAAS_FOUNDATION/scripts/smoke-saas-product.mjs",
  "--check-fixture",
  `--fixture-file=${fixturePath}`,
  "--categories=doctor",
]);

try {
  for (const step of steps) {
    console.log(`check-saas-product-smoke-contract: $ ${step.join(" ")}`);
    const result = spawnSync(step[0], step.slice(1), { stdio: "inherit" });
    if (result.error) {
      console.error(`check-saas-product-smoke-contract: failed to start ${step.join(" ")}`);
      console.error(result.error.message);
      process.exit(1);
    }
    if (result.status !== 0) {
      console.error(`check-saas-product-smoke-contract: FAILED ${step.join(" ")}`);
      process.exit(result.status ?? 1);
    }
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

runFixtureGateDocChecks();
console.log("check-saas-product-smoke-contract: OK");
