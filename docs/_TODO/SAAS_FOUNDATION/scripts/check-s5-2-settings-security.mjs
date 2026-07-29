#!/usr/bin/env node

import { readFileSync } from 'node:fs';

import { renderP05bGrantsSql } from './p0-5b-grants-sql.mjs';
import { buildRlsDescriptors } from './rls-descriptor-model.mjs';
import { renderS5ConfigReaderSql, s5ConfigReaderArtifactPath } from './s5-config-reader-sql.mjs';

const grantsPath = 'deploy/postgres/p0-5b-grants.sql';

function fail(message) {
  throw new Error(message);
}

if (readFileSync(s5ConfigReaderArtifactPath, 'utf8') !== renderS5ConfigReaderSql()) {
  fail(`${s5ConfigReaderArtifactPath} is not generator-synchronized`);
}
if (readFileSync(grantsPath, 'utf8') !== renderP05bGrantsSql()) {
  fail(`${grantsPath} is not generator-synchronized`);
}

const descriptors = buildRlsDescriptors();
if (descriptors.get('public.app_runtime_settings')?.scopingKind !== 'bootstrap_runtime_audience') {
  fail('app_runtime_settings lacks explicit runtime-audience descriptor classification');
}
if (
  descriptors.get('public.app_runtime_settings_audit')?.scopingKind !== 'bootstrap_runtime_audit'
) {
  fail('app_runtime_settings_audit lacks explicit staff-only audit descriptor classification');
}

console.log('check-s5-2-settings-security: generated artifacts and classifications OK');
