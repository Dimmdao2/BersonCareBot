#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  quoteQualifiedName,
  quoteSqlIdentifier,
  renderBootstrapHybridPredicate,
  renderOrgPredicate,
  renderPatientPredicate,
  renderPolicyTarget,
} from "./rls-sql-renderer.mjs";

const orgGuc = "NULLIF(current_setting('app.org', true), '')";
const patientGuc = "NULLIF(current_setting('app.patient_user_id', true), '')";
const orgA = "00000000-0000-4000-8000-000000000001";
const orgB = "00000000-0000-4000-8000-000000000002";
const patientA = "10000000-0000-4000-8000-000000000001";
const patientB = "10000000-0000-4000-8000-000000000002";

function evaluateUuidPredicate({ rowValue, gucValue, mode }) {
  const normalizedGuc = gucValue === "" || gucValue == null ? null : gucValue;

  if (mode === "dormant_permissive" && normalizedGuc == null) {
    return true;
  }

  if (mode === "enforce" && normalizedGuc == null) {
    return false;
  }

  return rowValue === normalizedGuc;
}

function evaluateBootstrapHybrid({ rowOrg, gucValue }) {
  const normalizedGuc = gucValue === "" || gucValue == null ? null : gucValue;

  return rowOrg == null || (normalizedGuc != null && rowOrg === normalizedGuc);
}

const directOrgDescriptor = {
  table: "public.patient_files",
  tier: "SCOPED",
  scopingKind: "direct_org_column",
  predicateTemplate: "org_column_matches_app_org",
  orgColumn: "organization_id",
};

assert.equal(
  renderOrgPredicate(directOrgDescriptor, { mode: "dormant_permissive" }),
  `(${orgGuc} IS NULL OR "organization_id" = ${orgGuc}::uuid)`,
  "direct org predicate should permit unset app.org in dormant mode",
);

assert.equal(
  renderOrgPredicate(directOrgDescriptor, { mode: "enforce" }),
  `(${orgGuc} IS NOT NULL AND "organization_id" = ${orgGuc}::uuid)`,
  "direct org predicate should require app.org in enforce mode",
);

assert.equal(
  renderPatientPredicate({ patientColumn: "platform_user_id", mode: "enforce" }),
  `(${patientGuc} IS NOT NULL AND "platform_user_id" = ${patientGuc}::uuid)`,
  "patient predicate should require matching app.patient_user_id in enforce mode",
);

assert.equal(
  renderBootstrapHybridPredicate({ orgColumn: "organization_id" }),
  `("organization_id" IS NULL OR (${orgGuc} IS NOT NULL AND "organization_id" = ${orgGuc}::uuid))`,
  "bootstrap hybrid predicate should allow global rows or matching app.org",
);

assert.equal(
  evaluateUuidPredicate({ rowValue: orgA, gucValue: undefined, mode: "dormant_permissive" }),
  true,
  "unset app.org should permit rows in dormant permissive mode",
);

assert.equal(
  evaluateUuidPredicate({ rowValue: orgA, gucValue: orgB, mode: "enforce" }),
  false,
  "wrong app.org should deny rows in enforce mode",
);

assert.equal(
  evaluateUuidPredicate({ rowValue: orgA, gucValue: "", mode: "enforce" }),
  false,
  "empty app.org should deny rows in enforce mode",
);

assert.equal(
  evaluateUuidPredicate({ rowValue: patientA, gucValue: patientA, mode: "enforce" }),
  true,
  "matching patient principal should permit patient-owned rows in enforce mode",
);

assert.equal(
  evaluateUuidPredicate({ rowValue: patientA, gucValue: patientB, mode: "enforce" }),
  false,
  "wrong patient principal should deny patient-owned rows in enforce mode",
);

assert.equal(evaluateBootstrapHybrid({ rowOrg: null, gucValue: undefined }), true);
assert.equal(evaluateBootstrapHybrid({ rowOrg: orgA, gucValue: orgA }), true);
assert.equal(evaluateBootstrapHybrid({ rowOrg: orgA, gucValue: orgB }), false);
assert.equal(evaluateBootstrapHybrid({ rowOrg: orgA, gucValue: "" }), false);

assert.equal(quoteSqlIdentifier("organization_id"), '"organization_id"');
assert.equal(quoteQualifiedName("public.patient_files"), '"public"."patient_files"');
assert.equal(renderPolicyTarget("integrator.user_reminder_rules"), '"integrator"."user_reminder_rules"');
assert.throws(() => quoteSqlIdentifier("organization_id; DROP TABLE patients"), /Unsafe SQL identifier/);
assert.throws(() => quoteQualifiedName("public.patient-files"), /Unsafe SQL identifier/);

console.log("P0.8.2 RLS SQL renderer predicate tests OK.");

