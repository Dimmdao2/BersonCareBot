import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  requireDoctorBookingEngine: vi.fn(),
  resolveDoctorAppointmentAccess: vi.fn(),
  requireEntitlementForMutation: vi.fn(),
  getMechanicMutationAvailability: vi.fn(),
  buildAppDeps: vi.fn(),
  loadStaffAppointmentPaymentSummary: vi.fn(),
  listAppointmentPayments: vi.fn(),
  addCashPayment: vi.fn(),
  createAppointmentPaymentIntent: vi.fn(),
  getBookingByCanonicalAppointment: vi.fn(),
  getPrepaymentAvailability: vi.fn(),
  getPortalStatus: vi.fn(),
  getSettings: vi.fn(),
  listPrepaymentPolicies: vi.fn(),
  listAppointmentPaymentBriefs: vi.fn(),
  listBookingsByCanonicalAppointments: vi.fn(),
  sumPaidMinorForAppointments: vi.fn(),
  listPortalLinkedPatients: vi.fn(),
}));

vi.mock('../../../_requireDoctorBookingEngine', () => ({
  requireDoctorBookingEngine: fakes.requireDoctorBookingEngine,
}));
vi.mock('../../../_resolveDoctorAppointmentAccess', () => ({
  resolveDoctorAppointmentAccess: fakes.resolveDoctorAppointmentAccess,
}));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  requireEntitlementForMutation: fakes.requireEntitlementForMutation,
  getMechanicMutationAvailability: fakes.getMechanicMutationAvailability,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/booking/staffAppointmentPaymentSummary', () => ({
  loadStaffAppointmentPaymentSummary: fakes.loadStaffAppointmentPaymentSummary,
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: (
    _ctx: unknown,
    _source: string,
    callback: () => Promise<unknown>,
  ) => callback(),
}));

import { GET, POST } from './route';

const APPOINTMENT_ID = '11111111-1111-4111-8111-111111111111';
const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
const PATIENT_ID = '33333333-3333-4333-8333-333333333333';

function get() {
  return GET(
    new Request(
      `http://localhost/api/doctor/booking-engine/appointments/${APPOINTMENT_ID}/payment`,
    ),
    { params: Promise.resolve({ id: APPOINTMENT_ID }) },
  );
}

