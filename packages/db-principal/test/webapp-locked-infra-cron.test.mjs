import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertDbPrincipalRequestPoolCheckoutAllowedForPrincipal,
  applyDbPrincipalToConnection,
  createDbInfraPrincipal,
  isWebappLockedInfraCronSource,
  isWebappLockedMediaCronSource,
} from '../dist/index.js';

test('recognizes signed scheduler digest wake source', () => {
  assert.equal(
    isWebappLockedInfraCronSource('api/integrator/operator-health/digest-wake:POST'),
    true,
  );
});

test('classifies only media processing cron sources as media runtime-setting readers', () => {
  assert.equal(
    isWebappLockedMediaCronSource('api/internal/media-transcode/reconcile:POST'),
    true,
  );
  assert.equal(
    isWebappLockedMediaCronSource('api/internal/product-analytics/retention:POST'),
    false,
  );
  assert.equal(
    isWebappLockedMediaCronSource('api/internal/operator-health-critical/tick:POST'),
    false,
  );
});

test('allows allowlisted infra principal on webapp request pool in locked mode', () => {
  const principal = createDbInfraPrincipal({
    source: 'api/integrator/operator-health/digest-wake:POST',
  });
  assertDbPrincipalRequestPoolCheckoutAllowedForPrincipal(principal, { mode: 'locked' });
});

test('still rejects unknown infra principal on webapp request pool in locked mode', () => {
  const principal = createDbInfraPrincipal({ source: 'worker:outgoing-delivery-tick' });
  assert.throws(
    () =>
      assertDbPrincipalRequestPoolCheckoutAllowedForPrincipal(principal, {
        mode: 'locked',
      }),
    /not allowed to use the webapp request DB pool in locked mode/,
  );
});

test('installs app_staff for allowlisted infra cron in locked mode', async () => {
  const queries = [];
  const client = {
    query: async (sql) => {
      queries.push(sql);
      return { rows: [] };
    },
  };
  const principal = createDbInfraPrincipal({
    source: 'api/integrator/operator-health/digest-wake:POST',
  });
  const applied = await applyDbPrincipalToConnection(client, principal, {
    mode: 'locked',
    signer: { secret: ['vitest', 'db', 'principal', 'signer', 'fixture'].join('-') },
  });
  assert.equal(applied, true);
  assert.ok(queries.some((sql) => sql === 'RESET ROLE'));
  assert.ok(queries.some((sql) => sql === 'SET ROLE app_staff'));
});
