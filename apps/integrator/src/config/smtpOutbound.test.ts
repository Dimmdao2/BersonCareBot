import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../kernel/contracts/index.js';

const loggerWarn = vi.hoisted(() => vi.fn());
vi.mock('../infra/observability/logger.js', () => ({
  logger: { warn: loggerWarn },
}));

import { invalidateSmtpOutboundCache, resolveSmtpOutboundConfig } from './smtpOutbound.js';

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
  beforeEach(() => {
    invalidateSmtpOutboundCache();
    loggerWarn.mockReset();
  });

  afterEach(() => {
    invalidateSmtpOutboundCache();
    vi.useRealTimers();
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
    const query = vi.fn().mockResolvedValue({
      rows: [{ value_json: { value: inner } }],
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
    const query = vi.fn().mockRejectedValue(
      new Error('permission denied while reading password=do-not-log'),
    );

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
      rows: [{ value_json: { value: { host: 'c.example.com', port: 587, user: 'u', password: 'p', from: 'f@example.com' } } }],
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
