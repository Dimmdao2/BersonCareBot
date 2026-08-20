import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  getCurrentDbPrincipal: vi.fn(),
  getDrizzle: vi.fn(),
  getWebappSqlDb: vi.fn(() => ({ kind: 'webapp-sql-db' })),
  runWebappNamedRoot: vi.fn(),
}));

vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipal: fakes.getCurrentDbPrincipal,
}));

vi.mock('@/app-layer/db/drizzle', () => ({
  getDrizzle: fakes.getDrizzle,
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: fakes.getWebappSqlDb,
  runWebappNamedRoot: fakes.runWebappNamedRoot,
}));

import { createPgPlaybackUserVideoFirstResolvePort } from './pgPlaybackUserVideoFirstResolve';

const input = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002',
  mediaId: '00000000-0000-4000-8000-000000000003',
};

describe('createPgPlaybackUserVideoFirstResolvePort', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the exact current-patient capability and returns its insertion result', async () => {
    fakes.getCurrentDbPrincipal.mockReturnValue({ kind: 'patient' });
    fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ inserted: true }] });

    await expect(createPgPlaybackUserVideoFirstResolvePort().record(input)).resolves.toBe(true);
    expect(fakes.runWebappNamedRoot).toHaveBeenCalledWith(
      { kind: 'webapp-sql-db' },
      'app.record_current_patient_playback_first_resolve(uuid)',
      [input.mediaId],
      expect.anything(),
    );
    expect(fakes.getDrizzle).not.toHaveBeenCalled();
  });

  it('keeps the staff path on the Drizzle repository insert', async () => {
    fakes.getCurrentDbPrincipal.mockReturnValue({ kind: 'staff' });
    const returning = vi.fn().mockResolvedValue([{ mediaId: input.mediaId }]);
    const onConflictDoNothing = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoNothing }));
    const insert = vi.fn(() => ({ values }));
    fakes.getDrizzle.mockReturnValue({ insert });

    await expect(createPgPlaybackUserVideoFirstResolvePort().record(input)).resolves.toBe(true);
    expect(values).toHaveBeenCalledWith(input);
    expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
    expect(fakes.runWebappNamedRoot).not.toHaveBeenCalled();
  });
});
