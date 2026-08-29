import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClientListItem } from '@/modules/doctor-clients/ports';
import { fanOutBroadcastEmail } from './fanOutBroadcastEmail';

vi.mock('@/modules/system-settings/integrationRuntime', () => ({
  getIntegratorApiUrl: async () => 'https://integrator.example.test',
  getIntegratorWebhookSecret: async () => 'test-secret',
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';

const eligibleClient: ClientListItem = {
  userId: USER_ID,
  displayName: 'Пациент',
  phone: '+79991234567',
  bindings: {},
  nextAppointmentLabel: null,
  activeTreatmentProgram: false,
  activeTreatmentProgramInstanceId: null,
  cancellationsCount: 0,
  reschedulesCount: 0,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('doctor broadcast email fan-out', () => {
  it('counts an environment-suppressed relay result as skipped, never delivered', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true, status: 'skipped' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const result = await fanOutBroadcastEmail(
      {
        organizationId: '22222222-2222-4222-8222-222222222222',
        auditId: '33333333-3333-4333-8333-333333333333',
        broadcastCategory: 'marketing',
        broadcastTitle: 'Новость',
        broadcastBody: 'Текст',
        eligibleClients: [eligibleClient],
        unsubscribeUrlByUserId: new Map([[USER_ID, 'https://app.example.test/unsubscribe']]),
        unsubscribeTopicTitle: 'Новости и уведомления',
      },
      {
        retryDelaysMs: [0],
        emailRecipientsPort: {
          getVerifiedEmailsForUserIds: async () =>
            new Map([[USER_ID, 'patient@example.test']]),
        },
      },
    );

    expect(result).toEqual({ attempted: 1, delivered: 0, errors: 0, skipped: 1 });
  });
});
