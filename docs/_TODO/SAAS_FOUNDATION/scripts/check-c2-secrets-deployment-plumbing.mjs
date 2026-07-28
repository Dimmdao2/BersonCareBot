#!/usr/bin/env node
import { sourceTextIncludes, sourceTextIndexOf } from './source-text-guard.mjs';

import { readFileSync } from 'node:fs';

const files = {
  preflight: 'deploy/host/saas-c2-secret-preflight.mjs',
  doc: 'docs/_TODO/SAAS_FOUNDATION/SAAS_C2_SECRETS_DEPLOYMENT_PLUMBING.md',
  roadmap: 'docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md',
  packageJson: 'package.json',
};

function fail(message) {
  throw new Error(message);
}

function read(path) {
  return readFileSync(path, 'utf8');
}

function requireFragments(label, text, fragments) {
  for (const fragment of fragments) {
    if (!sourceTextIncludes(text, fragment, label)) {
      fail(`${label} missing required fragment: ${fragment}`);
    }
  }
}

function forbidFragments(label, text, fragments) {
  for (const fragment of fragments) {
    if (sourceTextIncludes(text, fragment, label)) {
      fail(`${label} must not contain forbidden fragment: ${fragment}`);
    }
  }
}

function requireOccurrenceCountAtLeast(label, text, fragment, minCount) {
  const count = text.split(fragment).length - 1;
  if (count < minCount) {
    fail(`${label} must contain ${fragment} at least ${minCount} times, found ${count}`);
  }
}

function runChecks(overrides = {}) {
  const loaded = Object.fromEntries(
    Object.entries(files).map(([key, path]) => [key, overrides[key] ?? read(path)]),
  );

  requireFragments(files.roadmap, loaded.roadmap, [
    '### Phase C2',
    'Generate one high-entropy signing key per environment outside the repo',
    'presence/equality-by-fingerprint',
    'redaction tests',
    'Provision the two login credentials/URLs without embedding passwords',
  ]);

  requireFragments(files.preflight, loaded.preflight, [
    'DB_PRINCIPAL_SIGNING_SECRET',
    'DATABASE_URL_STAFF',
    'DATABASE_URL_NONSTAFF',
    'SAAS_ISOLATION_OPERATOR_DATABASE_URL',
    'fingerprintSecret',
    'assertNoSecretLeak',
    'DB_PRINCIPAL_CONTEXT_MODE must be shadow or locked',
    'must be at least ${MIN_SECRET_BYTES} bytes',
    'fingerprint mismatch across signing processes',
    'must not be identical for C2 dual-login preflight',
    'must use a separate operator login',
    'allRuntimeUsernames',
    'all webapp, integrator, operator, and media runtime URLs must use distinct PostgreSQL login roles',
    'self-test did not detect all secret/login collision regressions',
    'restart_order=webapp integrator worker scheduler media-worker',
    'rollback_order=restore previous root-managed env files',
  ]);
  requireOccurrenceCountAtLeast(
    files.preflight,
    loaded.preflight,
    'assertNoSecretLeak(output, ',
    2,
  );
  forbidFragments(files.preflight, loaded.preflight, [
    '/opt/env/bersoncarebot',
    'ssh ',
    'systemctl restart',
    'pg_dump',
  ]);

  requireFragments(files.doc, loaded.doc, [
    '# C2 secrets and deployment plumbing',
    'generate one high-entropy `DB_PRINCIPAL_SIGNING_SECRET` per environment outside the',
    'The value must never be\nprinted',
    'The same active signing key must be present in every process',
    '`DATABASE_URL_STAFF`',
    '`DATABASE_URL_NONSTAFF`',
    '`SAAS_ISOLATION_OPERATOR_DATABASE_URL`',
    'Global Admin diagnostics reads and E2 coverage only',
    'compares signing secrets by SHA-256 fingerprint prefix only',
    'compares PostgreSQL usernames across every webapp, integrator, operator, scheduler, delivery, diagnostic, and media URL',
    'Rollback is file-version based',
    'does not read `/opt/env/*`',
  ]);

  const packageJson = JSON.parse(loaded.packageJson);
  const scripts = packageJson.scripts ?? {};
  if (
    scripts['check:saas-c2-secrets-deployment-plumbing'] !==
    'node --check docs/_TODO/SAAS_FOUNDATION/scripts/check-c2-secrets-deployment-plumbing.mjs && node --check deploy/host/saas-c2-secret-preflight.mjs && node docs/_TODO/SAAS_FOUNDATION/scripts/check-c2-secrets-deployment-plumbing.mjs && node deploy/host/saas-c2-secret-preflight.mjs --self-test && node docs/_TODO/SAAS_FOUNDATION/scripts/check-c2-secrets-deployment-plumbing.mjs --self-test'
  ) {
    fail('package.json has an unexpected check:saas-c2-secrets-deployment-plumbing script');
  }
}

if (process.argv.includes('--self-test')) {
  const preflight = read(files.preflight).replace(
    /assertNoSecretLeak\(output, [^)]+\);/g,
    '// removed by self-test',
  );
  try {
    runChecks({ preflight });
  } catch {
    console.log('check-c2-secrets-deployment-plumbing self-test: OK');
    process.exit(0);
  }
  fail('self-test did not detect removed redaction guard');
}

try {
  runChecks();
  console.log('check-c2-secrets-deployment-plumbing: OK');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-c2-secrets-deployment-plumbing: ${message}`);
  process.exit(1);
}
