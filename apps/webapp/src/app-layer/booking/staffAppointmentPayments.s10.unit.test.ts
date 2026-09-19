import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStaffAppointmentPaymentsService } from './staffAppointmentPayments';
import { createPaymentsService } from '@/modules/payments/service';
import type { PaymentsPort } from '@/modules/payments/ports';
import type { PaymentHistoryEventRecord, PaymentIntentRecord, PaymentRecord } from '@/modules/payments/types';
import type { PatientBookingRecord } from '@/modules/patient-booking/types';
import type { BeAppointment, AppointmentFinancialSnapshotRecord } from '@/modules/booking-engine/types';
import {
  inMemoryPatientPaymentsPort,
  __resetInMemoryPatientPaymentsForTest,
} from '@/infra/repos/inMemoryPatientPayments';

// S10 owner brief: actual money is conserved through partial/repeated collection and refunds.
// Oracle: money received less money actually returned, independently of internal record shape.
// Database is substituted here; this file makes no RLS, locking or SQL-root claims.
const provider = vi.hoisted(() => ({ refund: vi.fn() }));
vi.mock('@/infra/payments/paymentProviderRegistry', () => ({ getPaymentProviderAdapter: () => provider }));

const org = 'org-s10';
const patient = 'patient-s10';
const input = { organizationId: org, appointmentId: 'a', platformUserId: patient, createdBy: 'doctor', returnUrl: '/app' };

function harness(
  onlineMinor = 0,
  slots = 1,
  providerConfigured = true,
  prepaymentRequiredMinor = onlineMinor,
) {
  const refunds: Parameters<PaymentsPort['createRefund']>[0][] = [];
  const history: PaymentHistoryEventRecord[] = [];
  const externalRefunds = new Map<string, number>();
  const payment: PaymentRecord = {
    id: 'payment', organizationId: org, paymentIntentId: 'intent', appointmentId: 'a',
    amountMinor: onlineMinor, currency: 'RUB', status: 'captured', providerId: 'yookassa', purpose: 'appointment_prepayment',
  };
  const intent: PaymentIntentRecord = {
    id: 'intent', organizationId: org, appointmentId: 'a', platformUserId: patient,
    amountMinor: onlineMinor, currency: 'RUB', status: 'succeeded', providerId: 'yookassa',
    purpose: 'appointment_prepayment', idempotencyKey: 'capture', productRef: null,
    providerIntentRef: 'external-payment', checkoutUrl: null,
  };
  const appointment = (id: string) => ({
    id, organizationId: org, paymentRef: onlineMinor ? payment.id : null, serviceId: null,
    status: 'confirmed', prepaymentRequiredMinor,
  }) as BeAppointment;
  provider.refund.mockImplementation(async ({ amountMinor, idempotencyKey }: { amountMinor: number; idempotencyKey: string }) => {
    if (!externalRefunds.has(idempotencyKey)) externalRefunds.set(idempotencyKey, amountMinor);
    return { providerRefundRef: `external-refund:${idempotencyKey}` };
  });
  const port = {
    findPaymentById: async () => payment,
    countAppointmentsByPaymentRef: async () => slots,
    getSucceededRefundedAmount: async () => refunds.reduce((sum, r) => sum + r.amountMinor, 0),
    findIntentById: async () => intent,
    findLatestIntentByAppointment: async () => onlineMinor ? intent : null,
    createRefund: async (row: Parameters<PaymentsPort['createRefund']>[0]) => {
      refunds.push(row); return { id: `refund-${refunds.length}` };
    },
    updatePaymentStatus: async (_id: string, status: string) => { payment.status = status; },
    appendHistoryEvent: async (row: Parameters<PaymentsPort['appendHistoryEvent']>[0]) => {
      history.push({ id: `event-${history.length}`, organizationId: org, appointmentId: row.appointmentId ?? null,
        platformUserId: patient, paymentId: row.paymentId ?? null, refundId: row.refundId ?? null,
        eventType: row.eventType, amountMinor: row.amountMinor ?? null, currency: row.currency ?? null,
        providerId: row.providerId ?? null, status: row.status ?? null, purpose: row.purpose ?? null,
        comment: row.comment ?? null, occurredAt: '2026-09-18T12:00:00Z' });
    },
    listHistoryForAppointment: async (id: string) => history.filter(row => row.appointmentId === id),
  } satisfies Partial<PaymentsPort>;
  const payments = createPaymentsService({
    port: port as unknown as PaymentsPort,
    config: { getBookingPaymentSettings: async () => ({ enabled: true, defaultProviderId: 'yookassa', fiscalVatCode: '1',
      providers: providerConfigured ? [{ id: 'yookassa', label: 'YooKassa', enabled: true, shopId: 'sandbox', apiKey: 'test-only' }] : [] }) },
    bookingEngine: { getAppointment: async (id) => appointment(id), listAppointmentsByChainId: async () => [], transitionAppointmentStatus: vi.fn() },
    captureUnitOfWork: { run: async (_org, fn) => fn(), runSerializedPostCommit: async (_org, _key, fn) => fn() },
    resolvePayerEmail: async () => 'patient@example.test',
  });
  const staff = createStaffAppointmentPaymentsService({ payments,
    patientBooking: { getBookingByCanonicalAppointment: vi.fn(async () => ({ serviceTitleSnapshot: 'Visit', priceMinorSnapshot: 10_000 } as PatientBookingRecord)) },
    patientPayments: {
      ...inMemoryPatientPaymentsPort,
      // pgPatientPayments returns newest ledger entries first; the in-memory port returns
      // insertion order. Exercise retries against the runtime ordering at this boundary.
      listAppointmentPayments: async (appointmentId, patientUserId) =>
        [...await inMemoryPatientPaymentsPort.listAppointmentPayments(appointmentId, patientUserId)].reverse(),
    },
    bookingEngine: { listAppointmentFinancialSnapshots: async (_org, ids) => ids.map(appointmentId => ({
      appointmentId, priceMinor: 10_000, priceCurrency: 'RUB', prepaymentMode: 'fixed_minor',
      prepaymentRequiredMinor: 10_000, prepaymentPaidMinor: onlineMinor / slots, paymentDeadlineAt: null,
      prepaymentPercentBps: null, prepaymentAmountMinor: 10_000,
    } satisfies AppointmentFinancialSnapshotRecord)) },
  });
  return { staff, payments, externalRefunds, history };
}

