import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  requireDoctorBookingEngine: vi.fn(),
  resolveDoctorCreateSpecialist: vi.fn(),
  buildAppDeps: vi.fn(),
  createBookingSyncPort: vi.fn(),
  createAppointment: vi.fn(),
  getSpecialistAppointmentReminderSettings: vi.fn(),
  ensureStaffBookingProjection: vi.fn(),
}));

vi.mock('../../_requireDoctorBookingEngine', () => ({
  requireDoctorBookingEngine: fakes.requireDoctorBookingEngine,
}));
vi.mock('../../_resolveDoctorAppointmentAccess', () => ({
  resolveDoctorCreateSpecialist: fakes.resolveDoctorCreateSpecialist,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: fakes.buildAppDeps,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: (
    _workspace: unknown,
    _source: string,
    fn: () => Promise<unknown>,
  ) => fn(),
}));
// PAY-APPT-03: расчёт снимка спрашивает тариф клиники; здесь механика оплаты доступна, а
// политика предоплаты отсутствует — то есть требования нет и запись остаётся подтверждённой.
vi.mock('@/app-layer/guards/requireEntitlement', async (importActual) => ({
  ...(await importActual<object>()),
  getMechanicMutationAvailability: vi.fn(async () => ({ available: true })),
}));
vi.mock('@/modules/integrator/bookingM2mApi', () => ({
  createBookingSyncPort: fakes.createBookingSyncPort,
}));

import { POST } from './route';

const BRANCH_ID = '33333333-3333-4333-8333-333333333333';
const SERVICE_ID = '44444444-4444-4444-8444-444444444444';

/**
 * D13a(добор): врач создаёт запись вручную (doctor manual-create) — до этой правки
 * `booking.created` не содержал reminderPlan, интегратор ставил напоминания по
 * зашитым 24ч/2ч независимо от настроек клиники.
 */
