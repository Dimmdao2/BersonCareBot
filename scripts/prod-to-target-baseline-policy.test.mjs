import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  ENVIRONMENT_OWNED_TARIFF_IDS,
  filterAndValidateTargetTariffCatalog,
  removeRetiredRuntimeSettings,
  REVIEWED_TARGET_TARIFF_IDS,
  sanitizeRuntimeSettingsForCutover,
} from './prod-to-target-baseline-policy.mjs';

const baselinePath = resolve(
  import.meta.dirname,
  '../deploy/postgres/generated/prod-to-target/ledgers-and-baseline.sql',
);

test('target baseline contains exactly four reviewed product tariffs', () => {
  const source = readFileSync(baselinePath, 'utf8');
  const rendered = filterAndValidateTargetTariffCatalog(source);
  assert.equal(rendered, source);
  for (const id of REVIEWED_TARGET_TARIFF_IDS) assert.match(source, new RegExp(id, 'u'));
  for (const id of ENVIRONMENT_OWNED_TARIFF_IDS) assert.doesNotMatch(source, new RegExp(id, 'u'));
});

test('retired linked-phone setting is removed from rows and function allowlists', () => {
  const source = "VALUES ('integrator_linked_phone_source', 'admin');\nWHERE key IN ('integrator_linked_phone_source', 'other');\n";
  assert.equal(removeRetiredRuntimeSettings(source), "WHERE key IN ('other');\n");
});

test('runtime settings do not carry DEV-only updated_by identities into cutover', () => {
  const source = "INSERT INTO public.app_runtime_settings (key, scope, organization_id, audience, value_json, updated_at, updated_by) VALUES ('auth_sms_enabled', 'admin', NULL, 'public', '{\"value\": true}', '2026-08-11 21:47:06+03', '00000000-0000-0000-0000-000000000003');\n";
  const rendered = sanitizeRuntimeSettingsForCutover(source);
  assert.equal(
    rendered,
    "INSERT INTO public.app_runtime_settings (key, scope, organization_id, audience, value_json, updated_at, updated_by) VALUES ('auth_sms_enabled', 'admin', NULL, 'public', '{\"value\": true}', '2026-08-11 21:47:06+03', NULL);\n",
  );
});

test('active environment fixture is excluded by registry id, not by name', () => {
  const source = readFileSync(baselinePath, 'utf8');
  const reviewedId = [...REVIEWED_TARGET_TARIFF_IDS][0];
  assert.ok(reviewedId);
  const fixtureId = [...ENVIRONMENT_OWNED_TARIFF_IDS][0];
  assert.ok(fixtureId);
  const withRenamedFixture = source.replaceAll(reviewedId, fixtureId);
  assert.throws(
    () => filterAndValidateTargetTariffCatalog(withRenamedFixture),
    /reviewed tariff is missing/u,
  );
});

test('an active tariff with missing billing fields fails closed', () => {
  const source = readFileSync(baselinePath, 'utf8');
  const incomplete = source.replace(
    /, 80000, 'RUB',/u,
    ", NULL, 'RUB',",
  );
  assert.throws(
    () => filterAndValidateTargetTariffCatalog(incomplete),
    /active without complete product\/billing\/access fields/u,
  );
});

test('a complete-looking price drift still requires review', () => {
  const source = readFileSync(baselinePath, 'utf8');
  const drifted = source.replace(/, 80000, 'RUB',/u, ", 80001, 'RUB',");
  assert.throws(
    () => filterAndValidateTargetTariffCatalog(drifted),
    /differs from its reviewed price\/mechanics contract/u,
  );
});
