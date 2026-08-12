import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  getWebappSqlDb: vi.fn(() => ({ tag: 'db' })),
  runWebappNamedRoot: vi.fn(),
}));

vi.mock('@/infra/db/runWebappSql', () => fakes);

import { createPgClientHistoryPort } from '@/infra/repos/pgClientHistory';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('patient self-booking guard', () => {
  it.each([
    [true, true],
    [false, false],
  ])('returns only the boolean from the exact current-patient root', async (allowed, expected) => {
    fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ allowed }] });

    await expect(createPgClientHistoryPort().isCurrentPatientSelfBookingAllowed()).resolves.toBe(
      expected,
    );

    expect(fakes.runWebappNamedRoot).toHaveBeenCalledOnce();
    const [db, identity, args] = fakes.runWebappNamedRoot.mock.calls[0] as unknown[];
    expect(db).toEqual({ tag: 'db' });
    expect(identity).toBe('app.is_current_patient_self_booking_allowed()');
    expect(args).toEqual([]);
  });

  it('fails closed when the root returns no row', async () => {
    fakes.runWebappNamedRoot.mockResolvedValue({ rows: [] });

    await expect(createPgClientHistoryPort().isCurrentPatientSelfBookingAllowed()).resolves.toBe(
      false,
    );
  });
});
