#!/usr/bin/env node

import { readFileSync } from "node:fs";

const opsSqlPath = "deploy/postgres/p2-b-protected-principal-context.sql";
const opsSql = readFileSync(opsSqlPath, "utf8");

function fail(message) {
  throw new Error(message);
}

function requireFragments(label, text, fragments) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) {
      fail(`Missing required ${label} fragment: ${fragment}`);
    }
  }
}

function forbidFragments(label, text, fragments) {
  for (const fragment of fragments) {
    if (text.includes(fragment)) {
      fail(`${label} must not include forbidden fragment: ${fragment}`);
    }
  }
}

const executableSql = opsSql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

requireFragments("P2-B ops SQL", opsSql, [
  "p2_b_owner_role",
  "p2_b_staff_role",
  "p2_b_patient_role",
  "p2_b_signing_secret",
  "pgcrypto_must_be_installed_in_app_ext",
  "CREATE TABLE IF NOT EXISTS app.context_signing_secrets",
  "CREATE TABLE IF NOT EXISTS app.principal_context",
  "CREATE TABLE IF NOT EXISTS app.context_nonce_ledger",
  "CREATE OR REPLACE FUNCTION app.install_signed_context(",
  "SECURITY DEFINER",
  "SET search_path = app, app_ext, pg_catalog",
  "p_signature_hex IS NULL OR p_signature_hex !~ '^[0-9a-fA-F]{64}$'",
  "lower(p_signature_hex) IS DISTINCT FROM v_expected",
  "CREATE OR REPLACE FUNCTION app.current_org_id() RETURNS uuid",
  "CREATE OR REPLACE FUNCTION app.current_patient_user_id() RETURNS uuid",
  "CREATE OR REPLACE FUNCTION app.current_integrator_user_id() RETURNS bigint",
  "CREATE OR REPLACE FUNCTION app.reset_principal_context() RETURNS void",
  "CREATE OR REPLACE FUNCTION app.release_principal_context() RETURNS void",
  "CREATE OR REPLACE FUNCTION app.is_staff() RETURNS boolean",
  "pg_has_role(current_user, %L, 'member')",
  "REVOKE ALL ON app.context_signing_secrets FROM PUBLIC",
  "REVOKE ALL ON app.principal_context FROM PUBLIC",
  "REVOKE ALL ON app.context_nonce_ledger FROM PUBLIC",
  "GRANT EXECUTE ON FUNCTION app.install_signed_context(text, integer, bigint, uuid, uuid, bigint, text)",
  "GRANT EXECUTE ON FUNCTION app.current_org_id()",
  "GRANT EXECUTE ON FUNCTION app.current_patient_user_id()",
  "GRANT EXECUTE ON FUNCTION app.current_integrator_user_id()",
  "\\if :{?p2_b_down}",
]);

forbidFragments("P2-B ops SQL", opsSql, [
  "/opt/env/bersoncarebot",
  "api.prod",
  "webapp.prod",
  "bcb_webapp_prod",
  "bcb_webapp_dev",
  "REASSIGN OWNED",
  "DROP OWNED",
]);

forbidFragments("P2-B executable SQL", executableSql, [
  "current_setting('app.org'",
  "current_setting('app.patient_user_id'",
  "current_setting('app.integrator_user_id'",
  "current_setting('app.actor'",
  "SET search_path = public",
]);

if (!/INSERT INTO app\.context_signing_secrets \(id, secret\)\s+VALUES \(true, :'p2_b_signing_secret'\)/.test(opsSql)) {
  fail("P2-B ops SQL must source the signing secret only from the p2_b_signing_secret psql variable");
}

if (/[0-9a-f]{64}/i.test(executableSql.replace("sha256", ""))) {
  fail("P2-B ops SQL must not commit a hex-looking signing secret literal");
}

console.log("check-p2-b-protected-context-sql: OK");
