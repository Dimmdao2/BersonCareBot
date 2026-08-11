#!/usr/bin/env node

import { readFileSync } from 'node:fs';

import {
  appStaffNoRuntimeDmlTables,
  getAppStaffGrantTables,
  renderP05bGrantsSql,
} from './p0-5b-grants-sql.mjs';

const artifactPath = 'deploy/postgres/p0-5b-grants.sql';

function fail(message) {
  throw new Error(message);
}

const firstRender = renderP05bGrantsSql();
const secondRender = renderP05bGrantsSql();
if (firstRender !== secondRender) {
  fail('p0-5b-grants-sql.mjs output is not deterministic across consecutive renders');
}
if (readFileSync(artifactPath, 'utf8') !== firstRender) {
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

if (!appStaffNoRuntimeDmlTables.has('integrator.message_drafts')) {
  fail('integrator.message_drafts must be an explicit app_staff no-runtime-DML relation');
}
if (
  getAppStaffGrantTables().some((table) => table.qualifiedName === 'integrator.message_drafts')
) {
  fail('integrator.message_drafts leaked into the generated app_staff grant surface');
}

console.log('check-saas-d3-4-bootstrap-base-login-grants: generated grant artifact OK');
