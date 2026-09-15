import { describe, expect, it, vi } from 'vitest';
import {
  mergePlatformUsersInTransaction,
  type AutomaticMergePlatformUsersOptions,
  type PlatformMergeDbClient,
} from '../../../../packages/platform-merge/src/pgPlatformUserMerge';
import {
  createHumanMergeDecision,
  createHumanMergePrompt,
  type HumanMergeCustomFioValue,
  type HumanMergeDecision,
  type HumanMergePrompt,
} from '../../../../packages/platform-merge/src/humanMergeDecision';
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

type TestPlatformUserRow = {
  id: string;
  phone_normalized: string | null;
  patient_phone_trust_at: Date | null;
  merged_into_id: string | null;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  patronymic: string | null;
  email: string | null;
  email_verified_at: Date | null;
  role: string;
  created_at: Date;
};

function platformUserRow(id: string, displayName: string): TestPlatformUserRow {
  return {
    id,
    phone_normalized: null,
    patient_phone_trust_at: null,
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

function promptForRows(
  target: TestPlatformUserRow,
  duplicate: TestPlatformUserRow,
): HumanMergePrompt {
  return createHumanMergePrompt(
    {
      id: target.id,
      displayName: target.display_name,
      firstName: target.first_name,
      lastName: target.last_name,
      patronymic: target.patronymic,
      createdAt: target.created_at,
    },
    {
      id: duplicate.id,
      displayName: duplicate.display_name,
      firstName: duplicate.first_name,
      lastName: duplicate.last_name,
      patronymic: duplicate.patronymic,
      createdAt: duplicate.created_at,
    },
    duplicate.id,
  );
}

function clientForHumanDecision(target: TestPlatformUserRow, duplicate: TestPlatformUserRow) {
  /** Параметры канонического UPDATE идут в порядке появления `$n` в тексте: ФИО, имя, фамилия, отчество. */
  let writtenFio: unknown[] | undefined;
  const client = {
    query: vi.fn(async (query: string, values?: unknown[]) => {
      if (query.includes('FROM platform_users pu') && query.includes('FOR UPDATE OF pu')) {
        return { rows: [target, duplicate] };
      }
      if (query.includes('AS target_has')) {
        return { rows: [{ target_has: false, duplicate_has: false }] };
      }
      if (
        writtenFio === undefined &&
        query.includes('UPDATE platform_users') &&
        query.includes('display_name') &&
        query.includes('first_name') &&
        query.includes('patronymic')
      ) {
        writtenFio = values ?? [];
      }
      return { rows: [] };
    }),
  } as PlatformMergeDbClient & { query: ReturnType<typeof vi.fn> };
  return {
    client,
    writtenDisplayName: () => writtenFio?.[0],
    writtenFio: () => ({
      displayName: writtenFio?.[0],
      firstName: writtenFio?.[1],
      lastName: writtenFio?.[2],
      patronymic: writtenFio?.[3],
    }),
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
  const humanDecision = (targetDisplayName: string, duplicateDisplayName: string) => {
    const prompt = createHumanMergePrompt(
      {
        id: targetId,
        displayName: targetDisplayName,
        firstName: null,
        lastName: null,
        patronymic: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: duplicateId,
        displayName: duplicateDisplayName,
        firstName: null,
        lastName: null,
        patronymic: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      duplicateId,
    );
    return createHumanMergeDecision(
      prompt,
      prompt.conflicts.includes('display_name') ? { display_name: { source: 'target' } } : {},
    );
  };

  it('rejects an automatic merge when BOTH sides have qualifying history — a real conflict', async () => {
    const db = clientWithMedicalHistory();

    await expect(
      mergePlatformUsersInTransaction(db, targetId, duplicateId, 'phone_bind', {
        humanDecision: humanDecision('New account', 'Old account'),
      }),
    ).rejects.toThrow('medical_history: automatic merge requires support');
  });

  it('does not reject when only the target side has qualifying history — owner 20.08 (final): block only on conflict (both sides), single-side history is the normal returning-patient case', async () => {
    await expect(
      mergePlatformUsersInTransaction(
        clientWithMedicalHistoryOnTargetOnly(),
        targetId,
        duplicateId,
        'phone_bind',
        { humanDecision: humanDecision('Old account with history', 'New account without history') },
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
        { humanDecision: humanDecision('New account without history', 'Old account with history') },
      ),
    ).resolves.not.toThrow();
  });
});

describe('automatic account merge human-decision safety gate', () => {
  const plainRows = () => {
    const target = platformUserRow(targetId, 'Иванов Иван Петрович');
    const duplicate = platformUserRow(duplicateId, 'Сидорова Анна Сергеевна');
    duplicate.created_at = new Date('2025-01-01T00:00:00Z');
    return { target, duplicate };
  };

  it('refuses an automatic merge without a human confirmation', async () => {
    const { target, duplicate } = plainRows();
    const { client } = clientForHumanDecision(target, duplicate);

    await expect(
      mergePlatformUsersInTransaction(
        client,
        targetId,
        duplicateId,
        'phone_bind',
        {} as unknown as AutomaticMergePlatformUsersOptions,
      ),
    ).rejects.toThrow('automatic merge requires a human decision');
  });

  it('refuses a confirmation when the locked account snapshot changed after it was shown', async () => {
    const { target, duplicate } = plainRows();
    const shownPrompt = promptForRows(target, duplicate);
    const decision = createHumanMergeDecision(shownPrompt, {
      display_name: { source: 'target' },
    });
    const changedTarget = { ...target, display_name: 'Петров Пётр Петрович' };
    const { client } = clientForHumanDecision(changedTarget, duplicate);

    await expect(
      mergePlatformUsersInTransaction(client, targetId, duplicateId, 'phone_bind', {
        humanDecision: decision,
      }),
    ).rejects.toThrow('shown account details changed before confirmation');
  });

  it('refuses a structured FIO conflict until the person chooses the value', async () => {
    const target = {
      ...platformUserRow(targetId, 'Иванов Иван'),
      last_name: 'Иванов',
      first_name: 'Иван',
    };
    const duplicate = {
      ...platformUserRow(duplicateId, 'Сидорова Анна'),
      last_name: 'Сидорова',
      first_name: 'Анна',
    };
    const prompt = promptForRows(target, duplicate);
    const { client } = clientForHumanDecision(target, duplicate);

    await expect(
      mergePlatformUsersInTransaction(client, targetId, duplicateId, 'phone_bind', {
        humanDecision: createHumanMergeDecision(prompt, {}),
      }),
    ).rejects.toThrow('human choice required for last_name');
  });

  it('treats different legacy display-only FIO as a human conflict and writes the chosen variant', async () => {
    const { target, duplicate } = plainRows();
    const prompt = promptForRows(target, duplicate);
    const missingChoice = clientForHumanDecision(target, duplicate);

    await expect(
      mergePlatformUsersInTransaction(missingChoice.client, targetId, duplicateId, 'phone_bind', {
        humanDecision: createHumanMergeDecision(prompt, {}),
      }),
    ).rejects.toThrow('human choice required for display_name');

    const { client, writtenDisplayName } = clientForHumanDecision(target, duplicate);

    await mergePlatformUsersInTransaction(client, targetId, duplicateId, 'phone_bind', {
      humanDecision: createHumanMergeDecision(prompt, {
        display_name: { source: 'duplicate' },
      }),
    });

    expect(writtenDisplayName()).toBe('Сидорова Анна Сергеевна');
  });

  /**
   * Поломка: человек выбирает legacy-подпись «Ваня», а движок молча стирает НЕконфликтующие
   * фамилию «Иванов» и имя «Иван» второй стороны — врач читает ФИО из зеркала `user_identity`
   * и видит в карточке прозвище вместо имени пациента. Дорого и беззвучно: никто не заметит.
   * Оракул — `AUTH_AND_IDENTITY_CANON.md` §18а: расхождение разбирает человек, а не движок.
   */
  const legacyVersusStructuredRows = () => {
    const target = {
      ...platformUserRow(targetId, 'Иванов Иван'),
      last_name: 'Иванов',
      first_name: 'Иван',
    };
    const duplicate = platformUserRow(duplicateId, 'Ваня');
    duplicate.created_at = new Date('2025-01-01T00:00:00Z');
    return { target, duplicate };
  };

  it('asks about every FIO part the display-name choice can overwrite, instead of wiping it', async () => {
    const { target, duplicate } = legacyVersusStructuredRows();
    const prompt = promptForRows(target, duplicate);

    expect(prompt.conflicts).toEqual(['display_name', 'last_name', 'first_name']);

    const { client } = clientForHumanDecision(target, duplicate);
    await expect(
      mergePlatformUsersInTransaction(client, targetId, duplicateId, 'phone_bind', {
        humanDecision: createHumanMergeDecision(prompt, { display_name: { source: 'duplicate' } }),
      }),
    ).rejects.toThrow('human choice required for last_name');
  });

  it('keeps the FIO parts the person kept while writing the display name the person chose', async () => {
    const { target, duplicate } = legacyVersusStructuredRows();
    const prompt = promptForRows(target, duplicate);
    const { client, writtenFio } = clientForHumanDecision(target, duplicate);

    await mergePlatformUsersInTransaction(client, targetId, duplicateId, 'phone_bind', {
      humanDecision: createHumanMergeDecision(prompt, {
        display_name: { source: 'duplicate' },
        last_name: { source: 'target' },
        first_name: { source: 'target' },
      }),
    });

    expect(writtenFio()).toEqual({
      displayName: 'Ваня',
      lastName: 'Иванов',
      firstName: 'Иван',
      patronymic: null,
    });
  });

  it('drops the FIO parts only when the person answered "not specified" for them', async () => {
    const { target, duplicate } = legacyVersusStructuredRows();
    const prompt = promptForRows(target, duplicate);
    const { client, writtenFio } = clientForHumanDecision(target, duplicate);

    await mergePlatformUsersInTransaction(client, targetId, duplicateId, 'phone_bind', {
      humanDecision: createHumanMergeDecision(prompt, {
        display_name: { source: 'duplicate' },
        last_name: { source: 'duplicate' },
        first_name: { source: 'duplicate' },
      }),
    });

    expect(writtenFio()).toEqual({
      displayName: 'Ваня',
      lastName: null,
      firstName: null,
      patronymic: null,
    });
  });

  /**
   * Поломка: у найденной учётки `display_name` пустой, вопроса человеку нет вовсе, и слияние
   * записывает пустую строку поверх «Иванов Иван Петрович» — имя человека исчезает с платформы,
   * а он в диалоге видел «ФИО не указано» и нажал «Да, это мой аккаунт». §18а: пустая сторона
   * дополняется, а не затирает.
   */
  it('lets the empty display name of the recognized account be filled in, not overwrite the real one', async () => {
    const target = platformUserRow(targetId, 'Иванов Иван Петрович');
    const duplicate = platformUserRow(duplicateId, '');
    duplicate.created_at = new Date('2025-01-01T00:00:00Z');
    const prompt = promptForRows(target, duplicate);

    expect(prompt.conflicts).toEqual([]);

    const { client, writtenDisplayName } = clientForHumanDecision(target, duplicate);
    await mergePlatformUsersInTransaction(client, targetId, duplicateId, 'phone_bind', {
      humanDecision: createHumanMergeDecision(prompt, {}),
    });

    expect(writtenDisplayName()).toBe('Иванов Иван Петрович');
  });

  it('rejects a Latin custom FIO even when a caller bypasses the request schema', async () => {
    const { target, duplicate } = plainRows();
    const prompt = promptForRows(target, duplicate);
    const forgedDecision: HumanMergeDecision = {
      accountConfirmed: true,
      prompt,
      fio: {
        display_name: {
          source: 'custom',
          value: 'Smith John' as unknown as HumanMergeCustomFioValue,
        },
      },
    };
    const { client } = clientForHumanDecision(target, duplicate);

    await expect(
      mergePlatformUsersInTransaction(client, targetId, duplicateId, 'phone_bind', {
        humanDecision: forgedDecision,
      }),
    ).rejects.toThrow('invalid custom human choice for display_name');
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
      {
        platformUserId: targetId,
        kind: 'phone',
        value: '+79990000001',
        isPrimary: true,
        confirmedAt: null,
        sourceOrigin: 'direct',
      },
      {
        platformUserId: targetId,
        kind: 'email',
        value: 'target@example.test',
        isPrimary: true,
        confirmedAt: null,
        sourceOrigin: 'direct',
      },
      {
        platformUserId: duplicateId,
        kind: 'phone',
        value: '+79990000002',
        isPrimary: true,
        confirmedAt: '2026-08-20T00:00:00.000Z',
        sourceOrigin: 'oauth',
      },
      {
        platformUserId: duplicateId,
        kind: 'email',
        value: 'oauth@example.test',
        isPrimary: true,
        confirmedAt: '2026-08-20T00:00:00.000Z',
        sourceOrigin: 'oauth',
      },
    ];
    const db = {
      query: vi.fn(async (query: string, values?: unknown[]) => {
        if (query.includes('FROM platform_users') && query.includes('FOR UPDATE')) {
          return {
            rows: [
              {
                ...platformUserRow(targetId, 'Target'),
                phone_normalized: '+79990000001',
                email: 'target@example.test',
              },
              {
                ...platformUserRow(duplicateId, 'Duplicate'),
                phone_normalized: '+79990000002',
                email: 'oauth@example.test',
              },
            ],
          };
        }
        if (
          query.includes('UPDATE public.user_contacts') &&
          query.includes('SET platform_user_id')
        ) {
          for (const contact of contacts.filter((row) => row.platformUserId === duplicateId)) {
            const targetAlreadyPrimary = contacts.some(
              (row) =>
                row.platformUserId === targetId && row.kind === contact.kind && row.isPrimary,
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
          const value = values?.find(
            (item) => item === '+79990000002' || item === 'oauth@example.test',
          );
          if ((kind !== 'phone' && kind !== 'email') || typeof value !== 'string')
            return { rows: [] };
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
    expect(
      contacts.filter((contact) => contact.platformUserId === targetId && contact.isPrimary),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'phone',
          value: '+79990000002',
          confirmedAt: '2026-08-20T00:00:00.000Z',
          sourceOrigin: 'oauth',
        }),
        expect.objectContaining({
          kind: 'email',
          value: 'oauth@example.test',
          confirmedAt: '2026-08-20T00:00:00.000Z',
          sourceOrigin: 'oauth',
        }),
      ]),
    );
  });
});
