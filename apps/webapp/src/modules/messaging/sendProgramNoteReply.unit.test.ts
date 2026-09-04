import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/infra/logging/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  serializeError: (error: unknown) => error,
}));

import { logger } from '@/infra/logging/logger';
import { createSendProgramNoteReply } from '@/modules/messaging/sendProgramNoteReply';
import type { ProgramNoteReplyContext } from '@/modules/messaging/programNoteReplyContext';
import { webappPlatformConversationId } from '@/modules/messaging/supportConversationIds';

const CONVERSATION_ID = webappPlatformConversationId('patient-1');

/**
 * Инцидент 2026-09-04 (кандидат `wt/lfk-comments-layout`): ответ врача из модалки упражнения
 * висел минутами, потому что подтверждение отправки ждало внешнюю доставку пациенту, а
 * relay-outbound на недоступном integrator ретраил 0s → 10s → 60s → 5min. Живой замер на DEV
 * подтвердил разрыв: HTTP 200 через 2.2 s, а `[relay] все 4 попытки провалились` — через 370 s.
 *
 * Отсюда контракт этого файла: врач получает подтверждение ТОЛЬКО после долговечных записей в БД,
 * а внешнее уведомление живёт отдельно — не задерживает ответ, не роняет его и не теряется молча.
 */

const CTX: ProgramNoteReplyContext = {
  organizationId: 'org-1',
  platformUserId: 'patient-1',
  stageItemId: 'item-1',
  exerciseTitle: 'Подъемы на носок одной ноги',
  integratorConversationId: CONVERSATION_ID,
  assignmentSource: 'doctor',
  itemStatus: 'active',
};

function buildDeps(overrides?: {
  notify?: (params: unknown) => Promise<void>;
  appendCreated?: boolean;
  appendDiscussion?: () => Promise<unknown>;
}) {
  const appendWebappMessage = vi
    .fn()
    .mockResolvedValue({ id: 'support-1', created: overrides?.appendCreated ?? true });
  const appendDoctorReplyForProgramNote = vi
    .fn()
    .mockImplementation(overrides?.appendDiscussion ?? (async () => ({ id: 'discussion-1' })));
  const notifyPatientOfDoctorReply = vi
    .fn()
    .mockImplementation(overrides?.notify ?? (async () => undefined));

  const send = createSendProgramNoteReply({
    supportCommunication: {
      ensureWebappConversationForUser: vi.fn().mockResolvedValue({ id: 'conversation-1' }),
      appendWebappMessage,
    } as never,
    discussion: { appendDoctorReplyForProgramNote } as never,
    resolveProgramNoteReplyContext: vi.fn().mockResolvedValue(CTX),
    notifyPatientOfDoctorReply: notifyPatientOfDoctorReply as never,
  });

  const call = () =>
    send({
      integratorConversationId: CONVERSATION_ID,
      integratorMessageId: 'webapp-program-note:fixed',
      stageItemId: 'item-1',
      text: 'Ответ врача',
    });

  return { call, appendWebappMessage, appendDoctorReplyForProgramNote, notifyPatientOfDoctorReply };
}

describe('sendProgramNoteReply', () => {
  beforeEach(() => {
    vi.mocked(logger.error).mockClear();
  });

  it('подтверждает ответ, не дожидаясь внешнего уведомления пациента', async () => {
    // Уведомление не завершится никогда — так ведёт себя недоступный relay, пока идут ретраи.
    const { call, appendDoctorReplyForProgramNote, notifyPatientOfDoctorReply } = buildDeps({
      notify: () => new Promise<void>(() => {}),
    });

    const result = await call();

    expect(result).toEqual({
      ok: true,
      platformUserId: 'patient-1',
      chatText: expect.stringContaining('Ответ врача'),
      supportMessageId: 'support-1',
    });
    expect(appendDoctorReplyForProgramNote).toHaveBeenCalledTimes(1);
    expect(notifyPatientOfDoctorReply).toHaveBeenCalledTimes(1);
  });

  it('не подтверждает ответ, если долговечная запись обсуждения не удалась', async () => {
    const { call, notifyPatientOfDoctorReply } = buildDeps({
      appendDiscussion: async () => {
        throw new Error('permission denied for table program_item_discussion_messages');
      },
    });

    await expect(call()).rejects.toThrow(/permission denied/);
    expect(notifyPatientOfDoctorReply).not.toHaveBeenCalled();
  });

  it('падение уведомления логируется и не превращается в ошибку ответа врача', async () => {
    const { call } = buildDeps({
      notify: async () => {
        throw new Error('fetch failed');
      },
    });

    await expect(call()).resolves.toMatchObject({ ok: true });
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalledTimes(1));
    expect(vi.mocked(logger.error).mock.calls[0]?.[1]).toContain('programNoteReply');
  });

  it('повтор с тем же integratorMessageId не уведомляет пациента второй раз', async () => {
    const { call, notifyPatientOfDoctorReply } = buildDeps({ appendCreated: false });

    await expect(call()).resolves.toMatchObject({ ok: true });
    expect(notifyPatientOfDoctorReply).not.toHaveBeenCalled();
  });
});
