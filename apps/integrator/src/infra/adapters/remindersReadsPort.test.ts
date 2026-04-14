import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../config/env.js', () => ({
  env: { APP_BASE_URL: 'https://webapp.test', LOG_LEVEL: 'silent' },
  integratorWebhookSecret: () => 'test-secret-16chars!!',
}));

vi.mock('../../config/appBaseUrl.js', () => ({
  getAppBaseUrl: async () => 'https://webapp.test',
}));

import type { DbPort } from '../../kernel/contracts/index.js';
import { createRemindersReadsPort } from './remindersReadsPort.js';

const mockDb = {} as DbPort;

const originalFetch = globalThis.fetch;

describe('remindersReadsPort', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('listRulesForUser calls correct URL and maps response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        rules: [
          {
            id: 'rule-1',
            userId: '42',
            category: 'exercise',
            isEnabled: true,
            scheduleType: 'daily',
            timezone: 'Europe/Moscow',
            intervalMinutes: 60,
            windowStartMinute: 0,
            windowEndMinute: 1440,
            daysMask: '1111111',
            contentMode: 'none',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        ],
      }),
    });
    const port = createRemindersReadsPort({ db: mockDb });
    const list = await port.listRulesForUser('42');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/api/integrator/reminders/rules');
    expect(url).toContain('integratorUserId=42');
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe('rule-1');
    expect(list[0]!.userId).toBe('42');
    expect(list[0]!.category).toBe('exercise');
  });

  it('listRulesForUser returns [] on network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    const port = createRemindersReadsPort({ db: mockDb });
    const list = await port.listRulesForUser('42');
    expect(list).toEqual([]);
  });

  it('getRuleForUserAndCategory calls correct URL and maps response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        rule: {
          id: 'rule-1',
          userId: '42',
          category: 'exercise',
          isEnabled: true,
          scheduleType: 'daily',
          timezone: 'UTC',
          intervalMinutes: 60,
          windowStartMinute: 0,
          windowEndMinute: 1440,
          daysMask: '1111111',
          contentMode: 'none',
        },
      }),
    });
    const port = createRemindersReadsPort({ db: mockDb });
    const rule = await port.getRuleForUserAndCategory('42', 'exercise');
    expect(rule).not.toBeNull();
    expect(rule!.id).toBe('rule-1');
    expect(rule!.category).toBe('exercise');
  });

  it('getRuleForUserAndCategory returns null on fetch error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    const port = createRemindersReadsPort({ db: mockDb });
    const rule = await port.getRuleForUserAndCategory('42', 'exercise');
    expect(rule).toBeNull();
  });

  it('listHistoryForUser calls correct URL and maps response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        history: [
          {
            id: 'occ-1',
            ruleId: 'rule-1',
            status: 'sent',
            deliveryChannel: 'telegram',
            errorCode: null,
            occurredAt: '2025-01-01T12:00:00.000Z',
          },
        ],
      }),
    });
    const port = createRemindersReadsPort({ db: mockDb });
    const history = await port.listHistoryForUser('42', 50);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/api/integrator/reminders/history');
    expect(url).toContain('integratorUserId=42');
    expect(url).toContain('limit=50');
    expect(history).toHaveLength(1);
    expect(history[0]!.id).toBe('occ-1');
    expect(history[0]!.status).toBe('sent');
  });

  it('listHistoryForUser returns [] on network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    const port = createRemindersReadsPort({ db: mockDb });
    const history = await port.listHistoryForUser('42');
    expect(history).toEqual([]);
  });
});
