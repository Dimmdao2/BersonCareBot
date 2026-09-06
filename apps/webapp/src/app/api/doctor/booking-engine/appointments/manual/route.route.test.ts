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

import { assertMechanicWriteClearance } from '@/app-layer/entitlements/mechanicWriteClearance';
import { POST } from './route';

const BRANCH_ID = '33333333-3333-4333-8333-333333333333';
const SERVICE_ID = '44444444-4444-4444-8444-444444444444';
const PATIENT_ID = '55555555-5555-4555-8555-555555555555';

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

/**
 * ENCOUNTER-APPOINTMENT-05 (owner acceptance 2026-09-04, §P4.6): «Если на выбранное время уже
 * существует запись специалиста, до сохранения показано явное подтверждение конфликта. Отмена
 * подтверждения ничего не создаёт; явное согласие разрешает наложение.»
 *
 * Что сломается без этих утверждений:
 *   1. `allowOverlap` перестаёт быть повтором подтверждённого запроса и снимает проверку слота с
 *      ОБЫЧНОГО запроса — врач получает молчаливую двойную бронь вместо подтверждения, и «отмена
 *      ничего не создаёт» становится ложью (запись уже создана к моменту показа диалога).
 *   2. Подтверждённый слот записывается не тем временем (или не записывается вовсе) — предикат
 *      `be_appointments_specialist_no_overlap` сравнивает пару с собственным временем строки,
 *      поэтому расхождение оставляет запись под запретом и согласие врача не исполняется вовсе
 *      (`23P01` → 409). Оракул равенства взят из самого файла миграции, не из реализации формы.
 */
describe('ENCOUNTER-APPOINTMENT-05: наложение только по явному согласию врача', () => {
  const SLOT_START = '2027-04-12T09:00:00.000Z';
  const SLOT_END = '2027-04-12T10:00:00.000Z';
  let assertSlotAvailable: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fakes.createAppointment.mockImplementation(async (input: Record<string, unknown>) => ({
      id: 'appt-overlap-1',
      organizationId: input.organizationId,
      specialistId: input.specialistId,
      branchId: input.branchId,
      serviceId: input.serviceId,
      startAt: input.startAt,
      endAt: input.endAt,
      platformUserId: null,
      phoneNormalized: null,
      appointmentReminderAllowedPresetIds: [],
      appointmentReminderPresetId: null,
      attributionJson: {},
    }));
    fakes.getSpecialistAppointmentReminderSettings.mockResolvedValue({
      allowedPresetIds: [],
      defaultPresetId: null,
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
    // Занятый слот: та же проверка, которая отказывает первому запросу в проде.
    assertSlotAvailable = vi.fn(async () => {
      throw new Error('slot_overlap');
    });
    fakes.buildAppDeps.mockReturnValue({
      bookingScheduling: { assertSlotAvailable, getPrepaymentWaitMinutes: vi.fn(async () => 20) },
      payments: {
        getSettings: vi.fn(async () => ({ enabled: false })),
        getPrepaymentPolicyForBooking: vi.fn(async () => null),
      },
      patientBooking: {
        ensureStaffBookingProjection: fakes.ensureStaffBookingProjection,
        getBookingByCanonicalAppointment: vi.fn(async () => null),
      },
      patientOrganization: null,
      memberships: null,
      systemSettings: { getSetting: vi.fn(async () => null) },
      bookingEngine: {
        getSpecialistAppointmentReminderSettings: fakes.getSpecialistAppointmentReminderSettings,
      },
    });
    fakes.createBookingSyncPort.mockReturnValue({ emitBookingEvent: vi.fn(async () => undefined) });
  });

  async function create(body: Record<string, unknown> = {}) {
    return POST(
      new Request('http://127.0.0.1/api/doctor/booking-engine/appointments/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          startAt: SLOT_START,
          endAt: SLOT_END,
          durationMinutes: 60,
          branchId: BRANCH_ID,
          serviceId: SERVICE_ID,
          ...body,
        }),
      }),
    );
  }

  it('обычный запрос на занятое время отказывает и не создаёт ничего', async () => {
    const response = await create();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'slot_overlap' });
    expect(assertSlotAvailable).toHaveBeenCalledTimes(1);
    // «Отмена подтверждения ничего не создаёт»: к моменту показа диалога записи ещё нет.
    expect(fakes.createAppointment).not.toHaveBeenCalled();
  });

  it('повтор с явным согласием создаёт запись и помечает ИМЕННО подтверждённый слот', async () => {
    const response = await create({ allowOverlap: true });

    expect(response.status).toBe(200);
    expect(assertSlotAvailable).toHaveBeenCalledTimes(1);
    expect(fakes.createAppointment).toHaveBeenCalledTimes(1);
    const created = fakes.createAppointment.mock.calls[0]![0] as Record<string, unknown>;
    // Пара обязана совпасть с собственным временем записи — только тогда предикат ограничения
    // выводит строку из-под запрета пересечений.
    expect({
      overlapConfirmedStartAt: created.overlapConfirmedStartAt,
      overlapConfirmedEndAt: created.overlapConfirmedEndAt,
    }).toEqual({ overlapConfirmedStartAt: SLOT_START, overlapConfirmedEndAt: SLOT_END });
    expect(created.startAt).toBe(SLOT_START);
    expect(created.endAt).toBe(SLOT_END);
  });

  it('allowOverlap на свободном слоте не помечает слот подтверждённым', async () => {
    assertSlotAvailable.mockImplementation(async () => undefined);

    expect((await create({ allowOverlap: true })).status).toBe(200);
    expect(assertSlotAvailable).toHaveBeenCalledTimes(1);

    const created = fakes.createAppointment.mock.calls[0]![0] as Record<string, unknown>;
    expect({
      overlapConfirmedStartAt: created.overlapConfirmedStartAt,
      overlapConfirmedEndAt: created.overlapConfirmedEndAt,
    }).toEqual({ overlapConfirmedStartAt: null, overlapConfirmedEndAt: null });
  });
});

