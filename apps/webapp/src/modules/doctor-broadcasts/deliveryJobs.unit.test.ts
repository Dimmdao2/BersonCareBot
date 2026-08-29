import { describe, expect, it } from 'vitest';
import type { ClientListItem } from '@/modules/doctor-clients/ports';
import { buildDoctorBroadcastDeliveryJobs } from './deliveryJobs';

const client: ClientListItem = {
  userId: '11111111-1111-4111-8111-111111111111',
  displayName: 'Пациент',
  phone: '+79991234567',
  bindings: { telegramId: '12345', maxId: '67890' },
  nextAppointmentLabel: null,
  activeTreatmentProgram: false,
  activeTreatmentProgramInstanceId: null,
  cancellationsCount: 0,
  reschedulesCount: 0,
};

describe('clinic-owned doctor broadcast delivery jobs', () => {
  it.each(['telegram', 'max', 'sms', 'email'] as const)(
    'marks every %s provider intent as clinic-required',
    (channel) => {
      const [job] = buildDoctorBroadcastDeliveryJobs({
        auditId: '22222222-2222-4222-8222-222222222222',
        eligibleClients: [client],
        channels: [channel],
        messageTitle: 'Заголовок',
        messageBodyPlain: 'Текст',
        unsubscribeUrlByUserId: new Map([[client.userId, 'https://example.test/unsubscribe']]),
        unsubscribeTopicTitle: 'Новости',
        verifiedEmailByUserId: new Map([[client.userId, 'patient@example.test']]),
      });

      expect(job).toBeDefined();
      const intent = job?.payloadJson.intent as {
        meta?: Record<string, unknown>;
        payload?: { delivery?: Record<string, unknown> };
      };
      expect(intent.payload?.delivery).toMatchObject({ senderScope: 'clinic_required' });
      expect(intent.meta).toMatchObject({
        outboundMessageClass: 'broadcast_event',
        outboundCapability: 'clinic_delivery',
      });
      if (channel === 'email') {
        expect(intent.payload).toMatchObject({
          recipient: { email: 'patient@example.test' },
          subject: 'Заголовок',
        });
      }
    },
  );
});
