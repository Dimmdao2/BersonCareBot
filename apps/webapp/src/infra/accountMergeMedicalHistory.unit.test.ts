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
      if (query.includes('AS target_has')) {
        // An appointment is one of the owner-defined history rows on BOTH sides — a real conflict.
        return { rows: [{ target_has: true, duplicate_has: true }] };
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
    query: vi.fn(async (query: string) => {
      if (query.includes('FROM platform_users') && query.includes('FOR UPDATE')) {
        return {
          rows: [
            platformUserRow(targetId, 'Old account with history'),
            platformUserRow(duplicateId, 'New account without history'),
          ],
        };
      }
      if (query.includes('AS target_has')) {
        return { rows: [{ target_has: true, duplicate_has: false }] };
      }
      return { rows: [] };
    }),
  } as unknown as PlatformMergeDbClient;
}

function clientWithMedicalHistoryOnDuplicateOnly(): PlatformMergeDbClient {
  return {
    query: vi.fn(async (query: string) => {
      if (query.includes('FROM platform_users') && query.includes('FOR UPDATE')) {
        return {
          rows: [
            platformUserRow(targetId, 'New account without history'),
            platformUserRow(duplicateId, 'Old account with history'),
          ],
        };
      }
      if (query.includes('AS target_has')) {
        return { rows: [{ target_has: false, duplicate_has: true }] };
      }
      return { rows: [] };
    }),
  } as unknown as PlatformMergeDbClient;
}

describe('automatic account merge medical-history gate', () => {
  it('rejects an automatic merge when BOTH sides have qualifying history — a real conflict', async () => {
    const db = clientWithMedicalHistory();

    await expect(
      mergePlatformUsersInTransaction(db, targetId, duplicateId, 'phone_bind'),
    ).rejects.toThrow('medical_history: automatic merge requires support');

    expect(db.query).toHaveBeenCalledTimes(3);
  });

  it('does not reject when only the target side has qualifying history — owner 20.08 (final): block only on conflict (both sides), single-side history is the normal returning-patient case', async () => {
    await expect(
      mergePlatformUsersInTransaction(
        clientWithMedicalHistoryOnTargetOnly(),
        targetId,
        duplicateId,
        'phone_bind',
      ),
    ).resolves.not.toThrow();
  });

  it('does not reject when only the duplicate side has qualifying history — same rule, other side', async () => {
    await expect(
      mergePlatformUsersInTransaction(
        clientWithMedicalHistoryOnDuplicateOnly(),
        targetId,
        duplicateId,
        'phone_bind',
      ),
    ).resolves.not.toThrow();
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

  it('keeps a manually selected transferred OAuth contact confirmed and OAuth-origin', async () => {
    type CanonicalContact = {
      platformUserId: string;
      kind: 'phone' | 'email';
      value: string;
      isPrimary: boolean;
      confirmedAt: string | null;
      sourceOrigin: 'direct' | 'oauth';
    };
    const contacts: CanonicalContact[] = [
      { platformUserId: targetId, kind: 'phone', value: '+79990000001', isPrimary: true, confirmedAt: null, sourceOrigin: 'direct' },
      { platformUserId: targetId, kind: 'email', value: 'target@example.test', isPrimary: true, confirmedAt: null, sourceOrigin: 'direct' },
      { platformUserId: duplicateId, kind: 'phone', value: '+79990000002', isPrimary: true, confirmedAt: '2026-08-20T00:00:00.000Z', sourceOrigin: 'oauth' },
      { platformUserId: duplicateId, kind: 'email', value: 'oauth@example.test', isPrimary: true, confirmedAt: '2026-08-20T00:00:00.000Z', sourceOrigin: 'oauth' },
    ];
    const db = {
      query: vi.fn(async (query: string, values?: unknown[]) => {
        if (query.includes('FROM platform_users') && query.includes('FOR UPDATE')) {
          return {
            rows: [
              { ...platformUserRow(targetId, 'Target'), phone_normalized: '+79990000001', email: 'target@example.test' },
              { ...platformUserRow(duplicateId, 'Duplicate'), phone_normalized: '+79990000002', email: 'oauth@example.test' },
            ],
          };
        }
        if (query.includes('UPDATE public.user_contacts') && query.includes('SET platform_user_id')) {
          for (const contact of contacts.filter((row) => row.platformUserId === duplicateId)) {
            const targetAlreadyPrimary = contacts.some(
              (row) => row.platformUserId === targetId && row.kind === contact.kind && row.isPrimary,
            );
            contact.platformUserId = targetId;
            if (targetAlreadyPrimary) contact.isPrimary = false;
          }
          return { rows: [] };
        }
        if (query.includes('DELETE FROM public.user_contacts')) {
          for (let index = contacts.length - 1; index >= 0; index--) {
            if (contacts[index]?.platformUserId === duplicateId) contacts.splice(index, 1);
          }
          return { rows: [] };
        }
        if (query.includes('WITH demoted_primary AS')) {
          const kind = values?.find((value) => value === 'phone' || value === 'email');
          const value = values?.find((item) => item === '+79990000002' || item === 'oauth@example.test');
          if ((kind !== 'phone' && kind !== 'email') || typeof value !== 'string') return { rows: [] };
          for (const contact of contacts) {
            if (contact.platformUserId === targetId && contact.kind === kind) {
              contact.isPrimary = contact.value === value;
            }
          }
          return { rows: [{ id: `promoted-${kind}` }], rowCount: 1 };
        }
        return { rows: [] };
      }),
    } as unknown as PlatformMergeDbClient;
    const resolution = manualResolution(targetId, duplicateId);
    resolution.fields.phone_normalized = 'duplicate';
    resolution.fields.email = 'duplicate';

    await mergePlatformUsersInTransaction(db, targetId, duplicateId, 'manual', { resolution });

    expect(contacts.filter((contact) => contact.platformUserId === duplicateId)).toEqual([]);
    expect(contacts.filter((contact) => contact.platformUserId === targetId && contact.isPrimary)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'phone', value: '+79990000002', confirmedAt: '2026-08-20T00:00:00.000Z', sourceOrigin: 'oauth' }),
      expect.objectContaining({ kind: 'email', value: 'oauth@example.test', confirmedAt: '2026-08-20T00:00:00.000Z', sourceOrigin: 'oauth' }),
    ]));
  });
});
