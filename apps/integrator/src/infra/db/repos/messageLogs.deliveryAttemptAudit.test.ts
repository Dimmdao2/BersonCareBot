/**
 * Regression cover for the TEST-journal defect found 2026-08-07: a worker-drained send keeps its
 * own `worker:job-queue-drain` principal through the audit write, so it missed the delivery-handler
 * branch and fell through to a direct `integrator.delivery_attempt_logs` INSERT. The delivery
 * worker role has no USAGE on the `integrator` schema, so every max/telegram/sms attempt died with
 * `42P01 relation "delivery_attempt_logs" does not exist` and rolled its transaction back — the
 * audit row for each of those sends was simply lost.
 */
import { describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const currentPrincipal = vi.fn<() => { kind: 'infra'; source: string } | undefined>(
  () => undefined,
);
const technicalRuntimeRole = vi.fn<() => string | undefined>(() => undefined);
const drizzleInsert = vi.fn();

vi.mock(import('@bersoncare/db-principal'), async (importOriginal) => ({
  ...(await importOriginal()),
  getCurrentDbPrincipal: () => currentPrincipal(),
}));
vi.mock('../withClient.js', () => ({
  getCurrentIntegratorTechnicalRuntimeRole: () => technicalRuntimeRole(),
}));
vi.mock('../drizzle.js', () => ({
  getIntegratorDrizzleSession: () => ({
    insert: (...args: unknown[]) => {
      drizzleInsert(...args);
      return { values: async () => undefined };
    },
  }),
}));

const db = { query, tx: vi.fn() } as never;

const attempt = (channel: string) => ({
  intentType: 'message.send',
  intentEventId: `booking-reminder:${channel}:24h`,
  correlationId: null,
  channel,
  status: 'failed',
  attempt: 1,
  reason: 'provider_rejected',
  payload: { message: { text: 'x' } },
  occurredAt: '2026-08-07T13:01:02.011Z',
});

describe('delivery attempt audit persistence per principal', () => {
  it('дано: доставка слита воркером под app_operational_delivery_worker → тогда аудит пишется через capability, без кросс-схемного INSERT, который роль выполнить не может', async () => {
    currentPrincipal.mockReturnValue({ kind: 'infra', source: 'worker:job-queue-drain' });
    technicalRuntimeRole.mockReturnValue('app_operational_delivery_worker');
    query.mockResolvedValue({ rows: [] });
    drizzleInsert.mockClear();

    const { appendMessageLog } = await import('./messageLogs.js');
    await appendMessageLog(db, {
      type: 'delivery.attempt.log',
      params: attempt('max'),
    } as never);

    const [sqlText, params] = query.mock.calls.at(-1) as [string, unknown[]];
    expect(sqlText).toContain('app.record_operational_delivery_attempt_audit');
    expect(params).toContain('max');
    // The email-only capability cannot take this row: it hard-pins p_channel = 'email'.
    expect(sqlText).not.toContain('app.record_global_email_delivery_attempt');
    expect(drizzleInsert).not.toHaveBeenCalled();
  });

  it('дано: глобальная безтенантная отправка под delivery-handler → тогда путь остаётся прежним (email-capability), поведение не менялось', async () => {
    currentPrincipal.mockReturnValue({ kind: 'infra', source: 'delivery-handler' });
    technicalRuntimeRole.mockReturnValue(undefined);
    query.mockResolvedValue({ rows: [] });
    drizzleInsert.mockClear();

    const { appendMessageLog } = await import('./messageLogs.js');
    await appendMessageLog(db, {
      type: 'delivery.attempt.log',
      params: attempt('email'),
    } as never);

    const [sqlText] = query.mock.calls.at(-1) as [string, unknown[]];
    expect(sqlText).toContain('app.record_global_email_delivery_attempt');
    expect(drizzleInsert).not.toHaveBeenCalled();
  });
});
