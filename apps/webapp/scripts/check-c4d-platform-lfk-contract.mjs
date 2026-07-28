#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webappRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(webappRoot, '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function requireText(source, expected, label) {
  if (!source.includes(expected)) throw new Error(`C4D contract missing: ${label}`);
}

const migration = read('apps/webapp/db/drizzle-migrations/0217_platform_lfk_ownership.sql');
const schema = read('apps/webapp/db/schema/schema.ts');
const onlineIndex = read('deploy/postgres/c4d-platform-lfk-media-owner-online-index.sql');
const merge = read('packages/platform-merge/src/pgPlatformUserMerge.ts');
const mergePreview = read('apps/webapp/src/infra/platformUserMergePreview.ts');

if (/CREATE\s+INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+idx_media_files_owner/i.test(migration)) {
  throw new Error('C4D contract: hot media_files index must not run inside migration 0217');
}
requireText(
  onlineIndex,
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_files_owner',
  'standalone concurrent media_files owner index',
);
requireText(
  onlineIndex,
  'ON public.media_files (owner_kind, organization_id, status, created_at DESC)',
  'media_files owner index column order',
);
requireText(onlineIndex, 'index_state.indnkeyatts = 4', 'online index exact key count postcheck');
requireText(
  onlineIndex,
  "ARRAY['owner_kind', 'organization_id', 'status', 'created_at']::text[]",
  'online index exact ordered-column postcheck',
);
requireText(onlineIndex, 'index_state.indpred IS NULL', 'online index no-predicate postcheck');
requireText(
  onlineIndex,
  'ARRAY[false, false, false, true]::boolean[]',
  'online index direction postcheck',
);
if (/^\s*(BEGIN|START\s+TRANSACTION|COMMIT)\b/im.test(onlineIndex)) {
  throw new Error('C4D contract: online index artifact must stay transaction-free');
}

for (const [source, label] of [
  [migration, 'migration'],
  [schema, 'Drizzle schema'],
]) {
  requireText(source, 'idx_patient_lfk_assign_active_template', `${label} assignment unique index`);
  const organizationAt = source.indexOf('organization_id, patient_user_id, template_id');
  const drizzleOrganizationAt = source.indexOf(
    'table.organizationId.asc()',
    source.indexOf('idx_patient_lfk_assign_active_template'),
  );
  if (organizationAt < 0 && drizzleOrganizationAt < 0) {
    throw new Error(`C4D contract: ${label} assignment unique index is not organization-first`);
  }
}
requireText(
  migration,
  'duplicate active patient LFK assignment inside one organization',
  'assignment duplicate preflight',
);
requireText(
  merge,
  'a.organization_id = b.organization_id',
  'platform merge exact-org assignment conflict guard',
);
requireText(
  mergePreview,
  'a.organization_id = b.organization_id',
  'merge preview exact-org assignment conflict guard',
);

console.log('check-c4d-platform-lfk-contract: OK');
