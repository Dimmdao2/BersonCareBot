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
  it.each(['telegram', 'max', 'sms'] as const)(
    'marks every %s provider intent as clinic-required',
    (channel) => {
      const [job] = buildDoctorBroadcastDeliveryJobs({
        auditId: '22222222-2222-4222-8222-222222222222',
        eligibleClients: [client],
        channels: [channel],
        messageTitle: 'Заголовок',
        messageBodyPlain: 'Текст',
      });

      expect(job).toBeDefined();
      const intent = job?.payloadJson.intent as {
        payload?: { delivery?: Record<string, unknown> };
      };
      expect(intent.payload?.delivery).toMatchObject({ senderScope: 'clinic_required' });
    },
  );
});