beforeEach(() => { __resetInMemoryPatientPaymentsForTest(); vi.clearAllMocks(); });

describe('S10 independent money acceptance', () => {
  // PAY-APPT-30: the absence of online acquiring cannot prevent actual cash collection.
  it('S11 K11: accepts prepayment, partial and full cash without an online provider', async () => {
    const { staff } = harness(0, 1, false);
    for (const [purpose, amountMinor] of [['prepayment', 2000], ['partial', 3000], ['full', 5000]] as const) {
      expect(await staff.createPayment({ ...input, action: 'cash', purpose, amountMinor })).toMatchObject({ ok: true });
    }
    expect((await staff.getPaymentState(input)).manualPaidMinor).toBe(10_000);
  });

  // S11 brief explicitly requires safe route retries for each money producer family.
  it('S11 K7: retrying the same partial cash request does not collect the money twice', async () => {
    const { staff } = harness();
    const request = { ...input, action: 'cash' as const, purpose: 'partial' as const, amountMinor: 3000 };
    await staff.createPayment(request);
    await staff.createPayment(request);
    expect((await staff.getPaymentState(input)).manualPaidMinor).toBe(3000);
  });

  it('S11 K5: repeated retention of the same payment emits one immutable history fact', async () => {
    const { payments, history } = harness(10_000);
    const cancel = { appointmentId: 'a', organizationId: org, prepaymentRetained: true, prepaymentRefunded: false };
    await payments.applyCancelPaymentOutcome(cancel);
    await payments.applyCancelPaymentOutcome(cancel);
    expect(history.filter(event => event.eventType === 'prepayment_retained')).toHaveLength(1);
  });

  // OWNER_PRODUCT_RULES §13.1: for each canceled session, keep only its non-refundable
  // prepayment and return the rest of an already fully paid session. Otherwise a 5 000 ₽
  // prepayment on a 10 000 ₽ paid visit silently becomes a 10 000 ₽ cancellation penalty.
  it('retains only the required prepayment and refunds the paid remainder on cancellation', async () => {
    const { payments, history, externalRefunds } = harness(10_000, 1, true, 5_000);

    await payments.applyCancelPaymentOutcome({
      appointmentId: 'a',
      organizationId: org,
      prepaymentRetained: true,
      prepaymentRefunded: false,
    });

    expect(
      history
        .filter((event) => event.eventType === 'prepayment_retained')
        .reduce((sum, event) => sum + (event.amountMinor ?? 0), 0),
    ).toBe(5_000);
    expect([...externalRefunds.values()].reduce((sum, amount) => sum + amount, 0)).toBe(5_000);
  });

  it('S11 K7: retrying a cash refund without an optional request ID does not return money twice', async () => {
    const { staff } = harness();
    await staff.createPayment({ ...input, action: 'cash', amountMinor: 10_000 });
    const request = { ...input, method: 'cash' as const, amountMinor: 3000 };
    await staff.refundPayment(request);
    await staff.refundPayment(request);
    expect((await staff.getPaymentState(input)).manualPaidMinor).toBe(7000);
  });

  it('S11 K4: a provider refund failure records no successful money fact', async () => {
    const { payments, history, externalRefunds } = harness(10_000);
    provider.refund.mockRejectedValueOnce(new Error('provider unavailable'));
    await expect(payments.refundAppointmentPayment({ organizationId: org, appointmentId: 'a', amountMinor: 3000 }))
      .rejects.toThrow('provider unavailable');
    expect(history.filter(event => event.eventType === 'refund_succeeded')).toEqual([]);
    expect([...externalRefunds.values()]).toEqual([]);
  });

  // The persisted payment state is an externally consumed finance fact (details and analytics),
  // not an implementation callback. A partial immutable refund must not leave it claiming that the
  // whole provider payment is still captured.
  it('marks a provider payment partially_refunded after returning only part of it', async () => {
    const { payments } = harness(10_000);
    await payments.refundAppointmentPayment({
      organizationId: org,
      appointmentId: 'a',
      amountMinor: 3_000,
    });

    const summary = await payments.getAppointmentPaymentSummary('a', org);
    expect(summary?.payment?.status).toBe('partially_refunded');
  });

  // YooKassa's 54-FZ protocol requires receipt data in the same request for a partial refund.
  // The provider call is the observable external side effect: without this amount-matched receipt,
  // cancellation is already committed while the money remains with the clinic.
  it('sends an amount-matched fiscal receipt with a partial YooKassa refund', async () => {
    const { payments } = harness(10_000);
    await payments.refundAppointmentPayment({
      organizationId: org,
      appointmentId: 'a',
      amountMinor: 3_000,
    });

    const request = provider.refund.mock.calls[0]?.[0] as
      | {
          receipt?: {
            customer: { email: string };
            items: Array<{ amountMinor: number; quantity: number }>;
          };
        }
      | undefined;
    expect(request?.receipt?.customer.email).toBe('patient@example.test');
    expect(
      request?.receipt?.items.reduce(
        (sum, item) => sum + item.amountMinor * item.quantity,
        0,
      ),
    ).toBe(3_000);
  });

  // The integrated audit brief follows YooKassa's fiscal-refund contract: a partial refund needs
  // corrected receipt items, while a full refund of a payment that already has a provider receipt
  // reuses that original receipt and must not submit another one.
  it('does not send a second fiscal receipt with a full YooKassa refund', async () => {
    const { payments } = harness(10_000);
    await payments.refundAppointmentPayment({
      organizationId: org,
      appointmentId: 'a',
      amountMinor: 10_000,
    });

    expect(provider.refund.mock.calls[0]?.[0]).not.toHaveProperty('receipt');
  });

  it('K1: collected cash cannot exceed the remaining appointment debt', async () => {
    const { staff } = harness();
    await staff.createPayment({ ...input, action: 'cash', amountMinor: 6_000 });
    await staff.createPayment({ ...input, action: 'cash', amountMinor: 5_000 });
    expect((await staff.getPaymentState(input)).manualPaidMinor).toBe(6_000);
  });

  it('K2: cash paid again after a full refund credits the appointment again', async () => {
    const { staff } = harness();
    await staff.createPayment({ ...input, action: 'cash', amountMinor: 10_000, idempotencyKey: 'first-collection' });
    await staff.refundPayment({ ...input, method: 'cash', amountMinor: 10_000 });
    // Owner correction F2: a deliberate new payment has a new request identity, even at the same amount.
    await staff.createPayment({ ...input, action: 'cash', amountMinor: 10_000, idempotencyKey: 'second-collection' });
    expect((await staff.getPaymentState(input)).remainingMinor).toBe(0);
  });

  it('K2: simultaneous different cash amounts cannot overcollect the appointment', async () => {
    const { staff } = harness();
    await Promise.all([
      staff.createPayment({ ...input, action: 'cash', amountMinor: 6_000 }),
      staff.createPayment({ ...input, action: 'cash', amountMinor: 5_000 }),
    ]);
    expect((await staff.getPaymentState(input)).manualPaidMinor).toBeLessThanOrEqual(10_000);
  });

  it('K4: refunding the first slot leaves the other paid slot refundable', async () => {
    const { payments, externalRefunds } = harness(20_000, 2);
    await payments.refundAppointmentPayment({ organizationId: org, appointmentId: 'a', amountMinor: 10_000 });
    await payments.refundAppointmentPayment({ organizationId: org, appointmentId: 'b', amountMinor: 10_000 });
    expect([...externalRefunds.values()].reduce((sum, amount) => sum + amount, 0)).toBe(20_000);
  });

  it('K3: concurrent provider retry records only the money actually returned', async () => {
    const { staff, externalRefunds } = harness(10_000);
    await Promise.all([
      staff.refundPayment({ ...input, method: 'auto', amountMinor: 3_000 }),
      staff.refundPayment({ ...input, method: 'auto', amountMinor: 3_000 }),
    ]);
    expect([...externalRefunds.values()].reduce((sum, amount) => sum + amount, 0)).toBe(3_000);
    expect((await staff.getPaymentState(input)).remainingMinor).toBe(3_000);
  });

  it('K6: cash refund of online money cannot then be refunded again online', async () => {
    const { staff, externalRefunds } = harness(10_000);
    await staff.refundPayment({ ...input, method: 'cash', amountMinor: 10_000 });
    await staff.refundPayment({ ...input, method: 'auto', amountMinor: 10_000 }).catch(() => undefined);
    expect([...externalRefunds.values()].reduce((sum, amount) => sum + amount, 0)).toBe(0);
  });
});
