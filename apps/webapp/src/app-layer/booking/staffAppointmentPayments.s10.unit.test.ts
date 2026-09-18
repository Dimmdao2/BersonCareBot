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

function harness(onlineMinor = 0, slots = 1) {
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
    id, organizationId: org, paymentRef: onlineMinor ? payment.id : null, serviceId: null, status: 'confirmed',
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
      providers: [{ id: 'yookassa', label: 'YooKassa', enabled: true, shopId: 'sandbox', apiKey: 'test-only' }] }) },
    bookingEngine: { getAppointment: async (id) => appointment(id), listAppointmentsByChainId: async () => [], transitionAppointmentStatus: vi.fn() },
    captureUnitOfWork: { run: async (_org, fn) => fn(), runSerializedPostCommit: async (_org, _key, fn) => fn() },
  });
  const staff = createStaffAppointmentPaymentsService({ payments,
    patientBooking: { getBookingByCanonicalAppointment: vi.fn(async () => ({ serviceTitleSnapshot: 'Visit', priceMinorSnapshot: 10_000 } as PatientBookingRecord)) },
    patientPayments: inMemoryPatientPaymentsPort,
    bookingEngine: { listAppointmentFinancialSnapshots: async (_org, ids) => ids.map(appointmentId => ({
      appointmentId, priceMinor: 10_000, priceCurrency: 'RUB', prepaymentMode: 'fixed_minor',
      prepaymentRequiredMinor: 10_000, prepaymentPaidMinor: onlineMinor / slots, paymentDeadlineAt: null,
      prepaymentPercentBps: null, prepaymentAmountMinor: 10_000,
    } satisfies AppointmentFinancialSnapshotRecord)) },
  });
  return { staff, payments, externalRefunds };
}

beforeEach(() => { __resetInMemoryPatientPaymentsForTest(); vi.clearAllMocks(); });

describe('S10 independent money acceptance', () => {
  it('K1: collected cash cannot exceed the remaining appointment debt', async () => {
    const { staff } = harness();
    await staff.createPayment({ ...input, action: 'cash', amountMinor: 6_000 });
    await staff.createPayment({ ...input, action: 'cash', amountMinor: 5_000 });
    expect((await staff.getPaymentState(input)).manualPaidMinor).toBe(6_000);
  });

  it('K2: cash paid again after a full refund credits the appointment again', async () => {
    const { staff } = harness();
    await staff.createPayment({ ...input, action: 'cash', amountMinor: 10_000 });
    await staff.refundPayment({ ...input, method: 'cash', amountMinor: 10_000 });
    await staff.createPayment({ ...input, action: 'cash', amountMinor: 10_000 });
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
