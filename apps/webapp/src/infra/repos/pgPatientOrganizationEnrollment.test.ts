import { describe, expect, it, vi } from 'vitest';
import {
  ensureInvitedOrganizationClientRelationship,
  OrganizationClientRelationshipDeniedError,
} from './pgPatientOrganizationEnrollment';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const PATIENT_ID = '22222222-2222-4222-8222-222222222222';

function txWithRelationshipReads(rows: unknown[][]) {
  const insert = vi.fn(() => ({
    values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) })),
  }));
  return {
    tx: {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({ limit: vi.fn(async () => rows.shift() ?? []) }),
        }),
      })),
      insert,
    },
    insert,
  };
}

describe('ensureInvitedOrganizationClientRelationship', () => {
  it('keeps an invited card invited and never silently activates it', async () => {
    const { tx, insert } = txWithRelationshipReads([[{ status: 'invited' }]]);
    await expect(
      ensureInvitedOrganizationClientRelationship(tx as never, ORG_ID, PATIENT_ID),
    ).resolves.toBe('invited');
    expect(insert).not.toHaveBeenCalled();
    expect(tx).not.toHaveProperty('update');
  });

  it('preserves an already active relationship', async () => {
    const { tx, insert } = txWithRelationshipReads([[{ status: 'active' }]]);
    await expect(
      ensureInvitedOrganizationClientRelationship(tx as never, ORG_ID, PATIENT_ID),
    ).resolves.toBe('active');
    expect(insert).not.toHaveBeenCalled();
  });

  it('denies discharged or archived relationships instead of reviving them', async () => {
    for (const status of ['discharged', 'archived'] as const) {
      const { tx, insert } = txWithRelationshipReads([[{ status }]]);
      await expect(
        ensureInvitedOrganizationClientRelationship(tx as never, ORG_ID, PATIENT_ID),
      ).rejects.toBeInstanceOf(OrganizationClientRelationshipDeniedError);
      expect(insert).not.toHaveBeenCalled();
    }
  });

  it('converges on an invited row inserted by a concurrent request', async () => {
    const { tx, insert } = txWithRelationshipReads([[], [{ status: 'invited' }]]);
    await expect(
      ensureInvitedOrganizationClientRelationship(tx as never, ORG_ID, PATIENT_ID),
    ).resolves.toBe('invited');
    expect(insert).toHaveBeenCalledOnce();
  });
});
