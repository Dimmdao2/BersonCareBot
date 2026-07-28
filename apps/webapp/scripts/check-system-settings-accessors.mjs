#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

const scanRoots = ['apps/webapp/src', 'apps/integrator/src', 'apps/media-worker/src'];

const allowedFiles = new Set([
  'apps/webapp/src/infra/repos/pgSystemSettings.ts',
  'apps/webapp/src/infra/repos/pgAppRuntimeSettings.ts',
  'apps/integrator/src/infra/db/publicSystemSettings.ts',
]);

function listTsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      out.push(...listTsFiles(path));
      continue;
    }
    if (
      name.endsWith('.ts') &&
      !name.endsWith('.test.ts') &&
      !name.endsWith('.spec.ts') &&
      !name.endsWith('.d.ts')
    ) {
      out.push(path);
    }
  }
  return out;
}

function hasDirectSettingsRead(src) {
  return (
    /SELECT[\s\S]{0,300}\bFROM\s+(?:public\.)?system_settings\b/i.test(src) ||
    /SELECT[\s\S]{0,300}\bFROM\s+(?:public\.)?app_runtime_settings\b/i.test(src) ||
    /\.from\(\s*(?:systemSettings|appRuntimeSettings)\s*\)/.test(src)
  );
}

const offenders = [];

for (const root of scanRoots) {
  for (const abs of listTsFiles(join(repoRoot, root))) {
    const rel = relative(repoRoot, abs).replace(/\\/g, '/');
    if (allowedFiles.has(rel)) continue;
    const src = readFileSync(abs, 'utf8');
    if (hasDirectSettingsRead(src)) offenders.push(rel);
  }
}

if (process.env.CHECK_SYSTEM_SETTINGS_ACCESSORS_SELF_TEST === '1') {
  if (
    !hasDirectSettingsRead('SELECT * FROM public.system_settings') ||
    !hasDirectSettingsRead('SELECT * FROM public.app_runtime_settings') ||
    hasDirectSettingsRead('SELECT * FROM app.read_public_runtime_setting($1, $2)')
  ) {
    console.error('check-system-settings-accessors: self-test failed');
    process.exit(1);
  }
  console.log('check-system-settings-accessors: self-test OK');
}

if (offenders.length > 0) {
  console.error(
    'check-system-settings-accessors: direct restricted/runtime settings reads outside canonical accessors:',
  );
  for (const rel of offenders) console.error(`  - ${rel}`);
  process.exit(1);
}

console.log('check-system-settings-accessors: OK');
