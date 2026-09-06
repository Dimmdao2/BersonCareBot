/**
 * Приёмка §G (AN-TEST-01) раздела «Аналитика» кабинета специалиста.
 *
 * Поломки, которые ловит файл (каждая — видимый пользователю отказ, не форма кода):
 *
 * 1. «Аналитика» перестаёт ограничивать выборку арендатором/видимостью — специалист видит в KPI,
 *    графике или drill-down записи и отметки чужой организации или недоступного ему пациента.
 *    Оракул: каждый из четырёх doctor-analytics роутов обязан передать в порт `organizationId`
 *    ИЗ КОНТЕКСТА запроса и `visibilityActor`, равный этому же контексту. Порт без actor-а
 *    (`appointmentVisibilityCond`/`buildPatientVisibilityPredicate`) либо бросает
 *    `patient_visibility_actor_required`, либо снимает стену — оба исхода недопустимы.
 *
 * 2. Плитка KPI и её собственный drill-down/график считают РАЗНЫЕ множества записей: цифра на
 *    плитке «Всего записей» не сходится со списком, который открывается по клику на ней, и с
 *    суммой графика под ней. Оракул: эффективное ограничение по специалисту у KPI-запроса и у
 *    ряда/списка за тот же период обязано совпадать (AN-REC-03).
 *
 * Тест держится на границе route↔port: именно там роут выбирает scope. Сам SQL-фильтр — предмет
 * DB/RLS-матрицы, которая по AGENTS.md §10a пишется отдельно и здесь не подменяется.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireDoctorWorkspaceApiContext: vi.fn(),
  requireEntitlementForRead: vi.fn(),
  withDoctorWorkspacePrincipal: vi.fn(),
  loadDoctorAnalyticsAudience: vi.fn(),
  getAppDisplayTimeZone: vi.fn(),
  getScheduleKpis: vi.fn(),
  getAppointmentDailySeries: vi.fn(),
  listAppointmentsForSpecialist: vi.fn(),
  getActivityKpis: vi.fn(),
  getActivityDailySeries: vi.fn(),
  listPatientsWithActivity: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: fakes.requireDoctorWorkspaceApiContext,
}));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  requireEntitlementForRead: fakes.requireEntitlementForRead,
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: fakes.withDoctorWorkspacePrincipal,
}));
vi.mock('@/app-layer/analytics/loadAnalyticsAudience', () => ({
  loadDoctorAnalyticsAudience: fakes.loadDoctorAnalyticsAudience,
}));
vi.mock('@/modules/system-settings/appDisplayTimezone', () => ({
  getAppDisplayTimeZone: fakes.getAppDisplayTimeZone,
}));

import { GET as recordsGet } from './records/route';
import { GET as recordsDrilldownGet } from './records/drilldown/route';
import { GET as activityGet } from './activity/route';
import { GET as activityDrilldownGet } from './activity/drilldown/route';

const ORGANIZATION_ID = '20000000-0000-4000-8000-000000000001';
const OWN_SPECIALIST_ID = '10000000-0000-4000-8000-000000000001';

type Ctx = {
  organizationId: string;
  specialistId: string | null;
  canManageAllSpecialists: boolean;
};

const ORDINARY_SPECIALIST: Ctx = {
  organizationId: ORGANIZATION_ID,
  specialistId: OWN_SPECIALIST_ID,
  canManageAllSpecialists: false,
};

/**
 * Владелец/админ клиники, который ДОПУЩЕН на этот экран. Это не край: `clinical.workspace`
 * выдаётся только membership-у с `specialistId !== null` (organization-membership/service.ts),
 * а `canManageAllSpecialists` для owner/admin всегда `true`. То есть любой владелец клиники,
 * открывший «Аналитику», имеет ровно эту пару полей.
 */
const CLINIC_OWNER: Ctx = {
  organizationId: ORGANIZATION_ID,
  specialistId: OWN_SPECIALIST_ID,
  canManageAllSpecialists: true,
};

function useContext(ctx: Ctx) {
  fakes.requireDoctorWorkspaceApiContext.mockResolvedValue({ ok: true, ctx });
}

function req(path: string): Request {
  return new Request(`https://app.example.test${path}`);
}

/**
 * Эффективное ограничение по специалисту, которое даст порту переданная аудитория.
 * Повторяет контракт `appointmentVisibilityCond` (pgDoctorCanonicalAppointments.ts) и
 * `buildPatientVisibilityPredicate` (patientVisibilityPredicateSql.ts): actor, который управляет
 * всеми специалистами, не сужает выборку; иначе выборка сужается до его собственного специалиста.
 */
function effectiveSpecialistScopeOfActor(actor: Ctx | undefined): string | null {
  if (!actor) throw new Error('visibility_actor_missing');
  return actor.canManageAllSpecialists ? null : actor.specialistId;
}

