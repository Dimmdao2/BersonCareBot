import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { createSymptomTrackingDirect, DiaryLfkDirectWriteError } from './writeDiaryLfkDirect.js';
import { executeAction } from '../../../kernel/domain/executor/executeAction.js';
import type { DomainContext } from '../../../kernel/contracts/index.js';
import { runWithOrganizationPrincipal } from '../../principal/organizationPrincipal.js';

const PLATFORM_USER_ID = '22222222-2222-4222-8222-222222222222';
const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

describe('bot diary entitlement', () => {
  function directWriteDb(mutationAllowed: boolean) {
    const inserted = vi.fn();
    const db = {
      integratorDrizzle: {
        execute: vi.fn().mockResolvedValue({
          rows: [
            {
              state: mutationAllowed ? 'grace' : 'disabled',
              mutation_allowed: mutationAllowed,
            },
          ],
        }),
      },
      tx: async <T>(fn: (tx: DbPort) => Promise<T>) => fn(db as unknown as DbPort),
      query: async (text: string) => {
        if (text.includes('FROM users')) return { rows: [{ merged_into_user_id: null }] };
        if (text.includes('WHERE integrator_user_id')) {
          return { rows: [{ id: PLATFORM_USER_ID }] };
        }
        if (text.includes('FROM public.user_channel_bindings')) return { rows: [] };
        if (text.includes('FROM public.org_enrollments')) {
          return { rows: [{ organization_id: ORGANIZATION_ID }] };
        }
        if (text.includes('INSERT INTO public.symptom_trackings')) {
          inserted();
          return { rows: [{ id: '33333333-3333-4333-8333-333333333333' }] };
        }
        throw new Error(`unexpected query: ${text}`);
      },
    } as unknown as DbPort;
    return { db, inserted };
  }

  it('refuses the real direct-public write before INSERT when the database door denies mutation', async () => {
    const { db, inserted } = directWriteDb(false);

    await expect(
      runWithOrganizationPrincipal(ORGANIZATION_ID, () =>
        createSymptomTrackingDirect(db, {
          integratorUserId: '42',
          channelCode: 'telegram',
          externalId: '100',
          symptomTitle: 'Боль',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'patient_diaries_entitlement_required',
    } satisfies Partial<DiaryLfkDirectWriteError>);
    expect(inserted).not.toHaveBeenCalled();
  });

  it('allows the real direct-public write while the database door allows mutation', async () => {
    const { db, inserted } = directWriteDb(true);

    await expect(
      runWithOrganizationPrincipal(ORGANIZATION_ID, () =>
        createSymptomTrackingDirect(db, {
          integratorUserId: '42',
          channelCode: 'telegram',
          externalId: '100',
          symptomTitle: 'Боль',
        }),
      ),
    ).resolves.toMatchObject({
      organizationId: ORGANIZATION_ID,
      trackingId: '33333333-3333-4333-8333-333333333333',
    });
    expect(inserted).toHaveBeenCalledOnce();
  });

  it('edits the bot message with the refusal instead of reporting a false success', async () => {
    const refusal =
      'Невозможно добавить, изменить или удалить запись дневника: этот раздел не входит в ваш тариф.';
    const ctx = {
      event: {
        type: 'callback.received',
        meta: {
          eventId: 'event',
          occurredAt: '2026-07-30T00:00:00.000Z',
          source: 'telegram',
        },
        payload: { incoming: { channelUserId: 100, chatId: 100, messageId: 10 } },
      },
      nowIso: '2026-07-30T00:00:00.000Z',
      values: {},
      base: { actor: { isAdmin: false }, identityLinks: [] },
    } satisfies DomainContext;

    const result = await executeAction(
      {
        id: 'diary-entry',
        type: 'diary.symptom.entryType',
        mode: 'sync',
        params: {
          trackingId: '33333333-3333-4333-8333-333333333333',
          entryType: 'daily',
          value: 4,
          chatId: 100,
          messageId: 10,
          userId: '42',
        },
      },
      ctx,
      {
        writePort: {
          writeDb: vi.fn().mockResolvedValue({ entitlementRefusalMessage: refusal }),
        },
      },
    );

    expect(result.intents).toContainEqual(
      expect.objectContaining({
        type: 'message.edit',
        payload: expect.objectContaining({ message: { text: refusal } }),
      }),
    );
    expect(
      result.intents?.some(
        (intent) =>
          (intent.payload.message as { text?: string } | undefined)?.text === 'Запись добавлена.',
      ),
    ).toBe(false);
  });
});
