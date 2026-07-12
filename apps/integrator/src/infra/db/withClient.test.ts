import { runWithDbOrganizationPrincipal } from '@bersoncare/db-principal';
import { describe, expect, it, vi } from 'vitest';
import { createDbPort } from './client.js';
import { withIntegratorPoolClient, withIntegratorPoolTransaction } from './withClient.js';

describe('integrator DB client helpers', () => {
  it('keeps checked-out clients unchanged when no principal is set', async () => {
    const release = vi.fn();
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    await expect(withIntegratorPoolClient(pool as never, async () => 'ok')).resolves.toBe('ok');

    expect(query.mock.calls).toEqual([
      ['SELECT set_config(\'app.org\', $1, false)', ['']],
      ['SELECT set_config(\'app.patient_user_id\', $1, false)', ['']],
      ['SELECT set_config(\'app.integrator_user_id\', $1, false)', ['']],
    ]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('applies the current organization principal inside a transaction', async () => {
    const release = vi.fn();
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    await runWithDbOrganizationPrincipal('dddddddd-dddd-4ddd-8ddd-dddddddddddd', () =>
      withIntegratorPoolTransaction(pool as never, async () => 'tx-ok'),
    );

    expect(query.mock.calls).toEqual([
      ['SELECT set_config(\'app.org\', $1, false)', ['dddddddd-dddd-4ddd-8ddd-dddddddddddd']],
      ['SELECT set_config(\'app.patient_user_id\', $1, false)', ['']],
      ['SELECT set_config(\'app.integrator_user_id\', $1, false)', ['']],
      ['BEGIN'],
      ['SELECT set_config(\'app.org\', $1, true)', ['dddddddd-dddd-4ddd-8ddd-dddddddddddd']],
      ['COMMIT'],
      ['SELECT set_config(\'app.org\', $1, false)', ['']],
      ['SELECT set_config(\'app.patient_user_id\', $1, false)', ['']],
      ['SELECT set_config(\'app.integrator_user_id\', $1, false)', ['']],
    ]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('applies the current organization principal inside createDbPort tx', async () => {
    const release = vi.fn();
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client), on: vi.fn(), query: vi.fn(), end: vi.fn() };
    const dbPort = createDbPort(pool as never);

    await runWithDbOrganizationPrincipal('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', () =>
      dbPort.tx(async () => 'tx-ok'),
    );

    expect(query.mock.calls).toEqual([
      ['SELECT set_config(\'app.org\', $1, false)', ['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee']],
      ['SELECT set_config(\'app.patient_user_id\', $1, false)', ['']],
      ['SELECT set_config(\'app.integrator_user_id\', $1, false)', ['']],
      ['BEGIN'],
      ['SELECT set_config(\'app.org\', $1, true)', ['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee']],
      ['COMMIT'],
      ['SELECT set_config(\'app.org\', $1, false)', ['']],
      ['SELECT set_config(\'app.patient_user_id\', $1, false)', ['']],
      ['SELECT set_config(\'app.integrator_user_id\', $1, false)', ['']],
    ]);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