beforeEach(() => {
  vi.clearAllMocks();
  useContext(ORDINARY_SPECIALIST);
  fakes.requireEntitlementForRead.mockResolvedValue({ ok: true });
  fakes.loadDoctorAnalyticsAudience.mockResolvedValue({ excludedUserIds: [] });
  fakes.getAppDisplayTimeZone.mockResolvedValue('Europe/Moscow');
  fakes.withDoctorWorkspacePrincipal.mockImplementation(
    (_ctx: unknown, _source: string, callback: () => unknown) => callback(),
  );
  fakes.getScheduleKpis.mockResolvedValue({ recordsInPeriod: 0 });
  fakes.getAppointmentDailySeries.mockResolvedValue({ daySeries: [], branchSeries: [] });
  fakes.listAppointmentsForSpecialist.mockResolvedValue([]);
  fakes.getActivityKpis.mockResolvedValue({
    patientsWithActiveProgram: 0,
    patientsWithActivityInPeriod: 0,
    doneCountInPeriod: 0,
    daysWithActivityInPeriod: 0,
    activePatientShare: 0,
  });
  fakes.getActivityDailySeries.mockResolvedValue([]);
  fakes.listPatientsWithActivity.mockResolvedValue({ items: [], hasMore: false });
  fakes.buildAppDeps.mockReturnValue({
    doctorAppointments: {
      getScheduleKpis: fakes.getScheduleKpis,
      getAppointmentDailySeries: fakes.getAppointmentDailySeries,
      listAppointmentsForSpecialist: fakes.listAppointmentsForSpecialist,
    },
    doctorProgramActivity: {
      getActivityKpis: fakes.getActivityKpis,
      getActivityDailySeries: fakes.getActivityDailySeries,
      listPatientsWithActivity: fakes.listPatientsWithActivity,
    },
  });
});

describe('AN-SCOPE-01/02: каждый doctor-analytics агрегат ограничен арендатором и visibility actor', () => {
  it('records: KPI и ряд читаются в организации запроса, ряд несёт actor запроса', async () => {
    const response = await recordsGet(req('/api/doctor/analytics/records?preset=week'));

    expect(response.status).toBe(200);
    expect(fakes.getScheduleKpis.mock.calls[0]?.[1]).toMatchObject({
      organizationId: ORGANIZATION_ID,
    });
    const seriesAudience = fakes.getAppointmentDailySeries.mock.calls[0]?.[1];
    expect(seriesAudience).toMatchObject({ organizationId: ORGANIZATION_ID });
    expect(seriesAudience?.visibilityActor).toBe(ORDINARY_SPECIALIST);
  });

  it('records drill-down: список ограничен организацией и actor-ом запроса', async () => {
    const response = await recordsDrilldownGet(
      req('/api/doctor/analytics/records/drilldown?preset=week'),
    );

    expect(response.status).toBe(200);
    const audience = fakes.listAppointmentsForSpecialist.mock.calls[0]?.[1];
    expect(audience).toMatchObject({ organizationId: ORGANIZATION_ID });
    expect(audience?.visibilityActor).toBe(ORDINARY_SPECIALIST);
  });

  it('activity: KPI и ряд ограничены организацией и actor-ом запроса', async () => {
    const response = await activityGet(req('/api/doctor/analytics/activity?preset=week'));

    expect(response.status).toBe(200);
    for (const call of [
      fakes.getActivityKpis.mock.calls[0],
      fakes.getActivityDailySeries.mock.calls[0],
    ]) {
      expect(call?.[1]).toMatchObject({ organizationId: ORGANIZATION_ID });
      expect(call?.[1]?.visibilityActor).toBe(ORDINARY_SPECIALIST);
    }
  });

  it('activity drill-down: список пациентов ограничен организацией и actor-ом запроса', async () => {
    const response = await activityDrilldownGet(
      req('/api/doctor/analytics/activity/drilldown?preset=week'),
    );

    expect(response.status).toBe(200);
    const audience = fakes.listPatientsWithActivity.mock.calls[0]?.[1];
    expect(audience).toMatchObject({ organizationId: ORGANIZATION_ID });
    expect(audience?.visibilityActor).toBe(ORDINARY_SPECIALIST);
  });
});

describe('AN-REC-03: плитка KPI, график и drill-down считают одно и то же множество записей', () => {
  it('обычный специалист: KPI, ряд и drill-down сужены до его собственного специалиста', async () => {
    useContext(ORDINARY_SPECIALIST);

    await recordsGet(req('/api/doctor/analytics/records?preset=week'));
    await recordsDrilldownGet(req('/api/doctor/analytics/records/drilldown?preset=week'));

    const kpiScope = fakes.getScheduleKpis.mock.calls[0]?.[0]?.specialistId ?? null;
    const seriesScope = effectiveSpecialistScopeOfActor(
      fakes.getAppointmentDailySeries.mock.calls[0]?.[1]?.visibilityActor,
    );
    const drilldownScope = effectiveSpecialistScopeOfActor(
      fakes.listAppointmentsForSpecialist.mock.calls[0]?.[1]?.visibilityActor,
    );

    expect(kpiScope).toBe(OWN_SPECIALIST_ID);
    expect(seriesScope).toBe(kpiScope);
    expect(drilldownScope).toBe(kpiScope);
  });

  it('владелец клиники: KPI не считает своё, пока график и drill-down показывают всю клинику', async () => {
    useContext(CLINIC_OWNER);

    await recordsGet(req('/api/doctor/analytics/records?preset=week'));
    await recordsDrilldownGet(req('/api/doctor/analytics/records/drilldown?preset=week'));

    const kpiScope = fakes.getScheduleKpis.mock.calls[0]?.[0]?.specialistId ?? null;
    const seriesScope = effectiveSpecialistScopeOfActor(
      fakes.getAppointmentDailySeries.mock.calls[0]?.[1]?.visibilityActor,
    );
    const drilldownScope = effectiveSpecialistScopeOfActor(
      fakes.listAppointmentsForSpecialist.mock.calls[0]?.[1]?.visibilityActor,
    );

    // Отказ словами: владелец клиники видит «Всего записей: N» (только свои приёмы), кликает
    // плитку — и получает список записей ВСЕЙ клиники, а график под плиткой суммируется в другое
    // число. Одно из двух обязано измениться, но обе стороны обязаны совпасть.
    expect(seriesScope).toBe(kpiScope);
    expect(drilldownScope).toBe(kpiScope);
  });
});
