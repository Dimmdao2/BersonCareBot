import { describe, expect, it, vi } from 'vitest';
import { createBookingOnCanonicalEngine, type CanonicalBookingDeps } from './canonicalCreate';
import type { CreatePatientBookingInput, PatientBookingRecord } from './types';

/**
 * D14, часть 4: вебапп при создании записи (`booking.created`) должен прислать интегратору
 * `cancelPendingReminders` и `patientMessageText` — раньше эти поля отсутствовали в событии,
 * и решение фактически принимал интегратор своими значениями по умолчанию.
 */

function fakeRecord(overrides: Partial<PatientBookingRecord> = {}): PatientBookingRecord {
  return {
    id: 'booking-1',
    organizationId: 'org-1',
    userId: 'user-1',
    bookingType: 'online',
    city: null,
    category: 'general',
    slotStart: '2027-03-10T09:00:00.000Z',
    slotEnd: '2027-03-10T09:30:00.000Z',
    status: 'confirmed',
    cancelledAt: null,
    cancelReason: null,
    gcalEventId: null,
    contactPhone: '+79990000000',
    contactEmail: null,
    contactName: 'Пациент',
    reminder24hSent: false,
    reminder2hSent: false,
    createdAt: '2027-03-01T00:00:00.000Z',
    updatedAt: '2027-03-01T00:00:00.000Z',
    branchServiceId: null,
    branchId: null,
    serviceId: null,
    cityCodeSnapshot: null,
    branchTitleSnapshot: null,
    serviceTitleSnapshot: null,
    durationMinutesSnapshot: 60,
    priceMinorSnapshot: null,
    canonicalAppointmentId: 'appt-1',
    provenanceCreatedBy: null,
    provenanceUpdatedBy: null,
    ...overrides,
  };
}

function buildDeps(
  emitBookingEvent: (input: unknown) => Promise<void>,
  overrides: Partial<CanonicalBookingDeps> = {},
): CanonicalBookingDeps {
  const record = fakeRecord();
  const bookingsPort = {
    createPending: vi.fn(async () => record),
    markConfirmed: vi.fn(async () => record),
    markFailedSync: vi.fn(async () => undefined),
  };
  const bookingScheduling = {
    assertSlotAvailable: vi.fn(async () => undefined),
    getMaxConsecutiveSlotHours: vi.fn(async () => 8),
    // PAY-APPT-07: срок ожидания оплаты — настройка клиники, её читает канонический create.
    getPrepaymentWaitMinutes: vi.fn(async () => 20),
  };
  const bookingEngine = {
    createOnlineAppointmentsIfAvailable: vi.fn(async () => [
      {
        id: 'appt-1',
        organizationId: 'org-1',
        startAt: record.slotStart,
        endAt: record.slotEnd,
      },
    ]),
  };
  return {
    // Постановка письма в очередь: в этих тестах доставка не проверяется, но порт обязателен —
    // запись без пути доставки подтверждения неполна, поэтому он не необязательный.
    outboundMessageQueue: { enqueue: async () => true },
    bookingsPort: bookingsPort as unknown as CanonicalBookingDeps['bookingsPort'],
    syncPort: { emitBookingEvent } as unknown as CanonicalBookingDeps['syncPort'],
    bookingEngine: bookingEngine as unknown as CanonicalBookingDeps['bookingEngine'],
    bookingScheduling: bookingScheduling as unknown as CanonicalBookingDeps['bookingScheduling'],
    bookingForm: null,
    payments: null,
    canAcceptBookingPrepayment: async () => false,
    memberships: null,
    clientHistory: null,
    ...overrides,
  };
}

const createInput: CreatePatientBookingInput = {
  type: 'online',
  userId: 'user-1',
  organizationId: 'org-1',
  category: 'general',
  slotStart: '2027-03-10T09:00:00.000Z',
  slotEnd: '2027-03-10T09:30:00.000Z',
  contactName: 'Пациент',
  contactPhone: '+79990000000',
  mailProfile: { kind: 'platform', senderDisplayName: 'Therapygo' },
};