function post(action: 'cash' | 'link') {
  return POST(
    new Request(
      `http://localhost/api/doctor/booking-engine/appointments/${APPOINTMENT_ID}/payment`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      },
    ),
    { params: Promise.resolve({ id: APPOINTMENT_ID }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requireDoctorBookingEngine.mockResolvedValue({
    ok: true,
    ctx: {
      organizationId: ORGANIZATION_ID,
      session: { user: { userId: 'doctor-1', role: 'specialist' } },
    },
  });
  fakes.resolveDoctorAppointmentAccess.mockResolvedValue({
    id: APPOINTMENT_ID,
    organizationId: ORGANIZATION_ID,
    platformUserId: PATIENT_ID,
    serviceId: null,
  });
  fakes.requireEntitlementForMutation.mockResolvedValue({ ok: true });
  fakes.getMechanicMutationAvailability.mockResolvedValue({ available: true });
  fakes.loadStaffAppointmentPaymentSummary.mockResolvedValue({
    appointmentId: APPOINTMENT_ID,
    appointmentStatus: 'confirmed',
    prepaymentQuote: null,
    intent: null,
    payment: null,
    history: [],
  });
  fakes.getBookingByCanonicalAppointment.mockResolvedValue({
    priceMinorSnapshot: 10_000,
    serviceTitleSnapshot: 'Приём',
  });
  fakes.listAppointmentPayments.mockResolvedValue([]);
  fakes.addCashPayment.mockImplementation(async (input: Record<string, unknown>) => ({
    id: `cash-${String(input.idempotencyKey ?? Math.random())}`,
    ...input,
    kind: 'cash',
    status: 'paid',
  }));
  fakes.createAppointmentPaymentIntent.mockResolvedValue({
    id: 'intent-1',
    checkoutUrl: 'https://pay.example.test/intent-1',
  });
  fakes.getPrepaymentAvailability.mockResolvedValue({ available: true });
  fakes.getPortalStatus.mockResolvedValue({ status: 'linked' });
  fakes.getSettings.mockResolvedValue({ enabled: true, defaultProviderId: 'p', providers: [] });
  fakes.listPrepaymentPolicies.mockResolvedValue([]);
  fakes.listAppointmentPaymentBriefs.mockResolvedValue([]);
  fakes.listBookingsByCanonicalAppointments.mockResolvedValue([
    { canonicalAppointmentId: APPOINTMENT_ID, bookingType: 'offline', priceMinorSnapshot: 10_000 },
  ]);
  fakes.sumPaidMinorForAppointments.mockResolvedValue([]);
  fakes.listPortalLinkedPatients.mockResolvedValue([PATIENT_ID]);
  fakes.buildAppDeps.mockReturnValue({
    payments: {
      createAppointmentPaymentIntent: fakes.createAppointmentPaymentIntent,
      getPrepaymentAvailability: fakes.getPrepaymentAvailability,
      getSettings: fakes.getSettings,
      listPrepaymentPolicies: fakes.listPrepaymentPolicies,
      listAppointmentPaymentBriefs: fakes.listAppointmentPaymentBriefs,
    },
    patientInvites: {
      getPortalStatus: fakes.getPortalStatus,
      listPortalLinkedPatients: fakes.listPortalLinkedPatients,
    },
    patientBooking: {
      getBookingByCanonicalAppointment: fakes.getBookingByCanonicalAppointment,
      listBookingsByCanonicalAppointments: fakes.listBookingsByCanonicalAppointments,
    },
    patientPayments: {
      listAppointmentPayments: fakes.listAppointmentPayments,
      addCashPayment: fakes.addCashPayment,
      sumPaidMinorForAppointments: fakes.sumPaidMinorForAppointments,
    },
  });
});

describe('doctor appointment payment route', () => {
  it.each(['cash', 'link'] as const)(
    'refuses a %s mutation when the payments entitlement denies it',
    async (action) => {
      const denied = Response.json(
        { ok: false, error: 'entitlement_required', mechanic: 'payments' },
        { status: 403 },
      );
      fakes.requireEntitlementForMutation.mockResolvedValue({ ok: false, response: denied });

      const response = await post(action);

      expect(response.status).toBe(403);
      expect(fakes.requireEntitlementForMutation).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: ORGANIZATION_ID }),
        'payments',
      );
      expect(fakes.addCashPayment).not.toHaveBeenCalled();
      expect(fakes.createAppointmentPaymentIntent).not.toHaveBeenCalled();
    },
  );

  it.each(['cash', 'link'] as const)(
    'does not expose or mutate an appointment rejected by organization/specialist scope for %s',
    async (action) => {
      fakes.resolveDoctorAppointmentAccess.mockResolvedValue(null);

      const response = await post(action);

      expect(response.status).toBe(404);
      expect(fakes.buildAppDeps).not.toHaveBeenCalled();
      expect(fakes.addCashPayment).not.toHaveBeenCalled();
      expect(fakes.createAppointmentPaymentIntent).not.toHaveBeenCalled();
    },
  );

  it('coalesces concurrent cash double-clicks into one appointment payment identity', async () => {
    const rows = new Map<string, Record<string, unknown>>();
    fakes.addCashPayment.mockImplementation(async (input: Record<string, unknown>) => {
      const key =
        typeof input.idempotencyKey === 'string' ? input.idempotencyKey : crypto.randomUUID();
      const current = rows.get(key);
      if (current) return current;
      await Promise.resolve();
      const payment = { id: `cash-${key}`, ...input, kind: 'cash', status: 'paid' };
      rows.set(key, payment);
      return payment;
    });

    const [first, second] = await Promise.all([post('cash'), post('cash')]);
    const firstBody = (await first.json()) as { payment?: { id?: string } };
    const secondBody = (await second.json()) as { payment?: { id?: string } };

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstBody.payment?.id).toBe(secondBody.payment?.id);
    expect(rows.size).toBe(1);
  });

  it('creates and repeats a provider link for the exact remaining appointment balance', async () => {
    fakes.loadStaffAppointmentPaymentSummary.mockResolvedValue({
      appointmentId: APPOINTMENT_ID,
      appointmentStatus: 'confirmed',
      prepaymentQuote: null,
      intent: null,
      payment: { amountMinor: 2_500, status: 'succeeded' },
      history: [],
    });
    fakes.listAppointmentPayments.mockResolvedValue([
      { amountMinor: 1_000, kind: 'cash', status: 'paid' },
    ]);

    const [first, second] = await Promise.all([post('link'), post('link')]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(fakes.createAppointmentPaymentIntent).toHaveBeenCalledTimes(2);
    for (const [input] of fakes.createAppointmentPaymentIntent.mock.calls) {
      expect(input).toMatchObject({
        organizationId: ORGANIZATION_ID,
        appointmentId: APPOINTMENT_ID,
        platformUserId: PATIENT_ID,
        amountMinor: 6_500,
        idempotencyKey: `staff-appointment-link:${APPOINTMENT_ID}:6500`,
      });
    }
    await expect(first.json()).resolves.toMatchObject({
      ok: true,
      paymentLink: 'https://pay.example.test/intent-1',
      remainingMinor: 6_500,
    });
    await expect(second.json()).resolves.toMatchObject({
      ok: true,
      paymentLink: 'https://pay.example.test/intent-1',
      remainingMinor: 6_500,
    });
  });

  it('returns provider failure without a payment link or a false success payload', async () => {
    // S4 (owner plan, wave 03.09): the route used to echo whatever text the provider failure
    // carried — `provider_down` here, a rejected SQL statement in production. The doctor now gets
    // the route's own fixed code plus the id the operator log records the real detail under.
    fakes.createAppointmentPaymentIntent.mockRejectedValue(new Error('provider_down'));

    const response = await post('link');
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('payment_provider_unavailable');
    expect(typeof body.correlationId).toBe('string');
    expect(body).not.toHaveProperty('paymentLink');
  });
});

