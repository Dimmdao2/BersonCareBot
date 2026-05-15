import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import { appendMessageLog, insertDeliveryAttemptLog } from './messageLogs.js';

vi.mock('../drizzle.js', () => ({
  getIntegratorDrizzleSession: vi.fn(),
}));

const loggerWarn = vi.fn();
const loggerError = vi.fn();
const loggerInfo = vi.fn();

vi.mock('../../observability/logger.js', () => ({
  logger: {
    warn: (...args: unknown[]) => loggerWarn(...args),
    error: (...args: unknown[]) => loggerError(...args),
    info: (...args: unknown[]) => loggerInfo(...args),
  },
}));

describe('messageLogs / delivery_attempt_logs (Drizzle)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('insertDeliveryAttemptLog skips insert when attempt is invalid', async () => {
    const insert = vi.fn();
    vi.mocked(getIntegratorDrizzleSession).mockReturnValue({ insert } as never);

    await insertDeliveryAttemptLog({} as DbPort, {
      channel: 'telegram',
      status: 'success',
      attempt: 0,
    });

    expect(insert).not.toHaveBeenCalled();
    expect(loggerWarn).toHaveBeenCalled();
  });

  it('insertDeliveryAttemptLog skips insert when status is not success|failed', async () => {
    const insert = vi.fn();
    vi.mocked(getIntegratorDrizzleSession).mockReturnValue({ insert } as never);

    await insertDeliveryAttemptLog({} as DbPort, {
      channel: 'telegram',
      status: 'pending',
      attempt: 1,
    });

    expect(insert).not.toHaveBeenCalled();
    expect(loggerWarn).toHaveBeenCalled();
  });

  it('insertDeliveryAttemptLog inserts valid row with payload object', async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn().mockReturnValue({ values });
    vi.mocked(getIntegratorDrizzleSession).mockReturnValue({ insert } as never);

    await insertDeliveryAttemptLog({} as DbPort, {
      intentType: 'reminder',
      intentEventId: 'evt-1',
      correlationId: 'corr-1',
      channel: 'max',
      status: 'failed',
      attempt: 2,
      reason: 'timeout',
      payload: { x: 1 },
      occurredAt: '2026-01-02T00:00:00.000Z',
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'max',
        status: 'failed',
        attempt: 2,
        reason: 'timeout',
        intentType: 'reminder',
        intentEventId: 'evt-1',
        correlationId: 'corr-1',
        occurredAt: '2026-01-02T00:00:00.000Z',
        payloadJson: { x: 1 },
      }),
    );
  });

  it('insertDeliveryAttemptLog maps non-object payload to empty object', async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn().mockReturnValue({ values });
    vi.mocked(getIntegratorDrizzleSession).mockReturnValue({ insert } as never);

    await insertDeliveryAttemptLog({} as DbPort, {
      channel: 'telegram',
      status: 'success',
      attempt: 1,
      payload: 'not-an-object',
    });

    expect(values).toHaveBeenCalledWith(expect.objectContaining({ payloadJson: {} }));
  });

  it('insertDeliveryAttemptLog swallows Drizzle errors and logs', async () => {
    const values = vi.fn().mockRejectedValue(new Error('db down'));
    const insert = vi.fn().mockReturnValue({ values });
    vi.mocked(getIntegratorDrizzleSession).mockReturnValue({ insert } as never);

    await expect(
      insertDeliveryAttemptLog({} as DbPort, {
        channel: 'telegram',
        status: 'success',
        attempt: 1,
      }),
    ).resolves.toBeUndefined();

    expect(loggerError).toHaveBeenCalled();
  });

  it('appendMessageLog delegates delivery.attempt.log to insert path', async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn().mockReturnValue({ values });
    vi.mocked(getIntegratorDrizzleSession).mockReturnValue({ insert } as never);

    await appendMessageLog({} as DbPort, {
      type: 'delivery.attempt.log',
      params: {
        channel: 'telegram',
        status: 'success',
        attempt: 1,
      },
    } as never);

    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('appendMessageLog logs non-delivery mutations without touching Drizzle', async () => {
    const insert = vi.fn();
    vi.mocked(getIntegratorDrizzleSession).mockReturnValue({ insert } as never);

    await appendMessageLog({} as DbPort, {
      type: 'other.audit',
      params: { x: 1 },
    } as never);

    expect(insert).not.toHaveBeenCalled();
    expect(loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ mutationType: 'other.audit' }),
      'append message/delivery log',
    );
  });
});
