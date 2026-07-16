import {
  runWithDbBootstrapPrincipal,
  runWithDbInfraPrincipal,
  runWithDbOrganizationPrincipal,
} from '@bersoncare/db-principal';
import { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbPort } from './client.js';
import { createIntegratorPoolProvider } from './integratorPoolProvider.js';
import {
  assertIntegratorLockedPrincipalClassified,
  withIntegratorPoolClient,
  withIntegratorPoolTransaction,
} from './withClient.js';

function restoreEnvValue(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

describe('integrator DB client helpers', () => {
  const originalDbPrincipalContextMode = process.env.DB_PRINCIPAL_CONTEXT_MODE;
  const originalDbPrincipalSigningSecret = process.env.DB_PRINCIPAL_SIGNING_SECRET;

  beforeEach(() => {
    restoreEnvValue('DB_PRINCIPAL_CONTEXT_MODE', originalDbPrincipalContextMode);
    restoreEnvValue('DB_PRINCIPAL_SIGNING_SECRET', originalDbPrincipalSigningSecret);
  });

  afterEach(() => {
    restoreEnvValue('DB_PRINCIPAL_CONTEXT_MODE', originalDbPrincipalContextMode);
    restoreEnvValue('DB_PRINCIPAL_SIGNING_SECRET', originalDbPrincipalSigningSecret);
    vi.restoreAllMocks();
  });

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

  it('uses locked DB principal options when opt-in env is set', async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = 'locked';
    process.env.DB_PRINCIPAL_SIGNING_SECRET = 'test-db-principal-signing-secret';
    const release = vi.fn();
    const query = vi.fn(async (sql: string, _values?: readonly unknown[]) =>
      sql === 'SELECT pg_backend_pid() AS backend_pid'
        ? { rows: [{ backend_pid: 6262 }], rowCount: 1 }
        : { rows: [], rowCount: 0 },
    );
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    await runWithDbOrganizationPrincipal('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', () =>
      withIntegratorPoolClient(pool as never, async () => 'ok'),
    );

    expect(query.mock.calls[0]).toEqual(['RESET ROLE']);
    expect(query.mock.calls[1]).toEqual(['SET ROLE app_staff']);
    expect(query.mock.calls[2]).toEqual(['SELECT pg_backend_pid() AS backend_pid']);
    expect(String(query.mock.calls[3]?.[0])).toContain('app.install_signed_context');
    expect(query.mock.calls[3]?.[1]).toEqual(
      expect.arrayContaining([6262, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']),
    );
    expect(query.mock.calls.at(-2)).toEqual(['SELECT app.release_principal_context()']);
    expect(query.mock.calls.at(-1)).toEqual(['RESET ROLE']);
    expect(release).toHaveBeenCalledTimes(1);
  });

	it('fails closed in locked mode before checkout when no DB principal is active', async () => {
		process.env.DB_PRINCIPAL_CONTEXT_MODE = 'locked';
		process.env.DB_PRINCIPAL_SIGNING_SECRET = 'test-db-principal-signing-secret';
		const release = vi.fn();
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const client = { query, release };
		const pool = { connect: vi.fn(async () => client) };

		await expect(withIntegratorPoolClient(pool as never, async () => 'unused')).rejects.toThrow(
			'DB principal context is required before integrator scoped DB access in locked mode',
		);

		expect(pool.connect).not.toHaveBeenCalled();
		expect(query).not.toHaveBeenCalled();
		expect(release).not.toHaveBeenCalled();
	});

  it('fails closed in locked mode before checkout for unknown bootstrap principals', async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = 'locked';
    process.env.DB_PRINCIPAL_SIGNING_SECRET = 'test-db-principal-signing-secret';
    const pool = { connect: vi.fn() };

    await expect(
      runWithDbBootstrapPrincipal({ source: 'unit-test-unknown-bootstrap' }, () =>
        withIntegratorPoolClient(pool as never, async () => 'unused'),
      ),
    ).rejects.toThrow(
      'DB bootstrap principal source is not allowed on integrator request pool in locked mode: unit-test-unknown-bootstrap',
    );

    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('fails closed in locked mode before checkout for unknown infra principals', async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = 'locked';
    process.env.DB_PRINCIPAL_SIGNING_SECRET = 'test-db-principal-signing-secret';
    const pool = { connect: vi.fn() };

    await expect(
      runWithDbInfraPrincipal({ source: 'unit-test-unknown-infra' }, () =>
        withIntegratorPoolClient(pool as never, async () => 'unused'),
      ),
    ).rejects.toThrow(
      'DB infra principal source is not allowed on integrator request pool in locked mode: unit-test-unknown-infra',
    );

    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('allows explicitly listed bootstrap principals in locked mode', async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = 'locked';
    process.env.DB_PRINCIPAL_SIGNING_SECRET = 'test-db-principal-signing-secret';
    const release = vi.fn();
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    await expect(
      runWithDbBootstrapPrincipal({ source: 'telegram-webhook:pre-routing' }, () =>
        withIntegratorPoolClient(pool as never, async () => 'bootstrap-ok'),
      ),
    ).resolves.toBe('bootstrap-ok');

    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]).toEqual(['SELECT app.release_principal_context()']);
    expect(query.mock.calls[1]).toEqual(['RESET ROLE']);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('allowlists only the named central pre-routing and projection-health scopes', () => {
    const locked = {
      mode: 'locked' as const,
      signer: { secret: 'test-db-principal-signing-secret' },
    };
    for (const source of ['integrator-user-org-resolution', 'integrator-deployment-org-resolution']) {
      expect(() => runWithDbBootstrapPrincipal({ source }, () =>
        assertIntegratorLockedPrincipalClassified(locked),
      )).not.toThrow();
    }
    expect(() => runWithDbInfraPrincipal({ source: 'integrator-projection-health' }, () =>
      assertIntegratorLockedPrincipalClassified(locked),
    )).not.toThrow();
    expect(() => runWithDbBootstrapPrincipal({ source: 'integrator-generic-http-request' }, () =>
      assertIntegratorLockedPrincipalClassified(locked),
    )).toThrow('DB bootstrap principal source is not allowed');
  });

  it('rejects invalid locked DB principal env before checking out a client', async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = 'locked';
    delete process.env.DB_PRINCIPAL_SIGNING_SECRET;
    const pool = { connect: vi.fn() };

    await expect(withIntegratorPoolClient(pool as never, async () => 'unused')).rejects.toThrow(
      'DB_PRINCIPAL_SIGNING_SECRET is required',
    );

    expect(pool.connect).not.toHaveBeenCalled();
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

  it('uses prepared locked options for createDbPort tx transaction setup and release', async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = 'locked';
    process.env.DB_PRINCIPAL_SIGNING_SECRET = 'test-db-principal-signing-secret';
    const release = vi.fn();
    const query = vi.fn(async (sql: string, _values?: readonly unknown[]) =>
      sql === 'SELECT pg_backend_pid() AS backend_pid'
        ? { rows: [{ backend_pid: 7373 }], rowCount: 1 }
        : { rows: [], rowCount: 0 },
    );
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client), on: vi.fn(), query: vi.fn(), end: vi.fn() };
    const dbPort = createDbPort(pool as never);

    await runWithDbOrganizationPrincipal('cccccccc-cccc-4ccc-8ccc-cccccccccccc', () =>
      dbPort.tx(async () => 'tx-ok'),
    );

    expect(query.mock.calls[0]).toEqual(['RESET ROLE']);
    expect(query.mock.calls[1]).toEqual(['SET ROLE app_staff']);
    expect(query.mock.calls[2]).toEqual(['SELECT pg_backend_pid() AS backend_pid']);
    expect(String(query.mock.calls[3]?.[0])).toContain('app.install_signed_context');
    expect(query.mock.calls[4]).toEqual(['BEGIN']);
    expect(query.mock.calls[5]).toEqual(['RESET ROLE']);
    expect(query.mock.calls[6]).toEqual(['SET ROLE app_staff']);
    expect(String(query.mock.calls[8]?.[0])).toContain('app.install_signed_context');
    expect(query.mock.calls.at(-2)).toEqual(['SELECT app.release_principal_context()']);
    expect(query.mock.calls.at(-1)).toEqual(['RESET ROLE']);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('destroys checked-out clients when locked cleanup fails', async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = 'locked';
    process.env.DB_PRINCIPAL_SIGNING_SECRET = 'test-db-principal-signing-secret';
    const release = vi.fn();
    const query = vi.fn(async (sql: string, _values?: readonly unknown[]) => {
      if (sql === 'SELECT pg_backend_pid() AS backend_pid') {
        return { rows: [{ backend_pid: 8383 }], rowCount: 1 };
      }
      if (sql === 'SELECT app.release_principal_context()') {
        throw new Error('cleanup boom');
      }
      return { rows: [], rowCount: 0 };
    });
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    await expect(
      runWithDbOrganizationPrincipal('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', () =>
        withIntegratorPoolClient(pool as never, async () => 'ok'),
      ),
    ).rejects.toThrow('cleanup boom');

    expect(query.mock.calls.at(-1)).toEqual(['RESET ROLE']);
    expect(release).toHaveBeenCalledTimes(1);
    expect(release.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect((release.mock.calls[0]?.[0] as Error).message).toBe('cleanup boom');
  });

  it('destroys transaction clients when locked cleanup fails after commit', async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = 'locked';
    process.env.DB_PRINCIPAL_SIGNING_SECRET = 'test-db-principal-signing-secret';
    const release = vi.fn();
    const query = vi.fn(async (sql: string, _values?: readonly unknown[]) => {
      if (sql === 'SELECT pg_backend_pid() AS backend_pid') {
        return { rows: [{ backend_pid: 8484 }], rowCount: 1 };
      }
      if (sql === 'SELECT app.release_principal_context()') {
        throw new Error('tx cleanup boom');
      }
      return { rows: [], rowCount: 0 };
    });
    const client = { query, release };
    const pool = { connect: vi.fn(async () => client) };

    await expect(
      runWithDbOrganizationPrincipal('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', () =>
        withIntegratorPoolTransaction(pool as never, async () => 'tx-ok'),
      ),
    ).rejects.toThrow('tx cleanup boom');

    expect(query).toHaveBeenCalledWith('COMMIT');
    expect(query.mock.calls.at(-1)).toEqual(['RESET ROLE']);
    expect(release).toHaveBeenCalledTimes(1);
    expect(release.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect((release.mock.calls[0]?.[0] as Error).message).toBe('tx cleanup boom');
  });

  it('wraps promise-form pool.query with locked DB principal options', async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = 'locked';
    process.env.DB_PRINCIPAL_SIGNING_SECRET = 'test-db-principal-signing-secret';
    const release = vi.fn();
    const query = vi.fn(async (sql: string, _values?: readonly unknown[]) =>
      sql === 'SELECT pg_backend_pid() AS backend_pid'
        ? { rows: [{ backend_pid: 7272 }], rowCount: 1 }
        : { rows: [{ ok: true }], rowCount: 1 },
    );
    const client = { query, release };
    vi.spyOn(Pool.prototype, 'connect').mockResolvedValue(client as never);
    vi.spyOn(Pool.prototype, 'end').mockResolvedValue(undefined);
    const pool = createIntegratorPoolProvider({ connectionString: 'postgres://example/test' });

    await runWithDbOrganizationPrincipal('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', () =>
      pool.query('SELECT ok'),
    );
    await pool.end();

    expect(query.mock.calls[0]).toEqual(['RESET ROLE']);
    expect(query.mock.calls[1]).toEqual(['SET ROLE app_staff']);
    expect(query.mock.calls[2]).toEqual(['SELECT pg_backend_pid() AS backend_pid']);
    expect(String(query.mock.calls[3]?.[0])).toContain('app.install_signed_context');
    expect(query.mock.calls[4]).toEqual(['SELECT ok']);
    expect(query.mock.calls.at(-2)).toEqual(['SELECT app.release_principal_context()']);
    expect(query.mock.calls.at(-1)).toEqual(['RESET ROLE']);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('destroys provider pool.query clients when locked cleanup fails', async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = 'locked';
    process.env.DB_PRINCIPAL_SIGNING_SECRET = 'test-db-principal-signing-secret';
    const release = vi.fn();
    const query = vi.fn(async (sql: string, _values?: readonly unknown[]) => {
      if (sql === 'SELECT pg_backend_pid() AS backend_pid') {
        return { rows: [{ backend_pid: 8585 }], rowCount: 1 };
      }
      if (sql === 'SELECT app.release_principal_context()') {
        throw new Error('provider cleanup boom');
      }
      return { rows: [{ ok: true }], rowCount: 1 };
    });
    const client = { query, release };
    vi.spyOn(Pool.prototype, 'connect').mockResolvedValue(client as never);
    vi.spyOn(Pool.prototype, 'end').mockResolvedValue(undefined);
    const pool = createIntegratorPoolProvider({ connectionString: 'postgres://example/test' });

    await expect(
      runWithDbOrganizationPrincipal('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', () =>
        pool.query('SELECT ok'),
      ),
    ).rejects.toThrow('provider cleanup boom');
    await pool.end();

    expect(query).toHaveBeenCalledWith('SELECT ok');
    expect(query.mock.calls.at(-1)).toEqual(['RESET ROLE']);
    expect(release).toHaveBeenCalledTimes(1);
    expect(release.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect((release.mock.calls[0]?.[0] as Error).message).toBe('provider cleanup boom');
  });

  it('rejects callback-form pool.query at the provider chokepoint', async () => {
    const pool = createIntegratorPoolProvider({ connectionString: 'postgres://example/test' });

    expect(() =>
      pool.query('SELECT ok', () => undefined),
    ).toThrow('Callback-form pool.query is forbidden');
    await pool.end();
  });

	it('rejects invalid locked DB principal env before pool.query checkout', async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = 'locked';
    delete process.env.DB_PRINCIPAL_SIGNING_SECRET;
    const connect = vi.spyOn(Pool.prototype, 'connect');
    const pool = createIntegratorPoolProvider({ connectionString: 'postgres://example/test' });

    await expect(pool.query('SELECT ok')).rejects.toThrow('DB_PRINCIPAL_SIGNING_SECRET is required');
    await pool.end();

		expect(connect).not.toHaveBeenCalled();
	});

	it('rejects missing locked DB principal before pool.query checkout', async () => {
		process.env.DB_PRINCIPAL_CONTEXT_MODE = 'locked';
		process.env.DB_PRINCIPAL_SIGNING_SECRET = 'test-db-principal-signing-secret';
		const connect = vi.spyOn(Pool.prototype, 'connect');
		const pool = createIntegratorPoolProvider({ connectionString: 'postgres://example/test' });

		await expect(pool.query('SELECT ok')).rejects.toThrow(
			'DB principal context is required before integrator scoped DB access in locked mode',
		);
		await pool.end();

		expect(connect).not.toHaveBeenCalled();
	});
});
