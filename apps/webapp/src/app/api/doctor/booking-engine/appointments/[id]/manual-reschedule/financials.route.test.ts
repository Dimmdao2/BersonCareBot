import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PAY-APPT-02/03/12: власть врача над деньгами записи и её граница.
 *
 * Оракул — требование владельца: «до оплаты авторизованная правка пересчитывает значения
 * детерминированно; после состоявшихся или удержанных денег финансовые значения не могут быть
 * молча переписаны».
 *
 * Что ломается без этой проверки. Замок денег стоит в одном месте — на пути правки записи. Снять
 * его (или поставить ПОСЛЕ записи снимка) — и врач правкой времени переписывает стоимость уже
 * оплаченной записи: пациент заплатил 2500 ₽ за приём, который в базе теперь стоит 800 ₽, а
 * разницу никто не увидит — история правки хранит только новое значение. Отказ тихий: запрос
 * возвращает 200, календарь рисуется, расхождение всплывает при сверке кассы.
 *
 * Проверяется ПОВЕДЕНИЕ ручки, а не форма кода: расчёт снимка идёт настоящий
 * (`resolveStaffAppointmentFinancials` не подменён), подменены только вход в БД и соседние
 * эффекты жизненного цикла.
 */

const fakes = vi.hoisted(() => ({
  requireDoctorBookingEngine: vi.fn(),
  resolveDoctorAppointmentAccess: vi.fn(),
  buildAppDeps: vi.fn(),
  staffReschedule: vi.fn(),
  updateAppointmentFinancialSnapshot: vi.fn(),
  transitionAppointmentStatus: vi.fn(),
  getService: vi.fn(),
  getSettings: vi.fn(),
  getPrepaymentPolicyForBooking: vi.fn(),
  getPrepaymentWaitMinutes: vi.fn(),
  mechanicAvailability: vi.fn(),
  applyStaffRescheduleSideEffects: vi.fn(),
  recordReschedulePaymentCarryOver: vi.fn(),
}));

vi.mock('../../../_requireDoctorBookingEngine', () => ({
  requireDoctorBookingEngine: fakes.requireDoctorBookingEngine,
}));
vi.mock('../../../_resolveDoctorAppointmentAccess', () => ({
  resolveDoctorAppointmentAccess: fakes.resolveDoctorAppointmentAccess,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: (_ws: unknown, _s: string, fn: () => Promise<unknown>) => fn(),
}));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  getMechanicMutationAvailability: fakes.mechanicAvailability,
}));
vi.mock('@/app-layer/booking/staffAppointmentLifecycleEffects', () => ({
  applyStaffRescheduleSideEffects: fakes.applyStaffRescheduleSideEffects,
}));
vi.mock('@/modules/integrator/bookingM2mApi', () => ({ createBookingSyncPort: vi.fn() }));
vi.mock('@/modules/booking-notifications/settings', () => ({
  loadBookingLifecycleNotificationsFromSystemSettings: async () => ({}),
}));

import { POST } from './route';

const APPOINTMENT_ID = '55555555-5555-4555-8555-555555555555';
const SERVICE_ID = '44444444-4444-4444-8444-444444444444';

function appointment(over: Record<string, unknown> = {}) {
  return {
    id: APPOINTMENT_ID,
    organizationId: 'org-1',
    specialistId: '11111111-1111-4111-8111-111111111111',
    serviceId: SERVICE_ID,
    platformUserId: null,
    status: 'confirmed',
    paymentRef: null,
    priceMinor: 250_000,
    priceCurrency: 'RUB',
    prepaymentMode: 'disabled',
    prepaymentPercentBps: null,
    prepaymentAmountMinor: null,
    prepaymentRequiredMinor: 0,
    prepaymentPaidMinor: 0,
    appointmentReminderPresetId: null,
    phoneNormalized: null,
    ...over,
  };
}

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body) });
}

const BASE_BODY = {
  newStartAt: '2026-09-10T09:00:00.000Z',
  newEndAt: '2026-09-10T10:00:00.000Z',
  durationMinutes: 60,
};

