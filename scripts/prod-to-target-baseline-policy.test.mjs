import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  ENVIRONMENT_OWNED_TARIFF_IDS,
  filterAndValidateTargetTariffCatalog,
  removeRetiredRuntimeSettings,
  REVIEWED_TARGET_TARIFF_IDS,
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
