#!/usr/bin/env node

import { readFileSync } from 'node:fs';

import { getAppStaffGrantTables, renderP05bGrantsSql } from './p0-5b-grants-sql.mjs';

const artifactPath = 'deploy/postgres/p0-5b-grants.sql';

function fail(message) {
  throw new Error(message);
}

if (readFileSync(artifactPath, 'utf8') !== renderP05bGrantsSql()) {
  fail(`${artifactPath} is not in sync with p0-5b-grants-sql.mjs`);
}

const dedicatedOverlayTables = new Set([
  'public.app_runtime_settings',
  'public.app_runtime_settings_audit',
  'public.staff_security_profiles',
]);
const leakedDedicatedTables = getAppStaffGrantTables()
  .map((table) => table.qualifiedName)
  .filter((table) => dedicatedOverlayTables.has(table));
if (leakedDedicatedTables.length > 0) {
  fail(
    `P0.5b app_staff grant surface includes dedicated-overlay tables: ${leakedDedicatedTables.join(', ')}`,
  );
}

console.log('check-saas-d3-4-bootstrap-base-login-grants: generated grant artifact OK');
