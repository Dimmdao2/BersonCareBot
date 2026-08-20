import { describe, expect, it, vi } from 'vitest';
import {
  mergePlatformUsersInTransaction,
  type PlatformMergeDbClient,
} from '../../../../packages/platform-merge/src/pgPlatformUserMerge';

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

describe('automatic account merge medical-history gate', () => {
  it('rejects an automatic merge when the old account has an appointment/history', async () => {
    const db = clientWithMedicalHistory();

    await expect(
      mergePlatformUsersInTransaction(db, targetId, duplicateId, 'phone_bind'),
    ).rejects.toThrow('medical_history: automatic merge requires support');

    expect(db.query).toHaveBeenCalledTimes(3);
  });
});