describe('врачебная правка финансовых значений записи', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requireDoctorBookingEngine.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: 'org-1',
        session: { user: { userId: 'user-doc-1', role: 'doctor' } },
        service: {
          services: { getService: fakes.getService },
          updateAppointmentFinancialSnapshot: fakes.updateAppointmentFinancialSnapshot,
          transitionAppointmentStatus: fakes.transitionAppointmentStatus,
        },
      },
    });
    fakes.getService.mockResolvedValue({ id: SERVICE_ID, priceMinor: 900_000 });
    fakes.getSettings.mockResolvedValue({ enabled: true });
    fakes.getPrepaymentPolicyForBooking.mockResolvedValue(null);
    fakes.getPrepaymentWaitMinutes.mockResolvedValue(30);
    fakes.mechanicAvailability.mockResolvedValue({ available: true });
    fakes.applyStaffRescheduleSideEffects.mockResolvedValue(undefined);
    fakes.buildAppDeps.mockReturnValue({
      bookingAppointmentLifecycle: { staffReschedule: fakes.staffReschedule },
      payments: {
        getSettings: fakes.getSettings,
        getPrepaymentPolicyForBooking: fakes.getPrepaymentPolicyForBooking,
        recordReschedulePaymentCarryOver: fakes.recordReschedulePaymentCarryOver,
      },
      bookingScheduling: { getPrepaymentWaitMinutes: fakes.getPrepaymentWaitMinutes },
      patientBooking: null,
      systemSettings: { getSetting: vi.fn() },
    });
  });

  it('до оплаты пересчитывает требование детерминированно и переводит запись в ожидание оплаты', async () => {
    fakes.resolveDoctorAppointmentAccess.mockResolvedValue(appointment());
    fakes.staffReschedule.mockResolvedValue({ ok: true, appointment: appointment(), reschedulePolicy: null });
    fakes.updateAppointmentFinancialSnapshot.mockImplementation(async (input: {
      snapshot: Record<string, unknown>;
    }) => appointment({ ...input.snapshot, status: 'confirmed' }));
    fakes.transitionAppointmentStatus.mockResolvedValue(appointment({ status: 'awaiting_payment' }));

    const response = await POST(
      request({ ...BASE_BODY, priceMinor: 250_000, prepayment: { mode: 'percent', percentBps: 3000 } }),
      { params: Promise.resolve({ id: APPOINTMENT_ID }) },
    );

    expect(response.status).toBe(200);
    const written = fakes.updateAppointmentFinancialSnapshot.mock.calls[0][0].snapshot;
    // 2500,00 ₽ · 30 % = 750,00 ₽, ровно 75 000 копеек, и срок — 30 минут из настройки клиники.
    expect(written.priceMinor).toBe(250_000);
    expect(written.prepaymentRequiredMinor).toBe(75_000);
    expect(written.prepaymentPercentBps).toBe(3000);
    expect(typeof written.paymentDeadlineAt).toBe('string');
    expect(fakes.transitionAppointmentStatus.mock.calls[0][0].toStatus).toBe('awaiting_payment');
  });

  it('правка записи В ОЖИДАНИИ ОПЛАТЫ проходит и обновляет снимок, а не отказывает', async () => {
    // Ровно то состояние, ради которого работа затевалась: врач меняет цену ещё не оплаченной
    // записи. До исправления перенос вёл её через недопустимый переход и ручка отдавала 500 —
    // а другой двери для этой правки в системе нет.
    const awaiting = appointment({ status: 'awaiting_payment', prepaymentMode: 'percent',
      prepaymentPercentBps: 3000, prepaymentRequiredMinor: 75_000 });
    fakes.resolveDoctorAppointmentAccess.mockResolvedValue(awaiting);
    fakes.staffReschedule.mockResolvedValue({ ok: true, appointment: awaiting, reschedulePolicy: null });
    fakes.updateAppointmentFinancialSnapshot.mockImplementation(async (input: {
      snapshot: Record<string, unknown>;
    }) => appointment({ ...input.snapshot, status: 'awaiting_payment' }));

    const response = await POST(
      request({ ...BASE_BODY, priceMinor: 400_000, prepayment: { mode: 'percent', percentBps: 3000 } }),
      { params: Promise.resolve({ id: APPOINTMENT_ID }) },
    );

    expect(response.status).toBe(200);
    const written = fakes.updateAppointmentFinancialSnapshot.mock.calls[0][0].snapshot;
    expect(written.priceMinor).toBe(400_000);
    expect(written.prepaymentRequiredMinor).toBe(120_000);
    // Требование осталось — запись остаётся в ожидании, лишнего перехода нет.
    expect(fakes.transitionAppointmentStatus).not.toHaveBeenCalled();
  });

  it('снятое условие предоплаты выводит ожидающую запись в подтверждённую', async () => {
    const awaiting = appointment({ status: 'awaiting_payment', prepaymentMode: 'percent',
      prepaymentPercentBps: 3000, prepaymentRequiredMinor: 75_000 });
    fakes.resolveDoctorAppointmentAccess.mockResolvedValue(awaiting);
    fakes.staffReschedule.mockResolvedValue({ ok: true, appointment: awaiting, reschedulePolicy: null });
    fakes.updateAppointmentFinancialSnapshot.mockImplementation(async (input: {
      snapshot: Record<string, unknown>;
    }) => appointment({ ...input.snapshot, status: 'awaiting_payment' }));
    fakes.transitionAppointmentStatus.mockResolvedValue(appointment({ status: 'confirmed' }));

    const response = await POST(
      request({ ...BASE_BODY, prepayment: { mode: 'disabled' } }),
      { params: Promise.resolve({ id: APPOINTMENT_ID }) },
    );

    expect(response.status).toBe(200);
    const written = fakes.updateAppointmentFinancialSnapshot.mock.calls[0][0].snapshot;
    expect(written.prepaymentRequiredMinor).toBe(0);
    expect(written.paymentDeadlineAt).toBeNull();
    expect(fakes.transitionAppointmentStatus.mock.calls[0][0].toStatus).toBe('confirmed');
  });

  it('ручная цена не уезжает за подорожавшим каталогом', async () => {
    fakes.resolveDoctorAppointmentAccess.mockResolvedValue(appointment());
    fakes.staffReschedule.mockResolvedValue({ ok: true, appointment: appointment(), reschedulePolicy: null });
    fakes.updateAppointmentFinancialSnapshot.mockImplementation(async (input: {
      snapshot: Record<string, unknown>;
    }) => appointment({ ...input.snapshot }));

    // Услуга та же, цену врач не присылает, а каталог тем временем стоит 9000 ₽.
    await POST(request({ ...BASE_BODY, prepayment: { mode: 'full_price' } }), {
      params: Promise.resolve({ id: APPOINTMENT_ID }),
    });

    const written = fakes.updateAppointmentFinancialSnapshot.mock.calls[0][0].snapshot;
    expect(written.priceMinor).toBe(250_000);
    expect(written.prepaymentRequiredMinor).toBe(250_000);
  });

  it('без финансовых полей снимок не переписывается вовсе', async () => {
    fakes.resolveDoctorAppointmentAccess.mockResolvedValue(appointment());
    fakes.staffReschedule.mockResolvedValue({ ok: true, appointment: appointment(), reschedulePolicy: null });

    const response = await POST(request(BASE_BODY), {
      params: Promise.resolve({ id: APPOINTMENT_ID }),
    });

    expect(response.status).toBe(200);
    expect(fakes.updateAppointmentFinancialSnapshot).not.toHaveBeenCalled();
  });

  it('зачисленная предоплата запрещает переписывать деньги записи', async () => {
    const paid = appointment({ status: 'awaiting_payment', prepaymentPaidMinor: 75_000 });
    fakes.resolveDoctorAppointmentAccess.mockResolvedValue(paid);
    fakes.staffReschedule.mockResolvedValue({ ok: true, appointment: paid, reschedulePolicy: null });

    const response = await POST(request({ ...BASE_BODY, priceMinor: 80_000 }), {
      params: Promise.resolve({ id: APPOINTMENT_ID }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error: 'appointment_financials_locked' });
    expect(fakes.updateAppointmentFinancialSnapshot).not.toHaveBeenCalled();
  });

  it('удержанный платёж закрывает правку даже при нулевой зачисленной сумме', async () => {
    const held = appointment({ paymentRef: 'pay-1' });
    fakes.resolveDoctorAppointmentAccess.mockResolvedValue(held);
    fakes.staffReschedule.mockResolvedValue({ ok: true, appointment: held, reschedulePolicy: null });

    const response = await POST(
      request({ ...BASE_BODY, prepayment: { mode: 'disabled' } }),
      { params: Promise.resolve({ id: APPOINTMENT_ID }) },
    );

    expect(response.status).toBe(409);
    expect(fakes.updateAppointmentFinancialSnapshot).not.toHaveBeenCalled();
  });

  it('режима вне закрытого словаря врача не существует: фиксированная сумма отвергается', async () => {
    fakes.resolveDoctorAppointmentAccess.mockResolvedValue(appointment());
    const response = await POST(
      request({ ...BASE_BODY, prepayment: { mode: 'fixed_minor', amountMinor: 1 } }),
      { params: Promise.resolve({ id: APPOINTMENT_ID }) },
    );
    expect(response.status).toBe(400);
    expect(fakes.staffReschedule).not.toHaveBeenCalled();
  });

  it('дробная цена отвергается до всякой записи в базу', async () => {
    fakes.resolveDoctorAppointmentAccess.mockResolvedValue(appointment());
    const response = await POST(request({ ...BASE_BODY, priceMinor: 1000.5 }), {
      params: Promise.resolve({ id: APPOINTMENT_ID }),
    });
    expect(response.status).toBe(400);
    expect(fakes.staffReschedule).not.toHaveBeenCalled();
  });

  it('выключенная тарифом механика оплаты не даёт врачу создать требование предоплаты', async () => {
    fakes.mechanicAvailability.mockResolvedValue({ available: false });
    fakes.resolveDoctorAppointmentAccess.mockResolvedValue(appointment());
    fakes.staffReschedule.mockResolvedValue({ ok: true, appointment: appointment(), reschedulePolicy: null });
    fakes.updateAppointmentFinancialSnapshot.mockImplementation(async (input: {
      snapshot: Record<string, unknown>;
    }) => appointment({ ...input.snapshot }));

    await POST(request({ ...BASE_BODY, prepayment: { mode: 'full_price' } }), {
      params: Promise.resolve({ id: APPOINTMENT_ID }),
    });

    const written = fakes.updateAppointmentFinancialSnapshot.mock.calls[0][0].snapshot;
    expect(written.prepaymentRequiredMinor).toBe(0);
    expect(written.paymentDeadlineAt).toBeNull();
    expect(fakes.transitionAppointmentStatus).not.toHaveBeenCalled();
  });
});
