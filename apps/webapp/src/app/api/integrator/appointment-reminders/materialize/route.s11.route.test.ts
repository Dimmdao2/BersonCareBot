import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppointmentReminderMaterializationPort } from '@/modules/booking-notifications/appointmentReminderMaterializationPort';

// Owner oracle: S11 reminder due facts exist without transport subscriptions and are scheduled
// once per configured due, not once per channel. Observe the durable queue port at the HTTP boundary.
const fakes = vi.hoisted(() => ({ replace: vi.fn(), targets: vi.fn() }));
vi.mock('@/app-layer/integrator/verifyIntegratorSignature', () => ({ verifyIntegratorSignature: () => true }));
vi.mock('@/app-layer/principal/integratorOrganizationPrincipal', () => ({
  enterVerifiedIntegratorOrganizationPrincipal: () => true,
}));
vi.mock('@/app-layer/idempotency/idempotencyStore', () => ({
  isKeyValid: () => true, getCachedResponse: async () => ({ hit: false }), setCachedResponse: async () => undefined,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: () => ({
  deliveryTargetsApi: { getTargets: fakes.targets },
  appDisplayTimeZone: async () => 'UTC',
  appointmentReminderMaterialization: { replaceGeneration: fakes.replace },
}) }));
import { POST } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2027-01-01T00:00:00.000Z'));
  fakes.replace.mockResolvedValue({ current: true, inserted: 2 });
});
afterEach(() => vi.useRealTimers());

describe('S11 reminder scheduling acceptance', () => {
  it.each([{ selectedChannels: [] }, { selectedChannels: ['telegram', 'max', 'web_push'] }])('K1: schedules each due once with channels $selectedChannels', async ({ selectedChannels }) => {
    fakes.targets.mockResolvedValue({
      platformUserId: '30000000-0000-4000-8000-000000000003',
      channelBindings: { telegramId: 'telegram-patient', maxId: 'max-patient' },
      resolution: { selectedChannels },
    });
    const response = await POST(new Request('https://webapp.test/api/integrator/appointment-reminders/materialize', {
      method: 'POST', headers: {
        'x-bersoncare-timestamp': '1798761600', 'x-bersoncare-signature': 'verified-by-boundary',
        'x-bersoncare-idempotency-key': 'reminder-generation-1',
      }, body: JSON.stringify({
        organizationId: '10000000-0000-4000-8000-000000000001',
        appointmentId: '20000000-0000-4000-8000-000000000002',
        platformUserId: '30000000-0000-4000-8000-000000000003',
        bookingId: '20000000-0000-4000-8000-000000000002',
        generationRevision: 'generation-1', slotStartIso: '2027-01-02T12:00:00.000Z',
        reminderPlan: { enabled: true, offsetsMinutes: [120, 60, 120] }, cancelPending: false,
      }),
    }));
    expect(response.status).toBe(200);
    const persisted = fakes.replace.mock.calls[0]?.[0] as
      Parameters<AppointmentReminderMaterializationPort['replaceGeneration']>[0] | undefined;
    const facts = persisted?.deliveries.filter(row => row.kind === 'booking_lifecycle') ?? [];
    expect(facts.map(row => row.nextRetryAt).sort()).toEqual([
      '2027-01-02T10:00:00.000Z', '2027-01-02T11:00:00.000Z',
    ]);
    expect(new Set(facts.map(row => row.eventId)).size).toBe(2);
  });
});
