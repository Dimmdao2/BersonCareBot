import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStaffAppointmentPaymentsService } from './staffAppointmentPayments';

/**
 * PAY-APPT-05/06: «Из деталей врач может создать/повторно получить ссылку и QR-код на оплату»
 * рядом со строкой «требуемая предоплата».
 *
 * Что ломается без этих проверок. Сумма счёта считалась как стоимость записи минус полученное и
 * ничего не знала о снимке предоплаты. Врач создаёт запись с предоплатой 30 % от 2500 ₽, карточка
 * честно показывает 750 ₽ — а ссылка и QR приходят пациенту на 2500 ₽. Пациентская дверь с той же
 * политикой при этом создаёт намерение на 750 ₽: одно состояние, две двери, три числа. Отказ
 * тихий: платёж проходит, и человек платит втрое больше показанного.
 */
const SNAPSHOT_APPOINTMENT = '55555555-5555-4555-8555-555555555555';
const PATIENT = '22222222-2222-4222-8222-222222222222';

const fakes = vi.hoisted(() => ({
  getAppointmentPaymentSummary: vi.fn(),
  createAppointmentPaymentIntent: vi.fn(),
  getBookingByCanonicalAppointment: vi.fn(),
  listAppointmentPayments: vi.fn(),
  addCashPayment: vi.fn(),
  listAppointmentFinancialSnapshots: vi.fn(),
}));

function snapshot(over: Record<string, unknown> = {}) {
  return {
    appointmentId: SNAPSHOT_APPOINTMENT,
    priceMinor: 250_000,
    priceCurrency: 'RUB',
    prepaymentMode: 'percent',
    prepaymentPercentBps: 3000,
    prepaymentRequiredMinor: 75_000,
    prepaymentPaidMinor: 0,
    paymentDeadlineAt: '2026-09-06T10:20:00.000Z',
    ...over,
  };
}

function service() {
  return createStaffAppointmentPaymentsService({
    payments: {
      getAppointmentPaymentSummary: fakes.getAppointmentPaymentSummary,
      createAppointmentPaymentIntent: fakes.createAppointmentPaymentIntent,
    } as never,
    patientBooking: { getBookingByCanonicalAppointment: fakes.getBookingByCanonicalAppointment },
    patientPayments: {
      listAppointmentPayments: fakes.listAppointmentPayments,
      addCashPayment: fakes.addCashPayment,
    },
    bookingEngine: { listAppointmentFinancialSnapshots: fakes.listAppointmentFinancialSnapshots },
  });
}

const INPUT = {
  organizationId: 'org-1',
  appointmentId: SNAPSHOT_APPOINTMENT,
  platformUserId: PATIENT,
  createdBy: 'user-doc-1',
  returnUrl: 'https://example.test/purchases',
};

describe('счёт и наличные из деталей записи', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.getAppointmentPaymentSummary.mockResolvedValue({
      appointmentId: SNAPSHOT_APPOINTMENT,
      appointmentStatus: 'awaiting_payment',
      prepaymentQuote: null,
      intent: null,
      payment: null,
      history: [],
    });
    // Историческая проекция несёт ДРУГУЮ цену: если дверь читает её, а не снимок, это видно сразу.
    fakes.getBookingByCanonicalAppointment.mockResolvedValue({
      bookingType: 'offline',
      category: null,
      priceMinorSnapshot: 900_000,
    });
    fakes.listAppointmentPayments.mockResolvedValue([]);
    fakes.listAppointmentFinancialSnapshots.mockResolvedValue([snapshot()]);
    fakes.createAppointmentPaymentIntent.mockResolvedValue({
      checkoutUrl: 'https://pay.test/abc',
    });
    fakes.addCashPayment.mockResolvedValue({ id: 'payment-1' });
  });

  it('ссылка выставляется на требуемую предоплату из снимка, а не на полную стоимость', async () => {
    const result = await service().createPayment({ ...INPUT, action: 'link' });

    expect(result).toMatchObject({ ok: true, paymentLink: 'https://pay.test/abc' });
    expect(fakes.createAppointmentPaymentIntent).toHaveBeenCalledTimes(1);
    const intent = fakes.createAppointmentPaymentIntent.mock.calls[0][0];
    expect(intent.amountMinor).toBe(75_000);
    // Показанное и созданное обязаны совпадать: карточка рисует ровно это число снимка.
    expect(intent.amountMinor).toBe(snapshot().prepaymentRequiredMinor);
    // Ключ идемпотентности следует за суммой намерения, иначе повтор создаст счёт на прежнюю сумму.
    expect(intent.idempotencyKey).toContain('75000');
  });

  it('частично внесённая предоплата уменьшает счёт до непокрытого остатка', async () => {
    fakes.listAppointmentFinancialSnapshots.mockResolvedValue([
      snapshot({ prepaymentPaidMinor: 25_000 }),
    ]);

    await service().createPayment({ ...INPUT, action: 'link' });

    expect(fakes.createAppointmentPaymentIntent.mock.calls[0][0].amountMinor).toBe(50_000);
  });

  it('без требования предоплаты счёт выставляется на остаток стоимости записи', async () => {
    fakes.listAppointmentFinancialSnapshots.mockResolvedValue([
      snapshot({ prepaymentMode: 'disabled', prepaymentPercentBps: null, prepaymentRequiredMinor: 0 }),
    ]);

    await service().createPayment({ ...INPUT, action: 'link' });

    expect(fakes.createAppointmentPaymentIntent.mock.calls[0][0].amountMinor).toBe(250_000);
  });

  it('полностью внесённая предоплата не создаёт второе намерение', async () => {
    fakes.listAppointmentFinancialSnapshots.mockResolvedValue([
      snapshot({ prepaymentPaidMinor: 75_000 }),
    ]);

    const result = await service().createPayment({ ...INPUT, action: 'link' });

    expect(result).toEqual({ ok: false, error: 'already_paid' });
    expect(fakes.createAppointmentPaymentIntent).not.toHaveBeenCalled();
  });

  it('наличные принимаются дверью записи: без её идентификатора требование не погасить', async () => {
    await service().createPayment({ ...INPUT, action: 'cash' });

    const cash = fakes.addCashPayment.mock.calls[0][0];
    expect(cash.appointmentId).toBe(SNAPSHOT_APPOINTMENT);
    expect(cash.idempotencyKey).toBeTruthy();
    // Касса берёт остаток стоимости приёма, а не только предоплату.
    expect(cash.amountMinor).toBe(250_000);
  });

  it('снимок записи побеждает историческую проекцию в стоимости', async () => {
    const state = await service().getPaymentState(INPUT);
    expect(state.totalMinor).toBe(250_000);
    expect(state.prepaymentRequiredMinor).toBe(75_000);
  });
});
