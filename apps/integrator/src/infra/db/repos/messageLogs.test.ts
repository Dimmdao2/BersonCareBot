import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort, DbQueryResult, DbWriteMutation } from '../../../kernel/contracts/index.js';

const infoMock = vi.hoisted(() => vi.fn());
vi.mock('../../observability/logger.js', () => ({
  logger: { info: infoMock, warn: vi.fn(), error: vi.fn() },
}));

import { appendMessageLog } from './messageLogs.js';
import { resetOperationalVerboseLogCacheForTests } from './operationalVerboseLog.js';

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
    resetOperationalVerboseLogCacheForTests();
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