describe('booking.created: пациентское сообщение ставит вебапп, а не событие интегратора', () => {
  it('пациент получает ровно одно сообщение — строкой очереди доставки', async () => {
    const enqueued: Array<Record<string, unknown>> = [];
    const events: Array<Record<string, unknown>> = [];
    const deps = buildDeps(
      async (input) => {
        events.push((input as { payload: Record<string, unknown> }).payload);
      },
      {
        getAppDisplayTimeZone: async () => 'Europe/Moscow',
        outboundMessageQueue: {
          enqueue: async (context) => {
            enqueued.push(context as unknown as Record<string, unknown>);
            return true;
          },
        },
        bookingCreatedEffects: {
          apply: async (input) => {
            enqueued.push({
              purpose: 'booking.created.patient',
              notifyPatient: input.notifyPatient,
              text: `Запись подтверждена: ${input.slotStart}`,
            });
          },
        },
      },
    );

    await createBookingOnCanonicalEngine(deps, createInput);

    // Человек получает сообщение ОДИН раз и по одному маршруту: его ставит вебапп.
    expect(enqueued.filter((row) => row.purpose === 'booking.created.patient')).toHaveLength(1);
    // Событие интегратора этого сообщения больше не несёт и просит его не отправлять.
    expect(events).toHaveLength(1);
    expect(events[0]!.patientMessageText).toBeUndefined();
    expect(events[0]!.suppressPatientNotification).toBe(true);
    expect(events[0]!.cancelPendingReminders).toBe(true);
  });

  it('выключенное настройкой клиники пациентское уведомление не ставится в очередь', async () => {
    const applied: Array<{ notifyPatient: boolean }> = [];
    const deps = buildDeps(async () => undefined, {
      getBookingLifecycleNotificationSettings: async () => ({
        events: {
          'booking.created': { enabled: true, notifyPatient: false, notifyStaff: true },
          'booking.cancelled': { enabled: true, notifyPatient: true, notifyStaff: true },
          'booking.rescheduled': { enabled: true, notifyPatient: true, notifyStaff: true },
          'booking.payment_captured': { enabled: true, notifyPatient: true, notifyStaff: true },
        },
      }),
      bookingCreatedEffects: {
        apply: async (input) => {
          applied.push({ notifyPatient: input.notifyPatient });
        },
      },
    });

    await createBookingOnCanonicalEngine(deps, createInput);

    expect(applied).toEqual([{ notifyPatient: false }]);
  });
});

describe('UI-06 canonical patient online booking', () => {
  /**
   * Owner oracle UI-06 / Flow G: an online patient booking has no branch_id on its canonical
   * appointment, so the online format must travel as an explicit create value. Losing it makes a
   * successful patient online booking indistinguishable from an in-person appointment.
   */
  it('persists online as the canonical delivery format for a branchless patient booking', async () => {
    const createOnlineAppointmentsIfAvailable = vi.fn(async () => [
      { id: 'appt-1', organizationId: 'org-1', startAt: createInput.slotStart, endAt: createInput.slotEnd },
    ]);
    const deps = buildDeps(async () => undefined, {
      bookingEngine: {
        createOnlineAppointmentsIfAvailable,
      } as unknown as CanonicalBookingDeps['bookingEngine'],
    });

    await createBookingOnCanonicalEngine(deps, createInput);

    const [appointments] = createOnlineAppointmentsIfAvailable.mock.calls[0] as unknown as [
      Array<Record<string, unknown>>,
    ];
    expect(appointments[0]).toMatchObject({
      branchId: null,
      deliveryFormat: 'online',
    });
  });
});

describe('D14, часть 5: booking.created отправляет doctorNotify/doctorMessageText/calendarAction/calendarTitleMarker', () => {
  it('кладёт врачебный текст и действие/пометку календаря для нового события', async () => {
    const events: Array<Record<string, unknown>> = [];
    const deps = buildDeps(
      async (input) => {
        events.push((input as { payload: Record<string, unknown> }).payload);
      },
      { getAppDisplayTimeZone: async () => 'Europe/Moscow' },
    );

    await createBookingOnCanonicalEngine(deps, createInput);

    expect(events).toHaveLength(1);
    expect(events[0]!.doctorNotify).toBe(true);
    expect(typeof events[0]!.doctorMessageText).toBe('string');
    expect((events[0]!.doctorMessageText as string).length).toBeGreaterThan(0);
    expect(events[0]!.calendarAction).toBe('created');
    expect(events[0]!.calendarTitleMarker).toBe('none');
  });
});

