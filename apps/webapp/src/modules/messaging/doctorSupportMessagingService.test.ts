import { describe, expect, it, vi } from 'vitest';
import { createDoctorSupportMessagingService } from '@/modules/messaging/doctorSupportMessagingService';
import type { SupportCommunicationPort, SupportConversationRelayInfo } from '@/modules/messaging/ports';

describe('doctorSupportMessagingService.sendAdminReply idempotency', () => {
  it('same idempotencyKey on retry does not notify the patient twice', async () => {
    const relayInfo: SupportConversationRelayInfo = {
      id: 'conversation-1',
      organizationId: 'org-1',
      platformUserId: 'patient-1',
      channelCode: null,
      channelExternalId: null,
    };
    const append = vi
      .fn()
      .mockResolvedValueOnce({ id: 'message-1', created: true })
      .mockResolvedValueOnce({ id: 'message-1', created: false });
    const notify = vi.fn().mockResolvedValue(undefined);
    const port = {
      getConversationRelayInfo: vi.fn().mockResolvedValue(relayInfo),
      appendWebappMessage: append,
    } as unknown as SupportCommunicationPort;

    const service = createDoctorSupportMessagingService(port, {
      notifyPatientOfDoctorReply: notify,
    });

    const first = await service.sendAdminReply(
      'conversation-1',
      'Здравствуйте!',
      'org-1',
      'Доктор',
      'retry-key-1',
    );
    const retry = await service.sendAdminReply(
      'conversation-1',
      'Здравствуйте!',
      'org-1',
      'Доктор',
      'retry-key-1',
    );

    expect(first).toEqual({ ok: true });
    expect(retry).toEqual({ ok: true });
    // Same integratorMessageId derived from the same key both times.
    expect(append.mock.calls[0]![0].integratorMessageId).toBe(
      append.mock.calls[1]![0].integratorMessageId,
    );
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
