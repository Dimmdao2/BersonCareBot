#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  sourceTextIncludes,
  sourceTextSliceBetween,
  sourceTextSliceFrom,
} from './source-text-guard.mjs';

const repoRoot = process.cwd();
const artifactPath = 'docs/_TODO/SAAS_FOUNDATION/T0_DB_ACCESS_SURFACE.md';

const routePattern = 'getPool\\(|getDrizzle\\(|runWebappPgText|pool\\.query|client\\.query|sql`';

function read(path) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

function runRg(args) {
  const result = spawnSync('rg', args, {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if (result.status === 1 && result.stdout === '') return [];
  if (result.status !== 0) {
    throw new Error(`rg ${args.join(' ')} failed: ${result.stderr || result.status}`);
  }

  return result.stdout.trim().split(/\r?\n/).filter(Boolean).sort();
}

function extractBulletList(text, startHeading, endHeading) {
  const body = endHeading
    ? sourceTextSliceBetween(text, startHeading, endHeading, artifactPath)
    : sourceTextSliceFrom(text, startHeading, artifactPath);
  if (body === null || !sourceTextIncludes(text, startHeading, artifactPath)) {
    throw new Error(`missing section: ${startHeading}`);
  }
  return Array.from(body.matchAll(/^- `([^`]+)`$/gm), (match) => match[1]).sort();
}

function assertListEqual(label, expected, actual) {
  const missing = expected.filter((item) => !actual.includes(item));
  const extra = actual.filter((item) => !expected.includes(item));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(`${label} drift: missing=[${missing.join(', ')}], extra=[${extra.join(', ')}]`);
  }
}

function assertContains(text, token) {
  if (!sourceTextIncludes(text, token, artifactPath)) {
    throw new Error(`artifact missing token: ${token}`);
  }
}

function runChecks(overrides = {}) {
  const artifact = overrides.artifact ?? read(artifactPath);

  for (const token of [
    'Status: T0.0 read-only snapshot, 2026-07-09.',
    'Current runtime carrier stores only `organizationId`',
    '`app.patient_user_id` appears in descriptor/smoke artifacts, not in the runtime carrier.',
    'It does not enforce:',
    'T0.1 adds the inventory guard above.',
  ]) {
    assertContains(artifact, token);
  }

  const artifactRoutes = extractBulletList(
    artifact,
    '## Webapp Route DB Signal Files',
    '## Webapp Server Action Entrypoints',
  );
  const currentRoutes = runRg(['-l', routePattern, 'apps/webapp/src/app', '-g', 'route.ts']);
  assertListEqual('webapp route DB surface', artifactRoutes, currentRoutes);

  const artifactActions = extractBulletList(
    artifact,
    '## Webapp Server Action Entrypoints',
    '## Current Principal Coverage',
  );
  const currentActions = runRg([
    '-l',
    '^"use server";|^\'use server\';',
    'apps/webapp/src/app',
    '-g',
    '*.ts',
  ]);
  assertListEqual('webapp action DB surface', artifactActions, currentActions);

  const artifactPrincipal = extractBulletList(
    artifact,
    'Files using `runWithDbOrganizationPrincipal` in runtime code:',
    'Known coverage:',
  );
  const currentPrincipal = runRg([
    '-l',
    'runWithDbOrganizationPrincipal',
    'apps/webapp/src/app',
    'apps/webapp/src/app-layer',
    'apps/webapp/src/modules',
    'apps/webapp/src/infra',
    'apps/integrator/src',
    'apps/media-worker/src',
    'packages',
    '-g',
    '*.ts',
    '-g',
    '!**/*.test.ts',
    '-g',
    '!**/*.spec.ts',
  ]);
  assertListEqual('runtime principal surface', artifactPrincipal, currentPrincipal);
}

if (process.argv.includes('--self-test')) {
  const artifact = read(artifactPath).replace(
    '- `apps/webapp/src/app/api/admin/audit-log/route.ts`',
    '',
  );
  try {
    runChecks({ artifact });
  } catch {
    console.log('check-t0-db-access-surface self-test: OK');
    process.exit(0);
  }
  throw new Error('self-test did not detect a missing route inventory row');
}

try {
  runChecks();
  console.log('check-t0-db-access-surface: OK');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-t0-db-access-surface: ${message}`);
  process.exit(1);
}
