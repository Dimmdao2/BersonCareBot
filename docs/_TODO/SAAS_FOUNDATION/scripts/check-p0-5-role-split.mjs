#!/usr/bin/env node

import { readFileSync } from "node:fs";

const docPath = "docs/_TODO/SAAS_FOUNDATION/P0_5_DB_ROLE_SPLIT.md";
const proofPath = "docs/_TODO/SAAS_FOUNDATION/P0_5_DB_ROLE_SPLIT_PROOF.sql";

const doc = readFileSync(docPath, "utf8");
const proof = readFileSync(proofPath, "utf8");

const requiredDocFragments = [
  "Dormant; no runtime role flip.",
  "does not introduce new env variables",
  "App runtime role",
  "Must be `NOBYPASSRLS`",
  "Do not run it on dev/prod PII databases.",
  "No production role creation.",
  "No app runtime `DATABASE_URL` change.",
];

const requiredProofFragments = [
  "current_database() LIKE 'bcb_saas_%'",
  "scratch",
  "SELECT 1 / 0 AS p0_5_abort",
  "rolsuper OR rolcreaterole",
  "CREATE ROLE :\"p0_5_app_role\" NOLOGIN NOBYPASSRLS;",
  "ALTER TABLE p0_5_role_split_proof.scoped_rows FORCE ROW LEVEL SECURITY;",
  "current_setting('app.org', true)",
  "SET LOCAL ROLE :\"p0_5_app_role\";",
  "RESET ROLE;",
  "ROLLBACK;",
];

for (const fragment of requiredDocFragments) {
  if (!doc.includes(fragment)) {
    throw new Error(`Missing required P0.5.1 doc fragment: ${fragment}`);
  }
}

for (const fragment of requiredProofFragments) {
  if (!proof.includes(fragment)) {
    throw new Error(`Missing required P0.5.1 proof fragment: ${fragment}`);
  }
}

const forbiddenProofFragments = [
  "/opt/env/bersoncarebot",
  "api.prod",
  "webapp.prod",
  "bcb_webapp_prod",
  "bcb_webapp_dev",
];

for (const fragment of forbiddenProofFragments) {
  if (proof.includes(fragment)) {
    throw new Error(`P0.5.1 proof must not reference real runtime environment: ${fragment}`);
  }
}

console.log("P0.5.1 role split contract/proof artifacts OK.");
