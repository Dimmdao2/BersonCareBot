import { describe, expect, it } from 'vitest';
import type { ClientListItem } from '@/modules/doctor-clients/ports';
import { serializeTiptapRichText } from '@/shared/lib/richText';
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
  it('converts Tiptap JSON to channel content instead of sending the serialized document', () => {
    const richBody = serializeTiptapRichText({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Важный текст', marks: [{ type: 'bold' }] }],
        },
      ],
    });
    const jobs = buildDoctorBroadcastDeliveryJobs({
      auditId: '22222222-2222-4222-8222-222222222222',
      eligibleClients: [client],
      channels: ['telegram', 'email'],
      messageTitle: 'Заголовок',
      messageBodyPlain: richBody,
      unsubscribeUrlByUserId: new Map([[client.userId, 'https://example.test/unsubscribe']]),
      unsubscribeTopicTitle: 'Новости',
      verifiedEmailByUserId: new Map([[client.userId, 'patient@example.test']]),
    });

    const intents = jobs.map((job) => job.payloadJson.intent as {
      payload?: { message?: { text?: string }; html?: string };
    });
    expect(intents[0]?.payload?.message?.text).toContain('<b>Важный текст</b>');
    expect(intents[1]?.payload?.message?.text).toContain('Важный текст');
    expect(JSON.stringify(intents)).not.toContain('tiptap-json:v1:');
  });

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
