import { describe, expect, it } from 'vitest';
import { resolveDoctorWorkspaceComposition } from './composition';

describe('resolveDoctorWorkspaceComposition', () => {
  it('follows the tariff mode, not the seat count', () => {
    expect([
      // A clinic tariff that currently has one seat and one member is still a clinic: its admin
      // starts alone and invites the rest later (owner ruling 2026-09-10).
      resolveDoctorWorkspaceComposition({
        clinicTeamEntitled: true,
        seats: { configured: true, limit: 1, used: 1, available: 0 },
      }),
      // Spare seats without the clinic mode do not open management.
      resolveDoctorWorkspaceComposition({
        clinicTeamEntitled: false,
        seats: { configured: true, limit: 3, used: 1, available: 2 },
      }),
      // Retained members after a downgrade keep management reachable so they can be removed.
      resolveDoctorWorkspaceComposition({
        clinicTeamEntitled: false,
        seats: { configured: true, limit: 1, used: 2, available: 0 },
      }),
      resolveDoctorWorkspaceComposition({
        clinicTeamEntitled: false,
        seats: { configured: true, limit: 1, used: 1, available: 0 },
      }),
      resolveDoctorWorkspaceComposition({
        clinicTeamEntitled: false,
        seats: { configured: false, limit: null, used: 1, available: null },
      }),
    ]).toEqual(['clinic', 'solo', 'clinic', 'solo', 'solo']);
  });
});
