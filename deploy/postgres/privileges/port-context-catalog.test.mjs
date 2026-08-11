import assert from 'node:assert/strict';
import test from 'node:test';

import { declaration } from './declaration.ts';
import {
  generatePortContextCapabilitySeedSql,
  renderPortContextRuntimeEnv,
  resolvePortContextCapabilities,
} from './generate.mjs';

const EXPECTED = {
  webapp: 12,
  integrator: 12,
};

test('one declaration renders the exact DB catalog and both runtime JSON catalogs', () => {
  const rows = resolvePortContextCapabilities(declaration, 'bersoncarebot_test');
  assert.equal(rows.length, 24);
  assert.equal(new Set(rows.map((row) => row.capabilityId)).size, 24);
  assert.equal(new Set(rows.map((row) => [
    row.sessionLogin,
    row.targetRole,
    row.contextClass,
    row.purpose,
    row.functionIdentity ?? row.runtimeName,
  ].join('\0'))).size, 24);

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
      assert.deepEqual(descriptors[row.runtimeName], {
        capabilityId: row.capabilityId,
        targetRole: row.targetRole,
        contextClass: row.contextClass,
        purpose: row.purpose,
        ...(row.functionIdentity ? { functionIdentity: row.functionIdentity } : {}),
        ...(row.runtimeSources?.length ? { runtimeSources: row.runtimeSources } : {}),
      });
    }
  }

  const integrator = JSON.parse(renderPortContextRuntimeEnv(
    declaration, 'test', 'bersoncarebot_test', 'integrator',
  ).value);
  const webapp = JSON.parse(renderPortContextRuntimeEnv(
    declaration, 'test', 'bersoncarebot_test', 'webapp',
  ).value);
  for (const name of ['delivery', 'scheduler', 'service']) {
    assert.equal(integrator[name].purpose, 'relation');
    assert.ok(integrator[name].runtimeSources.length > 0);
  }
  assert.equal(webapp.service.purpose, 'relation');
  assert.ok(webapp.service.runtimeSources.length > 0);

  const seed = generatePortContextCapabilitySeedSql(declaration, 'bersoncarebot_test');
  const roots = rows.filter((row) => row.functionIdentity);
  assert.equal(roots.length, 10);
  for (const row of roots) {
    assert.match(seed, new RegExp(row.capabilityId));
    assert.match(seed, new RegExp(row.functionIdentity.replace(/[()]/g, '\\$&')));
  }
  for (const row of rows.filter((candidate) => !candidate.functionIdentity)) {
    assert.doesNotMatch(seed, new RegExp(row.capabilityId));
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
