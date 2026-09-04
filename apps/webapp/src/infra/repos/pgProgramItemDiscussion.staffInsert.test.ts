/**
 * Unit-тесты staff-ветки `pgProgramItemDiscussionPort.insertMessage`
 * (ответ врача/админа в тред упражнения; пациентская ветка идёт через seam-root).
 *
 * Зачем именно эти проверки: у роли `app_staff` есть INSERT на все колонки
 * `program_item_discussion_messages`, КРОМЕ `id` — её заполняет только seam-owner
 * пациентского корня. Пока вставка шла через Drizzle `.values()`, генератор
 * перечислял `id` со значением `default`, и Postgres отбивал запись
 * `permission denied for table program_item_discussion_messages` (42501):
 * отправка комментария из «карточка пациента → ЛФК → комментарии» падала 500.
 * Тесты фиксируют контракт вставки, а не разметку: список колонок без `id`,
 * маппинг вернувшейся строки и сохранённый idempotency-fallback на 23505.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentDbPrincipalMock = vi.hoisted(() => vi.fn());
const getCurrentDbPrincipalOrganizationIdMock = vi.hoisted(() => vi.fn());
const runWebappSqlMock = vi.hoisted(() => vi.fn());
const runWebappNamedRootMock = vi.hoisted(() => vi.fn());
const runDrizzleMutationTransactionMock = vi.hoisted(() => vi.fn());
const getDrizzleMock = vi.hoisted(() => vi.fn());

vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipal: getCurrentDbPrincipalMock,
  getCurrentDbPrincipalOrganizationId: getCurrentDbPrincipalOrganizationIdMock,
}));
vi.mock('@/app-layer/db/drizzle', () => ({ getDrizzle: getDrizzleMock }));
vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: vi.fn(() => ({})),
  runWebappNamedRoot: runWebappNamedRootMock,
  runWebappSql: runWebappSqlMock,
}));
vi.mock('@/infra/db/drizzleMutationTx', () => ({
  runDrizzleMutationTransaction: runDrizzleMutationTransactionMock,
}));
vi.mock('@/infra/repos/../../../db/schema/programItemDiscussion', () => ({
  programItemDiscussionMessages: { instanceStageItemId: 'col', id: 'col', supportMessageId: 'col' },
  programItemDiscussionReads: {
    instanceStageItemId: 'col',
    patientUserId: 'col',
    lastReadAt: 'col',
  },
}));
vi.mock('@/infra/repos/../../../db/schema/schema', () => ({
  supportConversationMessages: {},
  supportConversations: {},
}));
vi.mock('@/infra/repos/../../../db/schema/treatmentProgramInstances', () => ({
  treatmentProgramInstanceStageItems: { id: 'col' },
  treatmentProgramInstanceStages: { id: 'col', instanceId: 'col' },
  treatmentProgramInstances: { id: 'col' },
}));
vi.mock('@/modules/messaging/programNoteReplyContext', () => ({
  extractPatientExerciseCommentReplyBody: vi.fn(),
}));

import { createPgProgramItemDiscussionPort } from './pgProgramItemDiscussion';

/** Литеральный текст drizzle-фрагмента: только строковые чанки, без значений параметров. */
function sqlLiteralText(fragment: unknown): string {
  const chunks = (fragment as { queryChunks?: unknown[] }).queryChunks ?? [];
  return chunks
    .map((chunk) => {
      const value = chunk == null ? null : (chunk as { value?: unknown }).value;
      return Array.isArray(value) ? value.join('') : ' ';
    })
    .join('');
}

const STAGE_ITEM_ID = 'a62d836f-b69c-4ffb-b97d-8489d8b5b8a7';
const PATIENT_USER_ID = '1c312a64-fab8-4b75-b24e-88a1d6ebe4e0';
const ORG_ID = 'a0000000-0000-4000-8000-000000000001';

const INPUT = {
  instanceStageItemId: STAGE_ITEM_ID,
  patientUserId: PATIENT_USER_ID,
  senderRole: 'admin' as const,
  origin: 'support_admin_reply' as const,
  body: 'Ответ врача',
  mediaFileId: null,
  supportMessageId: '04745858-6446-495a-b1a9-02bedfbe319d',
};

function insertedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '10e251e6-e0a7-4f98-a97c-ca8f245cb3c2',
    organization_id: ORG_ID,
    instance_stage_item_id: STAGE_ITEM_ID,
    patient_user_id: PATIENT_USER_ID,
    sender_role: 'admin',
    origin: 'support_admin_reply',
    body: 'Ответ врача',
    media_file_id: null,
    support_message_id: INPUT.supportMessageId,
    created_at: '2026-09-04T14:10:15.510Z',
    ...overrides,
  };
}

/** Транзакция: только то, что читает staff-ветка — findFirst по stage item. */
function fakeTx(stageItemOrganizationId: string | null = ORG_ID) {
  return {
    query: {
      treatmentProgramInstanceStageItems: {
        findFirst: vi.fn(async () => ({ organizationId: stageItemOrganizationId })),
      },
    },
  };
}