/**
 * Подтверждённый дефект (worker-отчёт df87839fe, вторая половина): врачебное создание записи с
 * выбранным пациентом падало в `patient_principal_required` → `appointment_create_unavailable`, а
 * автопривязка абонемента ДОПОЛНИТЕЛЬНО отказывала на замке механики `subscriptions` и глушилась
 * пустым `catch {}` — то есть сеанс не списывался НИ РАЗУ, и об этом никто не узнавал.
 *
 * Что сломается без этого утверждения: врач записывает пациента с действующим абонементом — запись
 * либо не создаётся вовсе (503), либо создаётся, а сеанс не списан; клиника отдаёт услугу бесплатно
 * и видит абонемент нетронутым. Отказ дорогой (деньги) и молчаливый (пустой `catch`).
 */
describe('ENCOUNTER-APPOINTMENT-06: врачебная запись пациенту списывает сеанс абонемента', () => {
  let reserveOutcome: 'cleared' | 'refused' | null;
  let reserveForAppointment: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    reserveOutcome = null;
    fakes.createAppointment.mockImplementation(async (input: Record<string, unknown>) => ({
      id: 'appt-pkg-1',
      organizationId: input.organizationId,
      specialistId: input.specialistId,
      branchId: input.branchId,
      serviceId: input.serviceId,
      startAt: input.startAt,
      endAt: input.endAt,
      platformUserId: input.platformUserId ?? null,
      phoneNormalized: null,
      appointmentReminderAllowedPresetIds: [],
      appointmentReminderPresetId: null,
      attributionJson: {},
    }));
    fakes.getSpecialistAppointmentReminderSettings.mockResolvedValue({
      allowedPresetIds: [],
      defaultPresetId: null,
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
    // Продуктовая правда: `reserveForAppointment` первым делом требует clearance механики
    // `subscriptions`, иначе физически отказывает. Здесь спрашивается ровно она.
    reserveForAppointment = vi.fn(async () => {
      try {
        assertMechanicWriteClearance('subscriptions');
        reserveOutcome = 'cleared';
      } catch (err) {
        reserveOutcome = 'refused';
        throw err;
      }
      return { id: 'usage-1' };
    });
    fakes.buildAppDeps.mockReturnValue({
      bookingScheduling: {
        assertSlotAvailable: vi.fn(async () => undefined),
        getPrepaymentWaitMinutes: vi.fn(async () => 20),
      },
      payments: {
        getSettings: vi.fn(async () => ({ enabled: false })),
        getPrepaymentPolicyForBooking: vi.fn(async () => null),
      },
      patientBooking: {
        ensureStaffBookingProjection: fakes.ensureStaffBookingProjection,
        getBookingByCanonicalAppointment: vi.fn(async () => null),
      },
      patientOrganization: null,
      memberships: {
        pickAutoPackageForBooking: vi.fn(async () => ({ id: 'pkg-1', organizationId: 'org-1' })),
        reserveForAppointment,
      },
      systemSettings: { getSetting: vi.fn(async () => null) },
      bookingEngine: {
        getSpecialistAppointmentReminderSettings: fakes.getSpecialistAppointmentReminderSettings,
      },
    });
    fakes.createBookingSyncPort.mockReturnValue({ emitBookingEvent: vi.fn(async () => undefined) });
  });

  it('запись создаётся и списание идёт в области записи механики, а не глохнет в catch', async () => {
    const response = await POST(
      new Request('http://127.0.0.1/api/doctor/booking-engine/appointments/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          startAt: '2027-04-13T09:00:00.000Z',
          endAt: '2027-04-13T10:00:00.000Z',
          durationMinutes: 60,
          branchId: BRANCH_ID,
          serviceId: SERVICE_ID,
          platformUserId: PATIENT_ID,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(reserveForAppointment).toHaveBeenCalledTimes(1);
    expect(reserveOutcome).toBe('cleared');
    expect(reserveForAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        patientPackageId: 'pkg-1',
        appointmentId: 'appt-pkg-1',
        platformUserId: PATIENT_ID,
      }),
    );
  });
});
