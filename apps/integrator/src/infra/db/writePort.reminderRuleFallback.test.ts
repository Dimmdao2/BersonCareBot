import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort, QueuePort, WebappEventsPort } from '../../kernel/contracts/index.js';

const fakes = vi.hoisted(() => ({
  upsertDirect: vi.fn(),
  enqueueDirectRetry: vi.fn(),
  appendSupportDeliveryDirect: vi.fn(),
  writeOperatorDeliveryAttempt: vi.fn(),
  recordIncident: vi.fn(),
  syncSupportDeliveryAttempt: vi.fn(),
  runOrganization: vi.fn(async <T>(_organizationId: string, fn: () => Promise<T>) => fn()),
  runIntegrator: vi.fn(async <T>(_principal: unknown, fn: () => Promise<T>) => fn()),
}));

vi.mock('./directPublic/writeReminderRulesDirect.js', () => ({
  upsertReminderRuleDirect: fakes.upsertDirect,
}));
vi.mock('./repos/directPublicWriteRetry.js', () => ({
  enqueueDirectPublicWriteRetry: fakes.enqueueDirectRetry,
}));
vi.mock('./directPublic/writeSupportQuestionsDirect.js', () => ({
  appendSupportDeliveryEventDirect: fakes.appendSupportDeliveryDirect,
}));
vi.mock('./repos/messageLogs.js', () => ({
  appendMessageLog: vi.fn(),
}));
vi.mock('./repos/operatorDeliveryAttempts.js', () => ({
  writeOperatorDeliveryAttempt: fakes.writeOperatorDeliveryAttempt,
}));
vi.mock('../operatorIncident/reportOperatorFailure.js', () => ({
  recordOperatorFailureIncident: fakes.recordIncident,
}));
vi.mock('../principal/organizationPrincipal.js', () => ({
  runWithOrganizationPrincipal: fakes.runOrganization,
  runWithIntegratorPrincipal: fakes.runIntegrator,
}));

import { createDbWritePort } from './writePort.js';

const ORGANIZATION_ID = 'a0000000-0000-4000-8000-000000000001';
const PLATFORM_USER_ID = 'b0021a38-fb86-45e9-9aec-d85014e932d4';

function unusedDb(): DbPort {
  return {
    async query() {
      throw new Error('query must not be used');
    },
    async tx(fn) {
      return fn(this);
    },
  };
}

function resetFallbackFakes(): void {
  vi.clearAllMocks();
  fakes.upsertDirect.mockRejectedValue(new Error('synthetic direct failure'));
  fakes.enqueueDirectRetry.mockResolvedValue(undefined);
  fakes.appendSupportDeliveryDirect.mockRejectedValue(new Error('synthetic direct failure'));
  fakes.writeOperatorDeliveryAttempt.mockResolvedValue(undefined);
  fakes.recordIncident.mockResolvedValue({ id: 'incident', occurrenceCount: 1 });
}

describe('reminder-rule durable fallback principal', () => {
  beforeEach(() => {
    resetFallbackFakes();
  });

  it('persists the full direct write for retry when the initial canonical write fails', async () => {
    const writePort = createDbWritePort({
      db: unusedDb(),
      queuePort: {} as QueuePort,
    });

    await writePort.writeDb({
      type: 'reminders.rule.upsert',
      params: {
        id: 'rule-fallback-test',
        userId: '2',
        category: 'custom',
        isEnabled: false,
        scheduleType: 'interval_window',
        timezone: 'Europe/Moscow',
        intervalMinutes: 60,
        windowStartMinute: 540,
        windowEndMinute: 600,
        daysMask: '1111111',
        contentMode: 'custom',
        resolvedPlatformUserId: PLATFORM_USER_ID,
        resolvedOrganizationId: ORGANIZATION_ID,
      },
    });

    expect(fakes.runIntegrator).toHaveBeenCalledWith(
      {
        organizationId: ORGANIZATION_ID,
        integratorUserId: '2',
        source: 'reminder-rule-direct-write-retry',
      },
      expect.any(Function),
    );
    expect(fakes.enqueueDirectRetry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        operation: 'reminder_rule_upsert',
        organizationId: ORGANIZATION_ID,
        payload: expect.objectContaining({
          integratorRuleId: 'rule-fallback-test',
          integratorUserId: '2',
          resolvedPlatformUserId: PLATFORM_USER_ID,
        }),
      }),
    );
  });

  it('persists a support delivery attempt for direct retry when its canonical append fails', async () => {
    const writePort = createDbWritePort({
      db: unusedDb(),
      queuePort: {} as QueuePort,
    });

    await writePort.writeDb({
      type: 'delivery.attempt.log',
      params: {
        organizationId: ORGANIZATION_ID,
        intentEventId: 'delivery-fallback-test',
        channel: 'telegram',
        status: 'failed',
        attempt: 1,
        payload: { source: 'fault-injection' },
      },
    });

    expect(fakes.enqueueDirectRetry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        operation: 'support_delivery_attempt_append',
        organizationId: ORGANIZATION_ID,
        payload: expect.objectContaining({
          integratorIntentEventId: 'delivery-fallback-test',
          channelCode: 'telegram',
        }),
      }),
    );
  });
});

describe('D20 canonical support handoff failures', () => {
  beforeEach(() => {
    resetFallbackFakes();
  });

  const handoffFailures: ReadonlyArray<{
    name: string;
    sync: () => Promise<{
      ok: boolean;
      canonicalWrite?: { deliveryAttemptId: string; organizationId: string };
    }>;
    legacyWriteAllowed: boolean;
  }> = [
    {
      name: 'webapp transport throws',
      sync: async () => {
        throw new Error('webapp unreachable');
      },
      legacyWriteAllowed: true,
    },
    {
      name: 'webapp acknowledges without canonicalWrite',
      sync: async () => ({ ok: true }),
      legacyWriteAllowed: true,
    },
    {
      name: 'webapp acknowledges another delivery attempt',
      sync: async () => ({
        ok: true,
        canonicalWrite: {
          deliveryAttemptId: 'another-delivery-attempt',
          organizationId: ORGANIZATION_ID,
        },
      }),
      legacyWriteAllowed: false,
    },
  ];

  function webappEventsPort(): WebappEventsPort {
    return {
      syncSupportDeliveryAttempt: fakes.syncSupportDeliveryAttempt,
    };
  }

  it.each(handoffFailures)(
    'records an operator incident instead of silently accepting $name',
    async ({ sync, legacyWriteAllowed }) => {
      fakes.syncSupportDeliveryAttempt.mockImplementation(sync);
      fakes.appendSupportDeliveryDirect.mockResolvedValue(undefined);

      const writePort = createDbWritePort({
        db: unusedDb(),
        queuePort: {} as QueuePort,
        webappEventsPort: webappEventsPort(),
      });

      await writePort.writeDb({
        type: 'delivery.attempt.log',
        params: {
          organizationId: ORGANIZATION_ID,
          intentEventId: 'd20-canonical-handoff',
          channel: 'telegram',
          status: 'failed',
          attempt: 1,
          payload: { source: 'd20' },
        },
      });

      if (!legacyWriteAllowed) {
        expect.soft(fakes.appendSupportDeliveryDirect).not.toHaveBeenCalled();
      }
      expect.soft(fakes.recordIncident).toHaveBeenCalledTimes(1);
    },
  );
});
