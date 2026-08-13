import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort, QueuePort } from '../../kernel/contracts/index.js';

const fakes = vi.hoisted(() => ({
  upsertDirect: vi.fn(),
  enqueueProjection: vi.fn(),
  recordIncident: vi.fn(),
  runOrganization: vi.fn(async <T>(_organizationId: string, fn: () => Promise<T>) => fn()),
  runIntegrator: vi.fn(async <T>(_principal: unknown, fn: () => Promise<T>) => fn()),
}));

vi.mock('./directPublic/writeReminderRulesDirect.js', () => ({
  upsertReminderRuleDirect: fakes.upsertDirect,
}));
vi.mock('./repos/projectionOutbox.js', () => ({
  enqueueProjectionEvent: fakes.enqueueProjection,
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

describe('reminder-rule durable fallback principal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.upsertDirect.mockRejectedValue(new Error('synthetic direct failure'));
    fakes.enqueueProjection.mockResolvedValue(undefined);
    fakes.recordIncident.mockResolvedValue({ id: 'incident', occurrenceCount: 1 });
  });

  it('re-enters the exact integrator request context before writing the outbox', async () => {
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
        source: 'reminder-rule-outbox-fallback',
      },
      expect.any(Function),
    );
    expect(fakes.enqueueProjection).toHaveBeenCalledTimes(1);
    expect(fakes.enqueueProjection.mock.calls[0]?.[1]).toMatchObject({
      eventType: 'reminder.rule.upserted',
      payload: { integratorRuleId: 'rule-fallback-test', integratorUserId: '2' },
    });
  });
});
