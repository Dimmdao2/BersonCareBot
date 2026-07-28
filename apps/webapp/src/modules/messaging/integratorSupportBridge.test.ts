import { describe, expect, it, vi } from 'vitest';
import { createIntegratorSupportBridge } from './integratorSupportBridge';
import type { SupportCommunicationPort } from '@/infra/repos/pgSupportCommunication';
import { integratorSupportAdminReplySchema } from './integratorSupportHttp';
import { buildPersonalChatNotificationText } from './notifyPatientDoctorReply';

describe('createIntegratorSupportBridge', () => {
  it('syncUserMessage appends to the exact organization-scoped conversation returned by ensure', async () => {
    const ensureWebappConversationForUser = vi.fn().mockResolvedValue({ id: 'conv-current-org' });
    const mergeLegacySupportConversationsForPlatformUser = vi.fn().mockResolvedValue({
      mergedConversationCount: 0,
      movedMessageCount: 0,
    });
    const appendWebappMessage = vi.fn().mockResolvedValue({ id: 'msg-1', created: true });
    const getConversationByIntegratorId = vi.fn();
    const port = {
      ensureWebappConversationForUser,
      mergeLegacySupportConversationsForPlatformUser,
      appendWebappMessage,
      getConversationByIntegratorId,
    } as unknown as SupportCommunicationPort;
    const bridge = createIntegratorSupportBridge({ port });

    await expect(
      bridge.syncUserMessage({
        platformUserId: '00000000-0000-4000-8000-000000000001',
        integratorMessageId: 'incoming-1',
        text: 'Сообщение',
        source: 'webapp',
        createdAt: '2026-07-16T12:00:00.000Z',
      }),
    ).resolves.toEqual({ ok: true });

    expect(appendWebappMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-current-org',
        integratorMessageId: 'incoming-1',
      }),
    );
    expect(getConversationByIntegratorId).not.toHaveBeenCalled();
  });

  it('applyAdminReply writes admin message for webapp platform conversation', async () => {
    const ensureWebappConversationForUser = vi.fn().mockResolvedValue({
      id: 'conv-internal',
      organizationId: '11111111-1111-4111-8111-111111111111',
    });
    const appendWebappMessage = vi.fn().mockResolvedValue({ id: 'msg-1', created: true });
    const notifyPatientOfDoctorReply = vi.fn().mockResolvedValue(undefined);
    const port = {
      ensureWebappConversationForUser,
      appendWebappMessage,
    } as unknown as SupportCommunicationPort;
    const bridge = createIntegratorSupportBridge({ port, notifyPatientOfDoctorReply });
    const platformUserId = '00000000-0000-4000-8000-000000000001';
    const r = await bridge.applyAdminReply({
      integratorConversationId: `webapp:platform:${platformUserId}`,
      integratorMessageId: 'webapp-msg:admin-1',
      text: 'Ответ врача',
      senderDisplayName: 'Доктор Берсон',
      createdAt: new Date().toISOString(),
    });
    expect(r).toEqual({ ok: true });
    expect(ensureWebappConversationForUser).toHaveBeenCalledWith(platformUserId);
    expect(appendWebappMessage).toHaveBeenCalledWith(
      expect.objectContaining({ senderRole: 'admin', text: 'Ответ врача' }),
    );
    expect(notifyPatientOfDoctorReply).toHaveBeenCalledWith(
      expect.objectContaining({
        platformUserId,
        topicCode: 'support_messages',
        senderDisplayName: 'Доктор Берсон',
      }),
    );
  });

  it('accepts an old-integrator payload without senderDisplayName and emits a redacted neutral notification', async () => {
    const parsed = integratorSupportAdminReplySchema.safeParse({
      integratorConversationId: 'webapp:platform:00000000-0000-4000-8000-000000000001',
      integratorMessageId: 'webapp-msg:old-integrator',
      text: 'Секретный ответ врача',
      createdAt: '2026-07-27T10:00:00.000Z',
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error('old integrator payload must remain valid');

    const ensureWebappConversationForUser = vi.fn().mockResolvedValue({
      id: 'conv-internal',
      organizationId: '11111111-1111-4111-8111-111111111111',
    });
    const appendWebappMessage = vi.fn().mockResolvedValue({ id: 'msg-1', created: true });
    let notificationText = '';
    const notifyPatientOfDoctorReply = vi.fn(async (params) => {
      notificationText = buildPersonalChatNotificationText(params.senderDisplayName, 'specialist');
    });
    const bridge = createIntegratorSupportBridge({
      port: {
        ensureWebappConversationForUser,
        appendWebappMessage,
      } as unknown as SupportCommunicationPort,
      notifyPatientOfDoctorReply,
    });

    await expect(bridge.applyAdminReply(parsed.data)).resolves.toEqual({ ok: true });
    expect(notificationText).toBe('новое сообщение от специалиста');
    expect(notificationText).not.toContain('Секретный ответ врача');
  });

  it('applyAdminReply rejects organization-scoped conversation without trusted tenant context', async () => {
    const ensureWebappConversationForUser = vi.fn();
    const appendWebappMessage = vi.fn();
    const notifyPatientOfDoctorReply = vi.fn();
    const sendProgramNoteReply = vi.fn();
    const port = {
      ensureWebappConversationForUser,
      appendWebappMessage,
    } as unknown as SupportCommunicationPort;
    const bridge = createIntegratorSupportBridge({
      port,
      notifyPatientOfDoctorReply,
      sendProgramNoteReply,
    });

    await expect(
      bridge.applyAdminReply({
        integratorConversationId:
          'webapp:organization:11111111-1111-4111-8111-111111111111:platform:00000000-0000-4000-8000-000000000001',
        integratorMessageId: 'webapp-msg:admin-scoped',
        text: 'Ответ врача',
        senderDisplayName: 'Доктор Берсон',
        createdAt: '2026-07-16T12:00:00.000Z',
      }),
    ).resolves.toEqual({ ok: false, error: 'organization_context_required' });

    expect(ensureWebappConversationForUser).not.toHaveBeenCalled();
    expect(appendWebappMessage).not.toHaveBeenCalled();
    expect(notifyPatientOfDoctorReply).not.toHaveBeenCalled();
    expect(sendProgramNoteReply).not.toHaveBeenCalled();
  });

  it('applyAdminReply prefixes text when programNoteStageItemId is set', async () => {
    const sendProgramNoteReply = vi.fn().mockResolvedValue({ ok: true });
    const port = {} as unknown as SupportCommunicationPort;
    const bridge = createIntegratorSupportBridge({ port, sendProgramNoteReply });
    const stageItemId = '22222222-2222-4222-8222-222222222222';
    const platformUserId = '00000000-0000-4000-8000-000000000001';

    const r = await bridge.applyAdminReply({
      integratorConversationId: `webapp:platform:${platformUserId}`,
      integratorMessageId: 'webapp-msg:admin-2',
      text: 'Делайте медленнее',
      senderDisplayName: 'Доктор Берсон',
      createdAt: new Date().toISOString(),
      programNoteStageItemId: stageItemId,
    });

    expect(r).toEqual({ ok: true });
    expect(sendProgramNoteReply).toHaveBeenCalledWith(
      expect.objectContaining({
        stageItemId,
        integratorConversationId: `webapp:platform:${platformUserId}`,
        text: 'Делайте медленнее',
        senderDisplayName: 'Доктор Берсон',
      }),
    );
  });
});
