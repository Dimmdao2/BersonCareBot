import { describe, expect, it, vi } from 'vitest';
import {
  mergePlatformUsersInTransaction,
  type PlatformMergeDbClient,
} from '../../../../packages/platform-merge/src/pgPlatformUserMerge';
import type { ManualMergeResolution } from '../../../../packages/platform-merge/src/manualMergeResolution';

const targetId = '00000000-0000-4000-8000-000000000001';
const duplicateId = '00000000-0000-4000-8000-000000000002';

function clientWithMedicalHistory(): PlatformMergeDbClient & { query: ReturnType<typeof vi.fn> } {
  return {
    query: vi.fn(async (query: string) => {
      if (query.includes('FOR UPDATE')) {
        return {
          rows: [
            {
              id: targetId,
              phone_normalized: '+79990000001',
              patient_phone_trust_at: null,
              integrator_user_id: null,
              merged_into_id: null,
              display_name: 'New account',
              first_name: null,
              last_name: null,
              patronymic: null,
              email: null,
              email_verified_at: null,
              role: 'client',
              created_at: new Date('2026-01-01T00:00:00Z'),
            },
            {
              id: duplicateId,
              phone_normalized: null,
              patient_phone_trust_at: null,
              integrator_user_id: null,
              merged_into_id: null,
              display_name: 'Old account',
              first_name: null,
              last_name: null,
              patronymic: null,
              email: null,
              email_verified_at: null,
              role: 'client',
              created_at: new Date('2025-01-01T00:00:00Z'),
            },
          ],
        };
      }
      if (query.includes('AS has_medical_history')) {
        // An appointment is one of the owner-defined history rows; the port reports it as present.
        return { rows: [{ has_medical_history: true }] };
      }
      return { rows: [] };
    }),
  } as PlatformMergeDbClient & { query: ReturnType<typeof vi.fn> };
}

function platformUserRow(id: string, displayName: string) {
  return {
    id,
    phone_normalized: null,
    patient_phone_trust_at: null,
    integrator_user_id: null,
    merged_into_id: null,
    display_name: displayName,
    first_name: null,
    last_name: null,
    patronymic: null,
    email: null,
    email_verified_at: null,
    role: 'client',
    created_at: new Date('2026-01-01T00:00:00Z'),
  };
}

function manualResolution(target: string, duplicate: string): ManualMergeResolution {
  return {
    targetId: target,
    duplicateId: duplicate,
    fields: {
      phone_normalized: 'target',
      display_name: 'target',
      first_name: 'target',
      last_name: 'target',
      email: 'target',
    },
    bindings: { telegram: 'both', max: 'both', vk: 'both' },
    oauth: {},
    channelPreferences: 'merge',
  };
}

function clientWithMedicalHistoryOnTargetOnly(): PlatformMergeDbClient {
  return {
    query: vi.fn(async (query: string, values?: unknown[]) => {
      if (query.includes('FROM platform_users') && query.includes('FOR UPDATE')) {
        return {
          rows: [
            platformUserRow(targetId, 'Old account with history'),
            platformUserRow(duplicateId, 'New account without history'),
          ],
        };
      }
      if (query.includes('AS has_medical_history')) {
        return { rows: [{ has_medical_history: (values ?? []).includes(targetId) }] };
      }
      return { rows: [] };
    }),
  } as unknown as PlatformMergeDbClient;
}

describe('automatic account merge medical-history gate', () => {
  it('rejects an automatic merge when the old account has an appointment/history', async () => {
    const db = clientWithMedicalHistory();

    await expect(
      mergePlatformUsersInTransaction(db, targetId, duplicateId, 'phone_bind'),
    ).rejects.toThrow('medical_history: automatic merge requires support');

    expect(db.query).toHaveBeenCalledTimes(3);
  });

  it('rejects when target selection puts the old account with history on the target side', async () => {
    await expect(
      mergePlatformUsersInTransaction(
        clientWithMedicalHistoryOnTargetOnly(),
        targetId,
        duplicateId,
        'phone_bind',
      ),
    ).rejects.toThrow('medical_history: automatic merge requires support');
  });
});

describe('support account merge', () => {
  it('moves a clinical visit when support merges the newer account back into the old account', async () => {
    const oldAccountId = duplicateId;
    const newAccountId = targetId;
    let clinicalVisitOwner = newAccountId;
    const db = {
      query: vi.fn(async (query: string, values?: unknown[]) => {
        if (query.includes('FROM platform_users') && query.includes('FOR UPDATE')) {
          return {
            rows: [
              platformUserRow(oldAccountId, 'Old account'),
              platformUserRow(newAccountId, 'New account'),
            ],
          };
        }
        if (query.includes('UPDATE clinical_visit SET patient_user_id')) {
          const [nextOwner, previousOwner] = values ?? [];
          if (clinicalVisitOwner === previousOwner) clinicalVisitOwner = String(nextOwner);
        }
        return { rows: [] };
      }),
    } as unknown as PlatformMergeDbClient;

    await mergePlatformUsersInTransaction(db, oldAccountId, newAccountId, 'manual', {
      resolution: manualResolution(oldAccountId, newAccountId),
    });

    expect(clinicalVisitOwner).toBe(oldAccountId);
  });
});