/**
 * The card draws the payment block, the online options and the «отправить в чат» option straight
 * from this read. A read that answers for the wrong clinic, or that reports a capability the POST
 * door and the provider cannot honour, silently produces a working-looking money action.
 */
describe('doctor appointment payment read capabilities', () => {
  it('exposes neither payment state nor capabilities for an appointment outside the workspace', async () => {
    fakes.resolveDoctorAppointmentAccess.mockResolvedValue(null);

    const response = await get();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'not_found' });
    expect(fakes.buildAppDeps).not.toHaveBeenCalled();
    expect(fakes.listAppointmentPaymentBriefs).not.toHaveBeenCalled();
    expect(fakes.getPrepaymentAvailability).not.toHaveBeenCalled();
    expect(fakes.listPortalLinkedPatients).not.toHaveBeenCalled();
  });

  it('reports no payment capability and probes no provider when the tariff omits payments', async () => {
    fakes.getMechanicMutationAvailability.mockResolvedValue({
      available: false,
      reason: 'entitlement_required',
    });

    const response = await get();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      payment: {
        paymentsEntitled: false,
        onlinePaymentAvailable: false,
        patientChatAvailable: false,
      },
    });
    expect(fakes.getMechanicMutationAvailability).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_ID }),
      'payments',
    );
    expect(fakes.getPrepaymentAvailability).not.toHaveBeenCalled();
  });

  it('withholds the online options without a provider and the chat option without a linked patient', async () => {
    fakes.getPrepaymentAvailability.mockResolvedValue({
      available: false,
      reason: 'payment_provider_unavailable',
    });
    fakes.listPortalLinkedPatients.mockResolvedValue([]);

    const response = await get();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      payment: {
        paymentsEntitled: true,
        onlinePaymentAvailable: false,
        patientChatAvailable: false,
      },
    });
    expect(fakes.listPortalLinkedPatients).toHaveBeenCalledWith(ORGANIZATION_ID, [PATIENT_ID]);
  });

  it('offers online and chat only from the real provider and the real portal binding', async () => {
    const response = await get();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      payment: {
        paymentsEntitled: true,
        onlinePaymentAvailable: true,
        patientChatAvailable: true,
        totalMinor: 10_000,
      },
    });
  });
});
