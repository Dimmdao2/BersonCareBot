/* eslint-disable no-secrets/no-secrets -- test names and SQL fragments reference legacy table names */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drizzleSqlFragmentToApproximateSql } from '../../../infra/db/drizzleSqlDebugText.js';
import { runIntegratorSql } from '../../../infra/db/runIntegratorSql.js';
import {
  deactivateBookingProfile,
  listBranches,
  pickAnyActiveRubitimeScheduleTriple,
  resolveBookingProfile,
  upsertBookingProfile,
} from './bookingProfilesRepo.js';

vi.mock('../../../infra/db/runIntegratorSql.js', () => ({
  runIntegratorSql: vi.fn().mockResolvedValue({ rows: [] }),
}));

function lastSql(): string {
  const fragment = vi.mocked(runIntegratorSql).mock.calls.at(-1)?.[1];
  return drizzleSqlFragmentToApproximateSql(fragment);
}

describe('bookingProfilesRepo legacy rubitime tables (Drizzle sql)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runIntegratorSql).mockResolvedValue({ rows: [] });
  });

  it('listBranches reads legacy rubitime_branches and maps bigint ids to numbers', async () => {
    vi.mocked(runIntegratorSql).mockResolvedValueOnce({
      rows: [
        {
          id: '42',
          rubitime_branch_id: 1001,
          city_code: 'msk',
          title: 'Branch',
          address: 'Address',
          is_active: true,
        },
      ],
    });

    const rows = await listBranches({} as never);

    expect(rows).toEqual([
      {
        id: 42,
        rubitimeBranchId: 1001,
        cityCode: 'msk',
        title: 'Branch',
        address: 'Address',
        isActive: true,
      },
    ]);
    const sqlText = lastSql();
    expect(sqlText).toContain('FROM rubitime_branches');
    expect(sqlText).not.toContain('public.booking_');
  });

  it('resolveBookingProfile keeps v1 legacy join and does not read public booking catalog', async () => {
    vi.mocked(runIntegratorSql).mockResolvedValueOnce({
      rows: [
        {
          rubitime_branch_id: 11,
          rubitime_service_id: 22,
          rubitime_cooperator_id: 33,
          duration_minutes: 60,
        },
      ],
    });

    const resolved = await resolveBookingProfile({} as never, {
      type: 'in_person',
      category: 'rehab',
      city: 'spb',
    });

    expect(resolved).toEqual({
      rubitimeBranchId: 11,
      rubitimeServiceId: 22,
      rubitimeCooperatorId: 33,
      durationMinutes: 60,
    });
    const sqlText = lastSql();
    expect(sqlText).toContain('FROM rubitime_booking_profiles p');
    expect(sqlText).toContain('JOIN rubitime_branches');
    expect(sqlText).toContain('JOIN rubitime_services');
    expect(sqlText).toContain('JOIN rubitime_cooperators');
    expect(sqlText).not.toContain('public.booking_');
  });

  it('pickAnyActiveRubitimeScheduleTriple preserves active-only health probe lookup', async () => {
    vi.mocked(runIntegratorSql).mockResolvedValueOnce({
      rows: [{ rubitime_branch_id: 1, rubitime_service_id: 2, rubitime_cooperator_id: 3 }],
    });

    const triple = await pickAnyActiveRubitimeScheduleTriple({} as never);

    expect(triple).toEqual({ branchId: 1, serviceId: 2, cooperatorId: 3 });
    const sqlText = lastSql();
    expect(sqlText).toContain('p.is_active = TRUE');
    expect(sqlText).toContain('b.is_active = TRUE');
    expect(sqlText).toContain('s.is_active = TRUE');
    expect(sqlText).toContain('c.is_active = TRUE');
  });

  it('upsertBookingProfile uses legacy coalesced unique constraint', async () => {
    vi.mocked(runIntegratorSql).mockResolvedValueOnce({ rows: [{ id: '77' }] });

    const result = await upsertBookingProfile({} as never, {
      bookingType: 'online',
      categoryCode: 'nutrition',
      cityCode: null,
      branchId: 10,
      serviceId: 20,
      cooperatorId: 30,
    });

    expect(result).toEqual({ id: 77 });
    const sqlText = lastSql();
    expect(sqlText).toContain('INSERT INTO rubitime_booking_profiles');
    expect(sqlText).toContain('ON CONFLICT ON CONSTRAINT rubitime_booking_profiles_booking_type_category_code_coalesce_ci_key');
    expect(sqlText).not.toContain('public.booking_');
  });

  it('deactivateBookingProfile only soft-disables legacy profile row', async () => {
    await deactivateBookingProfile({} as never, 88);

    const sqlText = lastSql();
    expect(sqlText).toContain('UPDATE rubitime_booking_profiles');
    expect(sqlText).toContain('is_active = FALSE');
    expect(sqlText).toContain('updated_at = NOW()');
  });
});
