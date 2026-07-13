#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getPhase4LockedPolicyTargets,
  phase4LockedPolicyArtifactPath,
  renderPhase4LockedPolicyArtifact,
} from "./phase4-locked-policy-artifact.mjs";

const migrationsDir = "apps/webapp/db/drizzle-migrations";
const forceCutoverSqlPath = "deploy/postgres/phase4-force-rls-cutover.sql";
const migrationFilePattern = /^(016\d|017[0-5])_.*\.sql$/;
const createPolicyPattern = /CREATE POLICY "([^"]+)" ON "([^"]+)"\."([^"]+)"/g;
const dropPolicyPattern = /DROP POLICY IF EXISTS "([^"]+)" ON "([^"]+)"\."([^"]+)"/g;
const rawContextPattern = /current_setting\('app\.(?:org|patient_user_id|integrator_user_id|actor)'/;
const helperPattern = /app\.(?:current_org_id|current_patient_user_id|current_integrator_user_id|is_staff)\(\)/;
const cutoverTargetPattern = /\('((?:''|[^'])+)'\)/g;

function fail(message) {
  throw new Error(message);
}

function policyKey({ table, policyName }) {
  return `${table}\t${policyName}`;
}

function quotedTable(table) {
  const [schema, name] = table.split(".");
  return `"${schema}"."${name}"`;
}

function readFinalDormantPolicySet() {
  const policies = new Map();
  const files = readdirSync(migrationsDir).filter((file) => migrationFilePattern.test(file)).sort();

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");

    for (const match of sql.matchAll(dropPolicyPattern)) {
      policies.delete(policyKey({ table: `${match[2]}.${match[3]}`, policyName: match[1] }));
    }

    for (const match of sql.matchAll(createPolicyPattern)) {
      const entry = { table: `${match[2]}.${match[3]}`, policyName: match[1], file };
      policies.set(policyKey(entry), entry);
    }
  }

  return policies;
}

function readCutoverTargets() {
  const sql = readFileSync(forceCutoverSqlPath, "utf8");
  const targets = [];

  for (const match of sql.matchAll(cutoverTargetPattern)) {
    targets.push(match[1].replaceAll("''", "'"));
  }

  return targets;
}

const artifact = readFileSync(phase4LockedPolicyArtifactPath, "utf8");
const expectedArtifact = renderPhase4LockedPolicyArtifact();

if (artifact !== expectedArtifact) {
  fail(`${phase4LockedPolicyArtifactPath} is not in sync with phase4-locked-policy-artifact.mjs`);
}

if (rawContextPattern.test(artifact)) {
  fail(`${phase4LockedPolicyArtifactPath} must not contain raw current_setting('app.*') context reads`);
}

const generatedTargets = getPhase4LockedPolicyTargets();
const generatedPolicySet = new Set(generatedTargets.map(({ descriptor, policyName }) => policyKey({
  table: descriptor.table,
  policyName,
})));
const dormantPolicySet = readFinalDormantPolicySet();

if (dormantPolicySet.size !== 161 || generatedPolicySet.size !== 161) {
  fail(`Expected 161 final dormant/generated wall policies, got dormant=${dormantPolicySet.size}, generated=${generatedPolicySet.size}`);
}

const missingFromArtifact = [...dormantPolicySet.keys()].filter((key) => !generatedPolicySet.has(key)).sort();
const extraInArtifact = [...generatedPolicySet].filter((key) => !dormantPolicySet.has(key)).sort();

if (missingFromArtifact.length > 0 || extraInArtifact.length > 0) {
  fail(
    `Phase4 locked artifact target mismatch. Missing: ${missingFromArtifact.join(", ") || "<none>"}. Extra: ${
      extraInArtifact.join(", ") || "<none>"
    }`,
  );
}

const cutoverTargets = readCutoverTargets();
const generatedQuotedTargets = generatedTargets.map(({ descriptor }) => quotedTable(descriptor.table)).sort();
const cutoverSorted = [...cutoverTargets].sort();

if (JSON.stringify(cutoverSorted) !== JSON.stringify(generatedQuotedTargets)) {
  const generatedSet = new Set(generatedQuotedTargets);
  const cutoverSet = new Set(cutoverTargets);
  const missing = generatedQuotedTargets.filter((target) => !cutoverSet.has(target));
  const extra = cutoverTargets.filter((target) => !generatedSet.has(target));
  fail(
    `${forceCutoverSqlPath} targets must match ${phase4LockedPolicyArtifactPath}. Missing: ${
      missing.join(", ") || "<none>"
    }. Extra: ${extra.join(", ") || "<none>"}`,
  );
}

const createStatements = [...artifact.matchAll(/^CREATE POLICY [\s\S]*?;$/gm)].map((match) => match[0]);
const dropStatements = [...artifact.matchAll(/^DROP POLICY IF EXISTS /gm)];

if (createStatements.length !== 322) {
  fail(`${phase4LockedPolicyArtifactPath} must contain 322 CREATE POLICY statements (strict + dormant branches), got ${createStatements.length}`);
}

if (dropStatements.length !== 161) {
  fail(`${phase4LockedPolicyArtifactPath} must contain 161 DROP POLICY statements, got ${dropStatements.length}`);
}

for (const statement of createStatements) {
  if (!helperPattern.test(statement)) {
    fail(`Every phase4 replacement policy must use locked helper predicates; missing helper in: ${statement.slice(0, 180)}...`);
  }
}

console.log("check-phase4-locked-policy-artifact: OK (161 policies, helper-based, no raw GUC context)");
