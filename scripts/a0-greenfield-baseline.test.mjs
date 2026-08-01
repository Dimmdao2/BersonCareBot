import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertCleanRefreshSource,
  assertTrustedRootOwnedBinary,
  manifestPath,
  normalizeA0Dump,
  resolveTrustedPostgresBinaries,
  scanSchemaArtifact,
  scanSeedArtifact,
  schemaPath,
  seedPath,
  validatePackage,
} from './a0-greenfield-baseline-lib.mjs';

const schema = fs.readFileSync(schemaPath, 'utf8');
const seed = fs.readFileSync(seedPath, 'utf8');

test('committed A0 package is internally consistent', () => {
  const result = validatePackage();
  assert.equal(result.schemaScan.failures.length, 0);
  assert.ok(Array.isArray(result.pending.integrator));
  assert.ok(Array.isArray(result.pending.drizzle));
});

test('schema scanner rejects data, ACL, environment-role and PII leakage', () => {
  const mutations = [
    ['\n-- Data for Name: patients; Type: TABLE DATA\n', 'data_section_forbidden'],
    ['\nALTER TABLE public.platform_users OWNER TO postgres;\n', 'owner_or_acl_forbidden'],
    ['\n-- bcb_webapp_dev_user\n', 'runtime_identifier_forbidden'],
    ['\n-- bersoncarebot_test\n', 'environment_identifier_forbidden'],
    ['\n-- person@example.test\n', 'email_literal_forbidden'],
    ["\n-- '+79990001122'\n", 'phone_literal_forbidden'],
    ['\n-- postgresql://user:password@example.test/database\n', 'credential_shape_forbidden'],
  ];
  for (const [suffix, expected] of mutations) {
    assert.ok(scanSchemaArtifact(schema + suffix).failures.includes(expected), expected);
  }
});

test('schema scanner accepts only the exact known placeholder-booking phone literal', () => {
  assert.ok(!scanSchemaArtifact(schema).failures.includes('phone_literal_forbidden'));
  assert.ok(
    !scanSchemaArtifact(`${schema}\n-- '+70000000000'\n`).failures.includes(
      'phone_literal_forbidden',
    ),
  );
  const decoys = ["'+79990001122'", "'+70000000001'", "'+7000000000'", "'+700000000000'"];
  for (const decoy of decoys) {
    assert.ok(
      scanSchemaArtifact(`${schema}\n-- ${decoy}\n`).failures.includes('phone_literal_forbidden'),
      decoy,
    );
  }
});

test('schema scanner recognizes exactly the four deploy-script roles it was taught, nothing else', () => {
  const knownRoles = [
    'app_platform_settings',
    'app_operational_web_push_reminder',
    'app_web_push_reminder_discovery_definer',
    'app_clinic_billing',
  ];
  for (const role of knownRoles) {
    const addition = `\nCREATE POLICY a0_probe_policy ON public.a0_probe_table TO ${role};\n`;
    assert.ok(!scanSchemaArtifact(schema + addition).failures.includes(`unexpected_policy_role:${role}`));
  }
  const unknownAddition =
    '\nCREATE POLICY a0_probe_policy ON public.a0_probe_table TO app_totally_unknown_role;\n';
  assert.ok(
    scanSchemaArtifact(schema + unknownAddition).failures.includes(
      'unexpected_policy_role:app_totally_unknown_role',
    ),
  );
});

test('seed scanner accepts only reserved .test identity and approved tables', () => {
  assert.deepEqual(scanSeedArtifact(seed).failures, []);
  assert.ok(
    scanSeedArtifact(`${seed}\nINSERT INTO public.patient_files DEFAULT VALUES;`).failures.includes(
      'seed_table_forbidden:patient_files',
    ),
  );
  assert.ok(
    scanSeedArtifact(seed.replaceAll('owner@baseline.test', 'owner@example.com')).failures.includes(
      'seed_non_test_email_forbidden',
    ),
  );
});

