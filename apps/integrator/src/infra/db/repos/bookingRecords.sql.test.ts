import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import { upsertRecord } from './bookingRecords.js';

vi.mock('../drizzle.js', () => ({
  getIntegratorDrizzleSession: vi.fn(),
}));

describe('bookingRecords upsertRecord (Drizzle)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes ISO recordAt into insert values for timestamptz column', async () => {
    const values = vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    });
    const insert = vi.fn().mockReturnValue({ values });
    vi.mocked(getIntegratorDrizzleSession).mockReturnValue({ insert } as never);

    const db = {} as DbPort;
    await upsertRecord(db, {
      externalRecordId: 'ext-1',
      phoneNormalized: '+79990001122',
      recordAt: '2026-04-07T08:00:00.000Z',
      status: 'updated',
      payloadJson: {},
      lastEvent: 'updated',
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        rubitimeRecordId: 'ext-1',
        recordAt: '2026-04-07T08:00:00.000Z',
      }),
    );
  });
});