describe('pgProgramItemDiscussionPort.insertMessage — staff-ветка', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentDbPrincipalMock.mockReturnValue({ kind: 'staff' });
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORG_ID);
    runDrizzleMutationTransactionMock.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeTx()),
    );
  });

  it('вставляет явный список колонок БЕЗ `id` — у app_staff нет INSERT на эту колонку', async () => {
    runWebappSqlMock.mockResolvedValue({ rows: [insertedRow()] });

    await createPgProgramItemDiscussionPort().insertMessage(INPUT);

    expect(runWebappSqlMock).toHaveBeenCalledTimes(1);
    const text = sqlLiteralText(runWebappSqlMock.mock.calls[0]![1]);
    const columnList = /INSERT INTO program_item_discussion_messages\s*\(([^)]*)\)/i.exec(text)?.[1];
    expect(columnList).toBeDefined();
    const columns = columnList!
      .split(',')
      .map((column) => column.trim())
      .filter(Boolean);
    expect(columns).toEqual([
      'organization_id',
      'instance_stage_item_id',
      'patient_user_id',
      'sender_role',
      'origin',
      'body',
      'media_file_id',
      'support_message_id',
      'created_at',
    ]);
    expect(columns).not.toContain('id');
    // `default` в VALUES — ровно та форма, которую генерировал Drizzle и которую отбивал Postgres.
    expect(text.toLowerCase()).not.toContain('default');
  });

  it('маппит вернувшуюся строку в доменное сообщение', async () => {
    runWebappSqlMock.mockResolvedValue({ rows: [insertedRow()] });

    const message = await createPgProgramItemDiscussionPort().insertMessage(INPUT);

    expect(message).toEqual({
      id: '10e251e6-e0a7-4f98-a97c-ca8f245cb3c2',
      instanceStageItemId: STAGE_ITEM_ID,
      patientUserId: PATIENT_USER_ID,
      senderRole: 'admin',
      origin: 'support_admin_reply',
      body: 'Ответ врача',
      mediaFileId: null,
      supportMessageId: INPUT.supportMessageId,
      createdAt: '2026-09-04T14:10:15.510Z',
    });
  });

  it('пустой RETURNING не выдаёт «успех» — бросает program_item_discussion_insert_failed', async () => {
    runWebappSqlMock.mockResolvedValue({ rows: [] });

    await expect(createPgProgramItemDiscussionPort().insertMessage(INPUT)).rejects.toThrow(
      'program_item_discussion_insert_failed',
    );
  });

  it('на 23505 с supportMessageId возвращает уже записанное сообщение (idempotency)', async () => {
    const conflict = Object.assign(new Error('duplicate key'), { code: '23505' });
    runWebappSqlMock.mockRejectedValue(conflict);
    const existing = {
      id: '69809283-d06d-4129-82a2-abf4e561b66c',
      instanceStageItemId: STAGE_ITEM_ID,
      patientUserId: PATIENT_USER_ID,
      senderRole: 'admin',
      origin: 'support_admin_reply',
      body: 'Ответ врача',
      mediaFileId: null,
      supportMessageId: INPUT.supportMessageId,
      createdAt: '2026-09-04T14:06:06.232Z',
    };
    getDrizzleMock.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [existing] }),
        }),
      }),
    });

    const message = await createPgProgramItemDiscussionPort().insertMessage(INPUT);

    expect(message).toEqual({
      id: existing.id,
      instanceStageItemId: existing.instanceStageItemId,
      patientUserId: existing.patientUserId,
      senderRole: existing.senderRole,
      origin: existing.origin,
      body: existing.body,
      mediaFileId: existing.mediaFileId,
      supportMessageId: existing.supportMessageId,
      createdAt: existing.createdAt,
    });
  });

  it('пациентский принципал в staff-вставку не заходит — идёт через seam-root', async () => {
    getCurrentDbPrincipalMock.mockReturnValue({ kind: 'patient' });
    runWebappNamedRootMock.mockResolvedValue({
      rows: [
        {
          message: {
            id: 'patient-msg-1',
            instance_stage_item_id: STAGE_ITEM_ID,
            patient_user_id: PATIENT_USER_ID,
            sender_role: 'patient',
            origin: 'patient_observation',
            body: 'Комментарий пациента',
            media_file_id: null,
            support_message_id: null,
            created_at: '2026-09-04T14:00:00.000Z',
          },
        },
      ],
    });

    const message = await createPgProgramItemDiscussionPort().insertMessage({
      ...INPUT,
      senderRole: 'patient',
      origin: 'patient_observation',
      supportMessageId: null,
    });

    expect(runWebappSqlMock).not.toHaveBeenCalled();
    expect(runDrizzleMutationTransactionMock).not.toHaveBeenCalled();
    expect(message.id).toBe('patient-msg-1');
  });
});
