import { describe, expect, it } from 'vitest';
import { resolveDoctorWorkspaceComposition } from './composition';

describe('resolveDoctorWorkspaceComposition', () => {
  it('uses the configured specialist capacity and preserves retained team access', () => {
    const configuredSoloSeat = { configured: true, limit: 1, used: 1, available: 0 } as const;

    expect([
      resolveDoctorWorkspaceComposition({
        clinicTeamEntitled: true,
        seats: configuredSoloSeat,
      }),
      resolveDoctorWorkspaceComposition({
        clinicTeamEntitled: false,
        seats: { configured: true, limit: 3, used: 1, available: 2 },
      }),
      resolveDoctorWorkspaceComposition({
        clinicTeamEntitled: false,
        seats: { configured: true, limit: 1, used: 2, available: 0 },
      }),
      resolveDoctorWorkspaceComposition({
        clinicTeamEntitled: false,
        seats: configuredSoloSeat,
      }),
      resolveDoctorWorkspaceComposition({
        clinicTeamEntitled: false,
        seats: { configured: false, limit: null, used: 2, available: null },
      }),
      resolveDoctorWorkspaceComposition({
        clinicTeamEntitled: false,
        seats: { configured: false, limit: null, used: 1, available: null },
      }),
    ]).toEqual(['solo', 'clinic', 'clinic', 'solo', 'clinic', 'solo']);
  });
});
