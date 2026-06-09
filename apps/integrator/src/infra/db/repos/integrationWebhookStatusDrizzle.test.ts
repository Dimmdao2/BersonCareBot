import { beforeEach, describe, expect, it, vi } from 'vitest';
import { upsertIntegrationWebhookLastStatus } from './integrationWebhookStatusDrizzle.js';

type UpsertValues = {
  source: string;
  processedOk: number;
  errorClass: string | null;
  httpStatusReturned?: number | null;
  detail: string | null;
};

const onConflictDoUpdateMock = vi.fn().mockResolvedValue(undefined);
const valuesMock = vi.fn((_arg: UpsertValues) => ({ onConflictDoUpdate: onConflictDoUpdateMock }));
const insertTableMock = vi.fn(() => ({ values: valuesMock }));

vi.mock('../drizzle.js', () => ({
  getIntegratorDrizzle: () => ({
    insert: insertTableMock,
  }),
}));

describe('upsertIntegrationWebhookLastStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upserts success row', async () => {
    await upsertIntegrationWebhookLastStatus({
      source: 'telegram',
      processedOk: true,
      httpStatusReturned: 200,
    });
    expect(valuesMock).toHaveBeenCalled();
    const values = valuesMock.mock.calls[0]![0];
    expect(values.source).toBe('telegram');
    expect(values.processedOk).toBe(1);
    expect(values.errorClass).toBeNull();
  });

  it('upserts failure row with truncated detail', async () => {
    await upsertIntegrationWebhookLastStatus({
      source: 'max',
      processedOk: false,
      errorClass: 'webhook_auth_failed',
      httpStatusReturned: 200,
      detail: 'x'.repeat(1000),
    });
    const values = valuesMock.mock.calls[0]![0];
    expect(values.processedOk).toBe(0);
    expect(values.detail?.length).toBeLessThanOrEqual(901);
  });
});