describe('doctor booking-engine manual-create: reminderPlan в событии', () => {
  let captured: Array<Record<string, unknown>>;
  let settingsRows: Record<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    captured = [];
    settingsRows = {
      doctor_appointment_reminder_enabled: { valueJson: false },
      doctor_appointment_reminder_offsets_minutes: { valueJson: [] },
    };

    fakes.createAppointment.mockImplementation(async (input: Record<string, unknown>) => ({
      id: 'appt-1',
      organizationId: input.organizationId,
      specialistId: input.specialistId,
      branchId: input.branchId,
      serviceId: input.serviceId,
      startAt: input.startAt,
      endAt: input.endAt,
      platformUserId: input.platformUserId ?? null,
      phoneNormalized: input.phoneNormalized ?? null,
      appointmentReminderAllowedPresetIds: input.appointmentReminderAllowedPresetIds ?? [],
      appointmentReminderPresetId: input.appointmentReminderPresetId ?? null,
      attributionJson: {},
    }));
    fakes.getSpecialistAppointmentReminderSettings.mockResolvedValue({
      allowedPresetIds: ['day_before', 'two_hours_before'],
      defaultPresetId: 'day_before',
    });
    fakes.ensureStaffBookingProjection.mockResolvedValue(null);

    fakes.requireDoctorBookingEngine.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: 'org-1',
        session: { user: { userId: 'user-doc-1', role: 'specialist' } },
        service: {
          createAppointment: fakes.createAppointment,
          services: { getService: vi.fn(async () => ({ priceMinor: 250_000 })) },
          getAppointment: vi.fn(async () => null),
          getSpecialistAppointmentReminderSettings: fakes.getSpecialistAppointmentReminderSettings,
        },
      },
    });

    fakes.resolveDoctorCreateSpecialist.mockResolvedValue({
      ok: true,
      specialistId: '11111111-1111-4111-8111-111111111111',
    });

    fakes.buildAppDeps.mockReturnValue({
      bookingScheduling: null,
      patientBooking: {
        ensureStaffBookingProjection: fakes.ensureStaffBookingProjection,
      },
      patientOrganization: null,
      memberships: null,
      systemSettings: {
        getSetting: vi.fn(async (key: string) => settingsRows[key] ?? null),
      },
      bookingEngine: {
        getSpecialistAppointmentReminderSettings: fakes.getSpecialistAppointmentReminderSettings,
      },
    });

    fakes.createBookingSyncPort.mockReturnValue({
      emitBookingEvent: vi.fn(async (evt: { payload: Record<string, unknown> }) => {
        captured.push(evt.payload);
      }),
    });
  });

  it('несёт план напоминаний — выключенные напоминания клиники доходят до события', async () => {
    fakes.getSpecialistAppointmentReminderSettings.mockResolvedValue({
      allowedPresetIds: [],
      defaultPresetId: null,
    });
    const response = await POST(
      new Request('http://127.0.0.1/api/doctor/booking-engine/appointments/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          startAt: '2027-03-10T09:00:00.000Z',
          endAt: '2027-03-10T09:30:00.000Z',
          durationMinutes: 30,
          branchId: BRANCH_ID,
          serviceId: SERVICE_ID,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(captured[0]!.reminderPlan).toEqual({ enabled: false, offsetsMinutes: [] });
  });

  it('регрессия: если reminderPlan пропадёт из события, тест краснеет', async () => {
    await POST(
      new Request('http://127.0.0.1/api/doctor/booking-engine/appointments/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          startAt: '2027-03-10T09:00:00.000Z',
          endAt: '2027-03-10T09:30:00.000Z',
          durationMinutes: 30,
          branchId: BRANCH_ID,
          serviceId: SERVICE_ID,
        }),
      }),
    );

    expect(captured[0]).toHaveProperty('reminderPlan');
  });

  it('uses the selected specialist presets for a staff-created appointment', async () => {
    const response = await POST(
      new Request('http://127.0.0.1/api/doctor/booking-engine/appointments/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          startAt: '2027-03-10T09:00:00.000Z',
          endAt: '2027-03-10T09:30:00.000Z',
          durationMinutes: 30,
          branchId: BRANCH_ID,
          serviceId: SERVICE_ID,
          platformUserId: '55555555-5555-4555-8555-555555555555',
          phoneNormalized: '+79990000000',
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(fakes.createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentReminderAllowedPresetIds: ['day_before', 'two_hours_before'],
        appointmentReminderPresetId: 'day_before',
        branchId: BRANCH_ID,
        serviceId: SERVICE_ID,
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      appointment: {
        specialistId: '11111111-1111-4111-8111-111111111111',
        branchId: BRANCH_ID,
        serviceId: SERVICE_ID,
      },
    });
    expect(captured[0]!.reminderPlan).toEqual({ enabled: true, offsetsMinutes: [1440] });
    expect(fakes.ensureStaffBookingProjection).toHaveBeenCalledWith(
      expect.objectContaining({
        appointment: expect.objectContaining({ id: 'appt-1', serviceId: SERVICE_ID }),
      }),
    );
  });

  it('maps an organization-scoped catalog refusal without attempting a partial create', async () => {
    fakes.createAppointment.mockRejectedValueOnce(new Error('branch_not_found'));

    const response = await POST(
      new Request('http://127.0.0.1/api/doctor/booking-engine/appointments/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          startAt: '2027-03-10T09:00:00.000Z',
          endAt: '2027-03-10T09:30:00.000Z',
          durationMinutes: 30,
          branchId: BRANCH_ID,
          serviceId: SERVICE_ID,
        }),
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'branch_not_found' });
  });

  /**
   * PAY-APPT-01/03/07/08/18. Oracle — требование владельца: «если для записи требуется
   * предоплата, и пациентская, и созданная врачом запись появляются в календаре со статусом
   * `Ожидает оплаты`; слот на это время временно занят» и «в настройках записи задаётся срок
   * ожидания предоплаты… врач может установить любой требуемый срок».
   *
   * Что ломается без этой проверки: врачебная запись возвращается к безусловному `confirmed`
   * (как было до этой работы) — клиника выставляет счёт, слот считается подтверждённым, и
   * неоплаченная запись занимает время врача навсегда: истечение срока смотрит только на
   * `awaiting_payment` и на `payment_deadline_at`, а у такой записи нет ни того, ни другого.
   * Отдельно ломается срок: захардкоженные 20 минут молча игнорируют настройку клиники, и врач,
   * поставивший час, теряет бронь через двадцать минут.
   *
   * Мутации, которыми проверена красность:
   *   `status: initialStatus` → `status: 'confirmed'` — краснеет первое утверждение;
   *   `getPrepaymentWaitMinutes(...)` → константа `20` — краснеет утверждение о дедлайне.
   */
  describe('PAY-APPT-07/08: предоплата врачебной записи держит слот и несёт точный срок', () => {
    beforeEach(() => {
      fakes.buildAppDeps.mockReturnValue({
        // Клиника ждёт предоплату 90 минут — значение НЕ равно платформенному умолчанию.
        bookingScheduling: {
          assertSlotAvailable: vi.fn(async () => undefined),
          getPrepaymentWaitMinutes: vi.fn(async () => 90),
        },
        payments: {
          getSettings: vi.fn(async () => ({ enabled: true })),
          getPrepaymentPolicyForBooking: vi.fn(async () => ({
            id: 'policy-1',
            organizationId: 'org-1',
            serviceId: SERVICE_ID,
            onlineCategory: null,
            mode: 'percent',
            amountMinor: null,
            percentBps: 3000,
            currency: 'RUB',
            isActive: true,
          })),
        },
        patientBooking: { ensureStaffBookingProjection: fakes.ensureStaffBookingProjection },
        patientOrganization: null,
        memberships: null,
        systemSettings: { getSetting: vi.fn(async (key: string) => settingsRows[key] ?? null) },
        bookingEngine: {
          getSpecialistAppointmentReminderSettings:
            fakes.getSpecialistAppointmentReminderSettings,
        },
      });
    });

    async function create(body: Record<string, unknown> = {}) {
      return POST(
        new Request('http://127.0.0.1/api/doctor/booking-engine/appointments/manual', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            startAt: '2027-03-10T09:00:00.000Z',
            endAt: '2027-03-10T09:30:00.000Z',
            durationMinutes: 30,
            branchId: BRANCH_ID,
            serviceId: SERVICE_ID,
            ...body,
          }),
        }),
      );
    }

    it('политика клиники открывает врачебную запись в ожидании оплаты со сроком из настройки', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2027-03-01T08:00:00.000Z'));
      try {
        expect((await create()).status).toBe(200);
      } finally {
        vi.useRealTimers();
      }

      expect(fakes.createAppointment).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'awaiting_payment',
          priceMinor: 250_000,
          priceCurrency: 'RUB',
          prepaymentMode: 'percent',
          prepaymentPercentBps: 3000,
          // 2500,00 ₽ · 30 % = ровно 75 000 копеек.
          prepaymentRequiredMinor: 75_000,
          // 08:00 + 90 минут настройки клиники, а не платформенные 20.
          paymentDeadlineAt: '2027-03-01T09:30:00.000Z',
        }),
      );
    });

    it('переопределение врача «без предоплаты» возвращает запись к обычному подтверждению', async () => {
      expect((await create({ prepayment: { mode: 'disabled' } })).status).toBe(200);

      expect(fakes.createAppointment).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'confirmed',
          prepaymentMode: 'disabled',
          prepaymentRequiredMinor: 0,
          paymentDeadlineAt: null,
        }),
      );
    });

    it('ручная цена врача, а не прайс каталога, ложится в снимок и в требование', async () => {
      expect(
        (await create({ priceMinor: 180_000, prepayment: { mode: 'full_price' } })).status,
      ).toBe(200);

      expect(fakes.createAppointment).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'awaiting_payment',
          priceMinor: 180_000,
          prepaymentRequiredMinor: 180_000,
        }),
      );
    });

    it('дробные деньги контракт врача не принимает и до создания записи не доходит', async () => {
      expect((await create({ priceMinor: 1000.5 })).status).toBe(400);
      expect(fakes.createAppointment).not.toHaveBeenCalled();
    });
  });

  it('refuses a clinic-owner create without an explicit branch and service', async () => {
    const response = await POST(
      new Request('http://127.0.0.1/api/doctor/booking-engine/appointments/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          startAt: '2027-03-10T09:00:00.000Z',
          endAt: '2027-03-10T09:30:00.000Z',
          durationMinutes: 30,
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(fakes.createAppointment).not.toHaveBeenCalled();
  });
});
