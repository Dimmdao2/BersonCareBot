import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const upsertMock = vi.hoisted(() => vi.fn());

vi.mock('../infra/db/repos/integrationDataQualityIncidents.js', () => ({
  upsertIntegrationDataQualityIncident: upsertMock,
}));

vi.mock('../integrations/telegram/config.js', () => ({
  telegramConfig: { adminTelegramId: 424242 },
}));

import type { DbPort } from '../kernel/contracts/index.js';
import { getAppDisplayTimezone, resetAppDisplayTimezoneCacheForTests } from './appTimezone.js';

function mockDb(query: DbPort['query']): DbPort {
  const db: DbPort = {
    query,
    async tx(fn) {
      return fn(db);
    },
  };
  return db;
}

describe('getAppDisplayTimezone → Telegram dispatch on fallback', () => {
  beforeEach(() => {
    resetAppDisplayTimezoneCacheForTests();
    upsertMock.mockReset();
    upsertMock.mockResolvedValue({ occurrences: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls dispatchOutgoing when dispatchPort is provided (first dedup)', async () => {
    vi.useFakeTimers({ now: 0 });
    const dispatchOutgoing = vi.fn().mockResolvedValue(undefined);
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const db = mockDb(query);
    await getAppDisplayTimezone({ db, dispatchPort: { dispatchOutgoing } });
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(dispatchOutgoing).toHaveBeenCalledTimes(1);
    const intent = dispatchOutgoing.mock.calls[0]![0] as { type: string };
    expect(intent.type).toBe('message.send');
  });
});
