import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithDbInfraPrincipal } from '@bersoncare/db-principal';
import type { DbPort, DbQueryResult, DbWriteMutation } from '../../../kernel/contracts/index.js';

const infoMock = vi.hoisted(() => vi.fn());
const errorMock = vi.hoisted(() => vi.fn());
vi.mock('../../observability/logger.js', () => ({
  logger: { info: infoMock, warn: vi.fn(), error: errorMock },
}));

import { appendMessageLog, insertDeliveryAttemptLog } from './messageLogs.js';

function dbReturningFlag(value: boolean): DbPort {
  return {
    query: vi.fn().mockResolvedValue({
      rows: [{ value_json: { value } }],
      rowCount: 1,
    } as DbQueryResult<{ value_json: unknown }>) as unknown as DbPort['query'],
    tx: vi.fn() as unknown as DbPort['tx'],
  };
}

const nonDeliveryMutation = {
  type: 'message.audit',
  params: { phone: '+79990000000', secret: 'leak-me' },
} as unknown as DbWriteMutation;

describe('appendMessageLog verbose gating', () => {
  beforeEach(() => {
    infoMock.mockReset();
    errorMock.mockReset();
  });

  it('does not log non-delivery audit when verbose flag is off', async () => {
    await appendMessageLog(dbReturningFlag(false), nonDeliveryMutation);
    expect(infoMock).not.toHaveBeenCalled();
  });

  it('logs non-delivery audit without raw params when verbose flag is on', async () => {
    await appendMessageLog(dbReturningFlag(true), nonDeliveryMutation);
    expect(infoMock).toHaveBeenCalledTimes(1);
    const [fields] = infoMock.mock.calls[0]!;
    expect(fields).toEqual({ mutationType: 'message.audit' });
    expect(JSON.stringify(fields)).not.toContain('leak-me');
    expect(JSON.stringify(fields)).not.toContain('+79990000000');
  });
});

describe('insertDeliveryAttemptLog failure visibility', () => {
  beforeEach(() => {
    errorMock.mockReset();
  });

  it('rethrows an insert failure with a stable error code so dispatch can raise its loud fallback signal', async () => {
    const insertError = new Error('database unavailable');
    const values = vi.fn().mockRejectedValue(insertError);
    const db = {
      query: vi.fn(),
      tx: vi.fn(),
      integratorDrizzle: {
        insert: vi.fn(() => ({ values })),
      },
    } as unknown as DbPort;

    await expect(
      insertDeliveryAttemptLog(db, {
        intentType: 'message.send',
        intentEventId: 'otp:email:redacted',
        channel: 'email',
        status: 'success',
        attempt: 1,
        payload: { kind: 'otp_redacted' },
      }),
    ).rejects.toBe(insertError);

    expect(errorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'DELIVERY_ATTEMPT_LOG_INSERT_FAILED',
        channel: 'email',
        status: 'success',
      }),
      'insert delivery attempt log failed',
    );
  });

  it('uses the narrow global-email capability under the delivery-handler infra principal', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
    const db = { query, tx: vi.fn() } as unknown as DbPort;

    await runWithDbInfraPrincipal({ source: 'delivery-handler' }, () =>
      insertDeliveryAttemptLog(db, {
        intentType: 'message.send',
        intentEventId: 'otp:email:redacted',
        correlationId: null,
        channel: 'email',
        status: 'success',
        attempt: 1,
        payload: { kind: 'otp_redacted' },
        occurredAt: '2026-07-28T00:00:00.000Z',
      }),
    );

    expect(query).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT app.record_global_email_delivery_attempt('),
      [
        'message.send',
        'otp:email:redacted',
        null,
        'email',
        'success',
        1,
        null,
        { kind: 'otp_redacted' },
        '2026-07-28T00:00:00.000Z',
      ],
    );
  });
});
