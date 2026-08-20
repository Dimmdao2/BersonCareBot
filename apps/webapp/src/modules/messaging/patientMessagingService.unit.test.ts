import { describe, expect, it, vi } from 'vitest';

import { createPatientMessagingService } from '@/modules/messaging/patientMessagingService';
import type {
  SupportCommunicationPort,
  SupportConversationRow,
} from '@/modules/messaging/ports';

const USER_ID = '00000000-0000-4000-8000-000000000101';
const CONVERSATION_ID = '00000000-0000-4000-8000-000000000102';
const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000103';

function openConversation(): SupportConversationRow {
  return {
    id: CONVERSATION_ID,
    organizationId: ORGANIZATION_ID,
    integratorConversationId: `webapp:platform:${USER_ID}`,
    platformUserId: USER_ID,
    integratorUserId: null,
    source: 'webapp',
    adminScope: 'platform',
    status: 'open',
    openedAt: '2026-08-16T00:00:00.000Z',
    lastMessageAt: '2026-08-16T00:00:00.000Z',
    closedAt: null,
    closeReason: null,
    channelCode: null,
    channelExternalId: null,
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  };
}

function messagingPort() {
  const appendWebappMessage = vi.fn().mockResolvedValue({
    id: '00000000-0000-4000-8000-000000000104',
    created: true,
  });
  const port = {
    getConversationIfOwnedByUser: vi.fn().mockResolvedValue(openConversation()),
    ensureWebappConversationForUser: vi.fn().mockResolvedValue({
      id: CONVERSATION_ID,
      organizationId: ORGANIZATION_ID,
    }),
    appendWebappMessage,
  } as unknown as SupportCommunicationPort;
  return { port, appendWebappMessage };
}

describe('patient messaging write boundary', () => {
  it('appends for an unblocked patient and forwards the session label without a second identity read', async () => {
    const { port, appendWebappMessage } = messagingPort();
    const notifyDoctorOfPatientMessage = vi.fn().mockResolvedValue(undefined);
    const isUserMessagingBlocked = vi.fn().mockResolvedValue(false);
    const service = createPatientMessagingService(port, {
      isUserMessagingBlocked,
      notifyDoctorOfPatientMessage,
    });

    const result = await service.sendText(USER_ID, CONVERSATION_ID, 'Сообщение', 'Дмитрий Берсон');

    expect(result.ok).toBe(true);
    expect(isUserMessagingBlocked).toHaveBeenCalledWith(USER_ID);
    expect(appendWebappMessage).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(notifyDoctorOfPatientMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          platformUserId: USER_ID,
          patientLabel: 'Дмитрий Берсон',
          messageText: 'Сообщение',
        }),
      );
    });
  });

  it('rejects a blocked patient before appending a message', async () => {
    const { port, appendWebappMessage } = messagingPort();
    const service = createPatientMessagingService(port, {
      isUserMessagingBlocked: vi.fn().mockResolvedValue(true),
    });

    await expect(
      service.sendText(USER_ID, CONVERSATION_ID, 'Сообщение', 'Дмитрий Берсон'),
    ).resolves.toEqual({ ok: false, error: 'blocked' });
    expect(appendWebappMessage).not.toHaveBeenCalled();
  });
});