describe('§5a/2.1c: booking prepayment is patient money, not the clinic tariff payment', () => {
  it('keeps an existing prepayment for a public booking while the clinic is read-only', async () => {
    // PAY-APPT-04: пациентская половина больше не спрашивает готовую сумму — она берёт ПОЛИТИКУ и
    // считает снимок тем же доменным расчётом, что и врачебная. Оракул тот же: деньги пациента
    // берутся и при read-only клинике.
    const getPrepaymentPolicyForBooking = vi.fn(async () => ({
      id: 'policy-1',
      organizationId: 'org-1',
      serviceId: null,
      onlineCategory: null,
      mode: 'fixed_minor',
      amountMinor: 5_000,
      percentBps: null,
      currency: 'RUB',
      isActive: true,
    }));
    const createAppointmentPaymentIntent = vi.fn();
    const deps = buildDeps(async () => undefined, {
      payments: {
        getPrepaymentPolicyForBooking,
        getSettings: vi.fn(async () => ({ enabled: true })),
        createAppointmentPaymentIntent,
      } as unknown as CanonicalBookingDeps['payments'],
      canAcceptBookingPrepayment: async () => true,
    });
    const bookingsPort = deps.bookingsPort as unknown as {
      markAwaitingPayment: ReturnType<typeof vi.fn>;
    };
    bookingsPort.markAwaitingPayment = vi.fn(async () => fakeRecord({ status: 'awaiting_payment' }));

    const result = await createBookingOnCanonicalEngine(deps, {
      ...createInput,
      bookingChannel: 'public_widget',
    });

    expect(result.status).toBe('awaiting_payment');
    expect(getPrepaymentPolicyForBooking).toHaveBeenCalledOnce();
    expect(createAppointmentPaymentIntent).toHaveBeenCalledOnce();
  });

  it('confirms the booking without requesting or accepting prepayment when the mechanic is disabled', async () => {
    const getPrepaymentPolicyForBooking = vi.fn();
    const createAppointmentPaymentIntent = vi.fn();
    const deps = buildDeps(async () => undefined, {
      payments: {
        getPrepaymentPolicyForBooking,
        getSettings: vi.fn(async () => ({ enabled: true })),
        createAppointmentPaymentIntent,
      } as unknown as CanonicalBookingDeps['payments'],
      canAcceptBookingPrepayment: async () => false,
    });

    const result = await createBookingOnCanonicalEngine(deps, createInput);

    expect(result.status).toBe('confirmed');
    expect(getPrepaymentPolicyForBooking).not.toHaveBeenCalled();
    expect(createAppointmentPaymentIntent).not.toHaveBeenCalled();
    expect(deps.bookingsPort.markConfirmed).toHaveBeenCalledTimes(1);
  });

  /**
   * PAY-APPT-04/07/08/18. Oracle — требование владельца: «снимок стоимости, условие/сумма
   * предоплаты, дедлайн и платёжный статус имеют один канонический write-path».
   *
   * Что ломается без этой проверки: пациентская половина продолжает считать предоплату «на
   * лету», а В САМОЙ записи финансовых значений не остаётся. Тогда истечение срока (оно
   * смотрит только на `payment_deadline_at` и `prepayment_required_minor` записи) не находит
   * ни одной строки — неоплаченное ожидание держит слот вечно, и к врачу на это время не
   * записывается никто. Отказ полностью тихий: create возвращает 200, запись в календаре
   * есть, а срок оплаты не наступает никогда.
   *
   * Мутация, которой проверена красность: из `canonicalCreate` удалены финансовые поля
   * `priceMinor…paymentDeadlineAt` во входе создания записи — падают оба утверждения ниже.
   */
  it('кладёт снимок и точный срок оплаты В САМУ запись, а не только в платёжное намерение', async () => {
    const getPrepaymentPolicyForBooking = vi.fn(async () => ({
      id: 'policy-1',
      organizationId: 'org-1',
      serviceId: null,
      onlineCategory: null,
      mode: 'fixed_minor',
      amountMinor: 5_000,
      percentBps: null,
      currency: 'RUB',
      isActive: true,
    }));
    const createOnlineAppointmentsIfAvailable = vi.fn(async () => [
      { id: 'appt-1', organizationId: 'org-1', startAt: createInput.slotStart, endAt: createInput.slotEnd },
    ]);
    // Клиника ждёт предоплату 45 минут — значение НЕ равно платформенному умолчанию, поэтому
    // хардкод «20 минут» этой проверки не переживёт.
    const getPrepaymentWaitMinutes = vi.fn(async () => 45);
    const deps = buildDeps(async () => undefined, {
      payments: {
        getPrepaymentPolicyForBooking,
        getSettings: vi.fn(async () => ({ enabled: true })),
        createAppointmentPaymentIntent: vi.fn(async () => ({ checkoutUrl: null })),
      } as unknown as CanonicalBookingDeps['payments'],
      canAcceptBookingPrepayment: async () => true,
      bookingEngine: {
        createOnlineAppointmentsIfAvailable,
      } as unknown as CanonicalBookingDeps['bookingEngine'],
      bookingScheduling: {
        assertSlotAvailable: vi.fn(async () => undefined),
        getMaxConsecutiveSlotHours: vi.fn(async () => 8),
        getPrepaymentWaitMinutes,
      } as unknown as CanonicalBookingDeps['bookingScheduling'],
    });

    const awaitingPort = deps.bookingsPort as unknown as {
      markAwaitingPayment: ReturnType<typeof vi.fn>;
    };
    awaitingPort.markAwaitingPayment = vi.fn(async () => fakeRecord({ status: 'awaiting_payment' }));

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-03-01T12:00:00.000Z'));
    try {
      await createBookingOnCanonicalEngine(deps, createInput);
    } finally {
      vi.useRealTimers();
    }

    const persisted = (
      createOnlineAppointmentsIfAvailable.mock.calls[0] as unknown as [
        Array<Record<string, unknown>>,
      ]
    )[0];
    expect(persisted[0]).toMatchObject({
      status: 'awaiting_payment',
      prepaymentMode: 'fixed_minor',
      prepaymentAmountMinor: 5_000,
      prepaymentRequiredMinor: 5_000,
      priceCurrency: 'RUB',
      // 12:00 + 45 минут настройки клиники, посчитано один раз в момент создания.
      paymentDeadlineAt: '2027-03-01T12:45:00.000Z',
    });
    expect(getPrepaymentWaitMinutes).toHaveBeenCalledWith('org-1');
  });

  /**
   * PAY-APPT-04: пациент не подаёт финансовых значений вовсе. Контракт создания пациентской
   * записи их не принимает, а снимок выводится из политики клиники — проверяем именно это:
   * посторонние поля в пользовательском вводе не доезжают до записи.
   */
  it('не принимает финансовые значения от пациента: снимок выводится из политики клиники', async () => {
    const getPrepaymentPolicyForBooking = vi.fn(async () => ({
      id: 'policy-1',
      organizationId: 'org-1',
      serviceId: null,
      onlineCategory: null,
      mode: 'fixed_minor',
      amountMinor: 5_000,
      percentBps: null,
      currency: 'RUB',
      isActive: true,
    }));
    const createOnlineAppointmentsIfAvailable = vi.fn(async () => [
      { id: 'appt-1', organizationId: 'org-1', startAt: createInput.slotStart, endAt: createInput.slotEnd },
    ]);
    const deps = buildDeps(async () => undefined, {
      payments: {
        getPrepaymentPolicyForBooking,
        getSettings: vi.fn(async () => ({ enabled: true })),
        createAppointmentPaymentIntent: vi.fn(async () => ({ checkoutUrl: null })),
      } as unknown as CanonicalBookingDeps['payments'],
      canAcceptBookingPrepayment: async () => true,
      bookingEngine: {
        createOnlineAppointmentsIfAvailable,
      } as unknown as CanonicalBookingDeps['bookingEngine'],
    });

    const awaitingPort2 = deps.bookingsPort as unknown as {
      markAwaitingPayment: ReturnType<typeof vi.fn>;
    };
    awaitingPort2.markAwaitingPayment = vi.fn(async () => fakeRecord({ status: 'awaiting_payment' }));

    await createBookingOnCanonicalEngine(deps, {
      ...createInput,
      // Пациент «просит» свою цену и своё условие предоплаты — контракт таких полей не знает.
      ...({ priceMinor: 1, prepaymentRequiredMinor: 1, prepaymentMode: 'disabled' } as object),
    } as CreatePatientBookingInput);

    const persisted = (
      createOnlineAppointmentsIfAvailable.mock.calls[0] as unknown as [
        Array<Record<string, unknown>>,
      ]
    )[0];
    expect(persisted[0]!.prepaymentRequiredMinor).toBe(5_000);
    expect(persisted[0]!.prepaymentMode).toBe('fixed_minor');
    expect(persisted[0]!.status).toBe('awaiting_payment');
  });
});
