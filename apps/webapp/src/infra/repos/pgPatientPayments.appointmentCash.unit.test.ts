import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PAY-APPT-11/12: наличные по записи гасят требование предоплаты В ТОМ ЖЕ коммите, что и строку
 * кассового журнала.
 *
 * Что ломается без этой проверки. Касса писала только `patient_payment`, а запись оставалась в
 * `awaiting_payment` с нулём зачисленного — и минутный тик истечения отменял её как
 * `cancelled_by_specialist`, освобождая слот. Человек заплатил в кассе и остался без приёма, а в
 * календаре это выглядит отменой клиникой. Тем же нулём оставался открытым и замок на
 * переписывание финансовых значений: после кассы врач всё ещё мог переписать стоимость.
 *
 * Разложить это на «сначала журнал, потом запись» нельзя: именованный корень не стартует внутри
 * уже открытой реляционной транзакции, поэтому два коммита оставили бы то же окно. Поэтому дверь
 * одна — и проверяется здесь именно она, а не форма SQL внутри неё.
 */
const fakes = vi.hoisted(() => ({
  runWebappNamedRoot: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipal: () => ({ kind: 'staff' }),
  getCurrentDbPrincipalOrganizationId: () => 'org-1',
}));
vi.mock('@/app-layer/db/drizzle', () => ({ getDrizzle: vi.fn() }));
vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: vi.fn(),
  getWebappSqlFromPgClient: vi.fn(),
  runWebappNamedRoot: fakes.runWebappNamedRoot,
  runWebappSql: vi.fn(),
}));
vi.mock('@/infra/db/withClient', () => ({ withTransaction: fakes.withTransaction }));

import { createPgPatientPaymentsPort } from './pgPatientPayments';

const APPOINTMENT_ID = '55555555-5555-4555-8555-555555555555';
const PATIENT = '22222222-2222-4222-8222-222222222222';

function ledgerRow(over: Record<string, unknown> = {}) {
  return {
    id: 'payment-1',
    organization_id: 'org-1',
    patient_user_id: PATIENT,
    amount_minor: 250_000,
    currency: 'RUB',
    kind: 'cash',
    status: 'paid',
    comment: null,
    service: null,
    visit_id: null,
    appointment_id: APPOINTMENT_ID,
    patient_package_id: null,
    idempotency_key: 'staff-appointment-cash:x:250000',
    provider: null,
    provider_payment_id: null,
    created_by: 'user-doc-1',
    created_at: '2026-09-06T10:05:00.000Z',
    ...over,
  };
}

const CASH_INPUT = {
  organizationId: 'org-1',
  patientUserId: PATIENT,
  amountMinor: 250_000,
  currency: 'RUB',
  appointmentId: APPOINTMENT_ID,
  idempotencyKey: 'staff-appointment-cash:x:250000',
  createdBy: 'user-doc-1',
};

describe('наличные по записи', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.runWebappNamedRoot.mockResolvedValue({
      rows: [{ settlement: { payment: ledgerRow(), credited: true, appointmentStatus: 'confirmed' } }],
    });
  });

  it('идут одной дверью, которая одновременно зачисляет предоплату на запись', async () => {
    const payment = await createPgPatientPaymentsPort().addCashPayment(CASH_INPUT);

    expect(fakes.withTransaction).not.toHaveBeenCalled();
    expect(fakes.runWebappNamedRoot).toHaveBeenCalledTimes(1);
    const [, identity, args] = fakes.runWebappNamedRoot.mock.calls[0];
    expect(identity).toBe('app.settle_appointment_cash_prepayment(text)');
    expect(JSON.parse(args[0] as string)).toMatchObject({
      organizationId: 'org-1',
      appointmentId: APPOINTMENT_ID,
      patientUserId: PATIENT,
      amountMinor: 250_000,
      idempotencyKey: 'staff-appointment-cash:x:250000',
      createdBy: 'user-doc-1',
    });
    expect(payment).toMatchObject({
      id: 'payment-1',
      appointmentId: APPOINTMENT_ID,
      amountMinor: 250_000,
      kind: 'cash',
      status: 'paid',
    });
  });

  it('отказ двери не выдаёт себя за проведённый платёж', async () => {
    fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ settlement: null }] });

    await expect(createPgPatientPaymentsPort().addCashPayment(CASH_INPUT)).rejects.toThrow(
      'appointment_cash_settlement_failed',
    );
  });

  it('наличные без записи гасить нечего: прежний реляционный путь не тронут', async () => {
    fakes.withTransaction.mockImplementation(async () => ({
      id: 'payment-2',
      organizationId: 'org-1',
      patientUserId: PATIENT,
      amountMinor: 100_000,
      currency: 'RUB',
      kind: 'cash',
      status: 'paid',
      comment: null,
      service: null,
      visitId: null,
      appointmentId: null,
      patientPackageId: null,
      idempotencyKey: null,
      provider: null,
      providerPaymentId: null,
      createdBy: 'user-doc-1',
      createdAt: '2026-09-06T10:05:00.000Z',
    }));

    const payment = await createPgPatientPaymentsPort().addCashPayment({
      organizationId: 'org-1',
      patientUserId: PATIENT,
      amountMinor: 100_000,
      createdBy: 'user-doc-1',
    });

    expect(fakes.runWebappNamedRoot).not.toHaveBeenCalled();
    expect(fakes.withTransaction).toHaveBeenCalledTimes(1);
    expect(payment.appointmentId).toBeNull();
  });
});