test('package checker rejects schema and historical ledger hash drift', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'bcb_a0_static_test_'));
  try {
    const schemaCopy = path.join(temporary, 'schema.sql');
    const seedCopy = path.join(temporary, 'seed.sql');
    const manifestCopy = path.join(temporary, 'manifest.json');
    fs.writeFileSync(schemaCopy, `${schema}\n-- drift\n`);
    fs.copyFileSync(seedPath, seedCopy);
    fs.copyFileSync(manifestPath, manifestCopy);
    assert.throws(
      () =>
        validatePackage({ schemaFile: schemaCopy, seedFile: seedCopy, manifestFile: manifestCopy }),
      /schema_hash_drift/u,
    );

    fs.copyFileSync(schemaPath, schemaCopy);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.ledgers.integrator.entries[0].sha256 = '0'.repeat(64);
    fs.writeFileSync(manifestCopy, `${JSON.stringify(manifest)}\n`);
    assert.throws(
      () =>
        validatePackage({ schemaFile: schemaCopy, seedFile: seedCopy, manifestFile: manifestCopy }),
      /integrator_source_commit_historical_hash_drift/u,
    );

    const metadataDrift = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    metadataDrift.ledgers.drizzle.entries[0].when += 1;
    fs.writeFileSync(manifestCopy, `${JSON.stringify(metadataDrift)}\n`);
    assert.throws(
      () =>
        validatePackage({ schemaFile: schemaCopy, seedFile: seedCopy, manifestFile: manifestCopy }),
      /drizzle_source_commit_manifest_metadata_drift/u,
    );

    const missingCommit = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    missingCommit.baseline.sourceCommit = '0'.repeat(40);
    fs.writeFileSync(manifestCopy, `${JSON.stringify(missingCommit)}\n`);
    assert.throws(
      () =>
        validatePackage({ schemaFile: schemaCopy, seedFile: seedCopy, manifestFile: manifestCopy }),
      /git_failed:merge-base/u,
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('dump normalization changes only the six known reference-catalog policy positions', () => {
  const sourceRole = 'bcb_webapp_dev_user';
  const raw = schema.replaceAll('bcb_a0_owner', sourceRole);
  const result = normalizeA0Dump(raw, sourceRole);
  assert.equal(result.normalizedRoleOccurrences, 6);
  assert.equal(result.normalized, schema);
  assert.throws(
    () => normalizeA0Dump(`${raw}\n-- ${sourceRole}\n`, sourceRole),
    /source_role_outside_known_policies/u,
  );
  assert.throws(
    () => normalizeA0Dump(raw.replace(` TO ${sourceRole} `, ' TO unexpected_role '), sourceRole),
    /reference_catalog_policy_role_shape_changed/u,
  );
});

test('refresh rejects dirty migration/generator state and trusts only root-owned PostgreSQL binaries', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'bcb_a0_git_test_'));
  try {
    execFileSync('/usr/bin/git', ['init', '-q'], { cwd: temporary });
    assert.doesNotThrow(() => assertCleanRefreshSource(temporary));
    const dirtyFile = path.join(
      temporary,
      'apps',
      'webapp',
      'db',
      'drizzle-migrations',
      'dirty.sql',
    );
    fs.mkdirSync(path.dirname(dirtyFile), { recursive: true });
    fs.writeFileSync(dirtyFile, '-- untracked migration\n');
    assert.throws(() => assertCleanRefreshSource(temporary), /refresh_source_worktree_dirty/u);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }

  const binaries = resolveTrustedPostgresBinaries(['psql', 'pg_dump', 'pg_ctl', 'initdb']);
  for (const binary of Object.values(binaries)) {
    assert.equal(assertTrustedRootOwnedBinary(binary), binary);
  }
  assert.throws(
    () => assertTrustedRootOwnedBinary('/tmp/untrusted-postgres-binary'),
    /postgres_binary_outside_trusted_root/u,
  );
});
