import assert from 'node:assert/strict';
import test from 'node:test';

import { declaration } from './declaration.ts';
import {
  generatePortContextCapabilitySeedSql,
  renderPortContextRuntimeEnv,
  resolvePortContextCapabilities,
} from './generate.mjs';

const EXPECTED = {
  webapp: 4,
  integrator: 6,
};

test('one declaration renders the exact DB catalog and both runtime JSON catalogs', () => {
  const rows = resolvePortContextCapabilities(declaration, 'bersoncarebot_test');
  assert.equal(rows.length, 10);
  assert.equal(new Set(rows.map((row) => row.capabilityId)).size, 10);
  assert.equal(new Set(rows.map((row) => [
    row.sessionLogin,
    row.targetRole,
    row.contextClass,
    row.purpose,
    row.functionIdentity,
  ].join('\0'))).size, 10);

  for (const [port, count] of Object.entries(EXPECTED)) {
    const rendered = renderPortContextRuntimeEnv(
      declaration,
      'test',
      'bersoncarebot_test',
      port,
    );
    const descriptors = JSON.parse(rendered.value);
    assert.equal(Object.keys(descriptors).length, count);
    for (const row of rows.filter((candidate) => candidate.port === port)) {
      assert.deepEqual(descriptors[row.name], {
        capabilityId: row.capabilityId,
        targetRole: row.targetRole,
        contextClass: row.contextClass,
        purpose: row.purpose,
        functionIdentity: row.functionIdentity,
      });
    }
  }

  const seed = generatePortContextCapabilitySeedSql(declaration, 'bersoncarebot_test');
  for (const row of rows) {
    assert.match(seed, new RegExp(row.capabilityId));
    assert.match(seed, new RegExp(row.functionIdentity.replace(/[()]/g, '\\$&')));
  }
  assert.match(seed, /DELETE FROM app_ext\.port_context_capabilities existing/);
});

test('capability IDs are stable per database and do not cross environments', () => {
  const testRows = resolvePortContextCapabilities(declaration, 'bersoncarebot_test');
  const devRows = resolvePortContextCapabilities(declaration, 'bcb_webapp_dev');
  assert.deepEqual(
    resolvePortContextCapabilities(declaration, 'bersoncarebot_test'),
    testRows,
  );
  assert.equal(
    testRows.some((row) => devRows.some((candidate) => candidate.capabilityId === row.capabilityId)),
    false,
  );
});
