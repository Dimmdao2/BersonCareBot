import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveScheduleParams, _resetScheduleMappingCache } from './bookingScheduleMapping.js';

// Mock the DB client and booking profiles repo
const resolveBookingProfile = vi.hoisted(() => vi.fn());
vi.mock('./db/bookingProfilesRepo.js', () => ({ resolveBookingProfile }));
vi.mock('../../infra/db/client.js', () => ({ createDbPort: () => ({}) }));

beforeEach(() => {
  _resetScheduleMappingCache();
  resolveBookingProfile.mockReset();
});

describe('resolveScheduleParams', () => {
  it('resolves online/general to correct params when profile exists in DB', async () => {
    resolveBookingProfile.mockResolvedValueOnce({
      rubitimeBranchId: 10,
      rubitimeCooperatorId: 20,
      rubitimeServiceId: 30,
      durationMinutes: 60,
    });
    const result = await resolveScheduleParams({ type: 'online', category: 'general' });
    expect(result).toEqual({ branchId: 10, cooperatorId: 20, serviceId: 30, durationMinutes: 60 });
    expect(resolveBookingProfile).toHaveBeenCalledWith(
      {},
      { type: 'online', category: 'general', city: undefined },
    );
  });

  it('resolves online/rehab_lfk', async () => {
    resolveBookingProfile.mockResolvedValueOnce({
      rubitimeBranchId: 11,
      rubitimeCooperatorId: 21,
      rubitimeServiceId: 31,
      durationMinutes: 45,
    });
    const result = await resolveScheduleParams({ type: 'online', category: 'rehab_lfk' });
    expect(result).toEqual({ branchId: 11, cooperatorId: 21, serviceId: 31, durationMinutes: 45 });
  });

  it('resolves in_person/moscow/rehab_lfk', async () => {
    resolveBookingProfile.mockResolvedValueOnce({
      rubitimeBranchId: 12,
      rubitimeCooperatorId: 22,
      rubitimeServiceId: 32,
      durationMinutes: 60,
    });
    const result = await resolveScheduleParams({ type: 'in_person', city: 'moscow', category: 'rehab_lfk' });
    expect(result).toEqual({ branchId: 12, cooperatorId: 22, serviceId: 32, durationMinutes: 60 });
    expect(resolveBookingProfile).toHaveBeenCalledWith(
      {},
      { type: 'in_person', category: 'rehab_lfk', city: 'moscow' },
    );
  });

  it('returns null when no profile found in DB', async () => {
    resolveBookingProfile.mockResolvedValueOnce(null);
    const result = await resolveScheduleParams({ type: 'online', category: 'nutrition' });
    expect(result).toBeNull();
  });

  it('returns null when DB returns null for in_person without city', async () => {
    resolveBookingProfile.mockResolvedValueOnce(null);
    const result = await resolveScheduleParams({ type: 'in_person', category: 'rehab_lfk' });
    expect(result).toBeNull();
  });

  it('propagates DB errors', async () => {
    resolveBookingProfile.mockRejectedValueOnce(new Error('DB connection failed'));
    await expect(resolveScheduleParams({ type: 'online', category: 'general' })).rejects.toThrow('DB connection failed');
  });
});
