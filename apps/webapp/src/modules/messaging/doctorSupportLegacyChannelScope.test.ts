import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createDoctorSupportMessagingService } from '@/modules/messaging/doctorSupportMessagingService';
import type { SupportCommunicationPort, SupportConversationRelayInfo } from '@/modules/messaging/ports';

const relayOutboundMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/modules/messaging/relayOutbound', () => ({
  relayOutbound: (...args: unknown[]) => relayOutboundMock(...args),
}));

/**
 * §1.2h: на пути по умолчанию клиника не настраивает НИЧЕГО — пациенту пишет наш бот от имени клиники.
 * Legacy-ветка sendAdminReply (диалог без platform_user_id) не имеет права требовать своего бота:
 * при `clinic_required` без кредентиала dispatch бросает CLINIC_CHANNEL_NOT_CONFIGURED, ошибка гасится
 * в .catch(logger.error), метод отвечает { ok: true } — врач видит «отправлено», пациент не получает ничего.
 */
describe('doctorSupportMessagingService: legacy channel branch keeps the default path alive', () => {
  beforeEach(() => {
    relayOutboundMock.mockClear();
  });

  const makeService = (channelCode: 'telegram' | 'max' | 'email') => {
    const relayInfo: SupportConversationRelayInfo = {
      id: 'conversation-legacy',
      organizationId: 'org-legacy',
      platformUserId: null,
      channelCode,
      channelExternalId: 'external-1',
    };
    const port = {
      getConversationRelayInfo: vi.fn().mockResolvedValue(relayInfo),
      appendWebappMessage: vi.fn().mockResolvedValue({ id: 'message-legacy', created: true }),
    } as unknown as SupportCommunicationPort;
    return createDoctorSupportMessagingService(port, {
      notifyPatientOfDoctorReply: vi.fn().mockResolvedValue(undefined),
    });
  };

  it.each(['telegram', 'max'] as const)(
    'marks the %s reply as clinic_if_configured, never clinic_required',
    async (channelCode) => {
      const service = makeService(channelCode);
      await service.sendAdminReply('conversation-legacy', 'Ответ врача', 'org-legacy', 'Доктор', 'key-1');

      expect(relayOutboundMock).toHaveBeenCalledTimes(1);
      const payload = relayOutboundMock.mock.calls[0]![0] as { senderScope?: string };
      expect(payload.senderScope).toBe('clinic_if_configured');
      expect(payload.senderScope).not.toBe('clinic_required');
    },
  );

  it('leaves non-messenger channels without a sender scope', async () => {
    const service = makeService('email');
    await service.sendAdminReply('conversation-legacy', 'Ответ врача', 'org-legacy', 'Доктор', 'key-2');

    const payload = relayOutboundMock.mock.calls[0]![0] as { senderScope?: string };
    expect(payload.senderScope).toBeUndefined();
  });
});
