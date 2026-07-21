import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  manifestPath,
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
    ['\n-- person@example.test\n', 'email_literal_forbidden'],
    ["\n-- '+79990001122'\n", 'phone_literal_forbidden'],
    ['\n-- postgresql://user:password@example.test/database\n', 'credential_shape_forbidden'],
  ];
  for (const [suffix, expected] of mutations) {
    assert.ok(scanSchemaArtifact(schema + suffix).failures.includes(expected), expected);
  }
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
      /integrator_historical_hash_drift/u,
    );

    const metadataDrift = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    metadataDrift.ledgers.drizzle.entries[0].when += 1;
    fs.writeFileSync(manifestCopy, `${JSON.stringify(metadataDrift)}\n`);
    assert.throws(
      () =>
        validatePackage({ schemaFile: schemaCopy, seedFile: seedCopy, manifestFile: manifestCopy }),
      /drizzle_manifest_metadata_drift/u,
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
