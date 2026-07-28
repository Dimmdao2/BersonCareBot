import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import type { DbPort } from '../kernel/contracts/index.js';

const loggerWarn = vi.hoisted(() => vi.fn());
vi.mock('../infra/observability/logger.js', () => ({
  logger: { warn: loggerWarn },
}));

import { invalidateSmtpOutboundCache, resolveSmtpOutboundConfig } from './smtpOutbound.js';
import { createDbPort } from '../infra/db/client.js';

function restoreEnvValue(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

function mockDb(query: DbPort['query']): DbPort {
  const db: DbPort = {
    query,
    async tx(fn) {
      return fn(db);
    },
  };
  return db;
}

describe('smtp outbound restricted DB config', () => {
  const originalDbPrincipalContextMode = process.env.DB_PRINCIPAL_CONTEXT_MODE;
  const originalDbPrincipalSigningSecret = process.env.DB_PRINCIPAL_SIGNING_SECRET;

  beforeEach(() => {
    invalidateSmtpOutboundCache();
    loggerWarn.mockReset();
    restoreEnvValue('DB_PRINCIPAL_CONTEXT_MODE', originalDbPrincipalContextMode);
    restoreEnvValue('DB_PRINCIPAL_SIGNING_SECRET', originalDbPrincipalSigningSecret);
  });

  afterEach(() => {
    invalidateSmtpOutboundCache();
    vi.useRealTimers();
    restoreEnvValue('DB_PRINCIPAL_CONTEXT_MODE', originalDbPrincipalContextMode);
    restoreEnvValue('DB_PRINCIPAL_SIGNING_SECRET', originalDbPrincipalSigningSecret);
  });

  it('resolves complete smtp_outbound only through the restricted DB capability', async () => {
    const inner = {
      host: 'db-host.example.com',
      port: 587,
      secure: false,
      user: 'db-user',
      password: ' db-pass ',
      from: 'db-from@example.com',
    };
    const query = vi.fn().mockImplementation(async () => {
      expect(getCurrentDbPrincipal()).toEqual({
        kind: 'bootstrap',
        source: 'integrator-server-runtime-config',
      });
      return {
        rows: [{ value_json: { value: inner } }],
      };
    });

    const r = await resolveSmtpOutboundConfig(mockDb(query));

    expect(r.configured).toBe(true);
    expect(r.smtpHost).toBe('db-host.example.com');
    expect(r.smtpPort).toBe(587);
    expect(r.smtpSecure).toBe(false);
    expect(r.smtpUser).toBe('db-user');
    expect(r.smtpPass).toBe('db-pass');
    expect(r.fromAddress).toBe('db-from@example.com');
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      'SELECT app.read_integrator_smtp_outbound_setting() AS value_json',
    );
  });

  it('uses the deployed locked createDbPort request-pool path with the allowed bootstrap principal', async () => {
    process.env.DB_PRINCIPAL_CONTEXT_MODE = 'locked';
    process.env.DB_PRINCIPAL_SIGNING_SECRET = 'test-db-principal-signing-secret';

    const inner = {
      host: 'locked-db.example.com',
      port: 587,
      secure: false,
      user: 'locked-user',
      password: 'locked-pass',
      from: 'locked@example.com',
    };
    const release = vi.fn();
    const query = vi.fn(async (sql: string) => {
      if (sql === 'SELECT app.read_integrator_smtp_outbound_setting() AS value_json') {
        expect(getCurrentDbPrincipal()).toEqual({
          kind: 'bootstrap',
          source: 'integrator-server-runtime-config',
        });
        return { rows: [{ value_json: { value: inner } }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const client = { query, release };
    const pool = {
      connect: vi.fn(async () => client),
      on: vi.fn(),
      end: vi.fn(),
    };

    const resolved = await resolveSmtpOutboundConfig(createDbPort(pool as never));

    expect(resolved.configured).toBe(true);
    expect(resolved.smtpHost).toBe('locked-db.example.com');
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      'SELECT app.read_integrator_smtp_outbound_setting() AS value_json',
      undefined,
    );
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('returns unconfigured when the DB row is incomplete', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          value_json: {
            value: {
              host: 'partial.example.com',
              port: 587,
              secure: false,
              user: 'partial-user',
              password: '',
              from: 'partial@example.com',
            },
          },
        },
      ],
    });

    const r = await resolveSmtpOutboundConfig(mockDb(query));

    expect(r.configured).toBe(false);
    expect(r.smtpHost).toBe('');
  });

  it('returns unconfigured when there is no DB row', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const r = await resolveSmtpOutboundConfig(mockDb(query));

    expect(r.configured).toBe(false);
  });

  it('fails closed without logging database error details or credential material', async () => {
    const query = vi
      .fn()
      .mockRejectedValue(new Error('permission denied while reading password=do-not-log'));

    const r = await resolveSmtpOutboundConfig(mockDb(query));

    expect(r.configured).toBe(false);
    expect(r.smtpHost).toBe('');
    expect(loggerWarn).toHaveBeenCalledWith(
      { key: 'smtp_outbound', reason: 'restricted_setting_read_failed' },
      '[smtpOutbound] restricted DB setting unavailable',
    );
    expect(JSON.stringify(loggerWarn.mock.calls)).not.toContain('do-not-log');
  });

  it('forces secure when port is 465 in DB payload', async () => {
    const inner = {
      host: 's.example.com',
      port: 465,
      secure: false,
      user: 'u',
      password: 'p',
      from: 'f@example.com',
    };
    const query = vi.fn().mockResolvedValue({ rows: [{ value_json: { value: inner } }] });

    const r = await resolveSmtpOutboundConfig(mockDb(query));
    expect(r.smtpSecure).toBe(true);
  });

  it('caches result for TTL and skips repeat DB hits', async () => {
    vi.useFakeTimers({ now: 10_000 });
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          value_json: {
            value: {
              host: 'c.example.com',
              port: 587,
              user: 'u',
              password: 'p',
              from: 'f@example.com',
            },
          },
        },
      ],
    });

    const db = mockDb(query);

    await resolveSmtpOutboundConfig(db);
    await resolveSmtpOutboundConfig(db);
    expect(query).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60_000);

    await resolveSmtpOutboundConfig(db);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
