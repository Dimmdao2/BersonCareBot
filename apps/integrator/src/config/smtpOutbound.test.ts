import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../kernel/contracts/index.js';

/** Mutable stand-in for `emailConfig` — read on each `fromEnvFallback()`. */
const mockEmailEnv = vi.hoisted(() => ({
  configured: false,
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  smtpPass: '',
  fromAddress: '',
}));

vi.mock('../integrations/email/config.js', () => ({
  emailConfig: mockEmailEnv,
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

describe('smtp outbound config (DB + env)', () => {
  beforeEach(() => {
    invalidateSmtpOutboundCache();
    mockEmailEnv.configured = true;
    mockEmailEnv.smtpHost = 'env-host.example.com';
    mockEmailEnv.smtpPort = 2525;
    mockEmailEnv.smtpSecure = true;
    mockEmailEnv.smtpUser = 'env-user';
    mockEmailEnv.smtpPass = 'env-secret';
    mockEmailEnv.fromAddress = 'env-from@example.com';
  });

  afterEach(() => {
    invalidateSmtpOutboundCache();
    vi.useRealTimers();
  });

  it('prefers complete smtp_outbound from DB over env values', async () => {
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
    expect(query.mock.calls[0]![1]).toEqual(['smtp_outbound', 'admin']);
  });

  it('falls back to env when DB row is incomplete (empty password)', async () => {
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

    expect(r.configured).toBe(true);
    expect(r.smtpHost).toBe('env-host.example.com');
    expect(r.smtpPort).toBe(2525);
    expect(r.smtpPass).toBe('env-secret');
    expect(r.fromAddress).toBe('env-from@example.com');
  });

  it('falls back to env when there is no row', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const r = await resolveSmtpOutboundConfig(mockDb(query));

    expect(r.configured).toBe(true);
    expect(r.smtpHost).toBe('env-host.example.com');
  });

  it('returns empty when DB incomplete and env not configured', async () => {
    mockEmailEnv.configured = false;
    const query = vi.fn().mockResolvedValue({
      rows: [{ value_json: { value: { host: 'x', password: '', user: 'u', from: 'f@example.com', port: 587 } } }],
    });

    const r = await resolveSmtpOutboundConfig(mockDb(query));

    expect(r.configured).toBe(false);
    expect(r.smtpHost).toBe('');
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
