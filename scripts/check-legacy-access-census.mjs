#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const forbidden = [
  /integrator_linked_phone_source/u,
  /public_then_contacts/u,
  /contacts_only/u,
  /\bintegrator\.contacts\b/u,
  /\b(?:FROM|JOIN)\s+contacts\b/iu,
];

const activeRoots = [
  'apps/integrator/src',
  'apps/webapp/src',
  'apps/webapp/INTEGRATOR_CONTRACT.md',
  'docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md',
  'docs/ARCHITECTURE/PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md',
  'deploy/host',
  'deploy/postgres/integrator-server-runtime-config.sql',
];

const transitionAllowlist = new Set([
  'apps/integrator/src/infra/db/migrations/core/20260707_0001_p0_4_i0_integrator_org_columns_predeclare.sql',
  'apps/integrator/src/infra/db/migrations/core/20260708_0001_p0_4_i1_integrator_direct_user_org.sql',
  'apps/integrator/src/infra/db/migrations/core/20260710_0001_r2_integrator_scoped_org_not_null.sql',
  'apps/integrator/src/infra/db/migrations/core/20260808_0008_drop_legacy_contacts.sql',
  'deploy/postgres/integrator-login-public-identity-grants.sql',
]);

function filesUnder(path) {
  const absolute = resolve(repoRoot, path);
  if (!statSync(absolute).isDirectory()) return [path];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = `${path}/${entry.name}`;
    return entry.isDirectory() ? filesUnder(child) : [child];
  });
}

function hasForbidden(content) {
  return forbidden.some((pattern) => pattern.test(content));
}

export function auditEntries(entries) {
  const violations = [];
  for (const entry of entries) {
    if (!hasForbidden(entry.content)) continue;
    if (entry.kind === 'transition' && transitionAllowlist.has(entry.path)) continue;
    violations.push(entry.path);
  }
  return violations;
}

function repositoryEntries() {
  const active = activeRoots.flatMap(filesUnder)
    .filter((path) => !path.includes('/migrations/'))
    .filter((path) => !path.endsWith('.test.ts') && !path.endsWith('.test.mjs'))
    .map((path) => ({ path, kind: 'active', content: readFileSync(resolve(repoRoot, path), 'utf8') }));
  const transitionCandidates = [
    ...filesUnder('apps/integrator/src/infra/db/migrations'),
    ...filesUnder('deploy/postgres').filter(
      (path) => !path.includes('/generated/') && path.endsWith('.sql'),
    ),
  ].map((path) => ({ path, kind: 'transition', content: readFileSync(resolve(repoRoot, path), 'utf8') }));
  return [...active, ...transitionCandidates];
}

function selfTest() {
  assert.deepEqual(auditEntries([{ path: 'active.ts', kind: 'active', content: 'FROM contacts' }]), ['active.ts']);
  assert.deepEqual(
    auditEntries([{ path: 'unknown.sql', kind: 'transition', content: 'integrator.contacts' }]),
    ['unknown.sql'],
  );
  assert.deepEqual(
    auditEntries([{
      path: 'apps/integrator/src/infra/db/migrations/core/20260808_0008_drop_legacy_contacts.sql',
      kind: 'transition',
      content: 'DROP TABLE integrator.contacts',
    }]),
    [],
  );
  console.log('legacy access census self-test: PASS');
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  const entries = repositoryEntries();
  const violations = auditEntries(entries);
  for (const path of transitionAllowlist) {
    const entry = entries.find((candidate) => candidate.kind === 'transition' && candidate.path === path);
    if (!entry || !hasForbidden(entry.content)) violations.push(`stale-allowlist:${path}`);
  }
  if (violations.length > 0) {
    console.error(`legacy access census failed:\n${violations.map((path) => `- ${path}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`legacy access census: PASS (${activeRoots.length} active roots; ${transitionAllowlist.size} exact transition files)`);
}
