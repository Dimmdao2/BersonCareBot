/**
 * Три независимых класса отказа вокруг общей двери `respondWithSafeApiError`. Первый класс — «поле
 * `error` несёт текст исключения» — уже закреплён в `bareFetchErrorFieldLeak.route.test.ts`; здесь
 * закрыты те, которые тем тестом не ловятся.
 *
 * 1. Статус выбирается по подстроке в тексте пойманного исключения. `passage-stats` выбирал 404 по
 *    `msg.includes('не найден')`, то есть ошибка драйвера, в тексте которой случайно встретилась эта
 *    подстрока, превращалась в «программа не найдена» — и вместе со статусом наружу уходил сам текст.
 *    Проверяется обеими сторонами: доменный отказ по-прежнему 404, посторонняя ошибка с той же
 *    подстрокой — закрытый 500.
 * 2. Клиентский ключ не `error`. Расписание врача клало текст исключения в `detail`, поэтому проверка
 *    одного лишь поля `error` этот путь пропускает.
 * 3. Предметный отказ не должен схлопнуться в безликий 500: помеченный автором текст обязан дойти до
 *    врача в поле `message` со своим статусом, иначе защита куплена ценой сломанного контракта.
 *
 * Отказ каждого класса молчаливый: человек видит обычную красную плашку, а в теле ответа лежит SQL,
 * имена колонок и значения параметров, — поэтому он закреплён тестом, а не взглядом.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserFacingError } from '@/shared/errors/userFacingError';
import { PATIENT_PROGRAM_NOT_FOUND_MESSAGE } from '@/modules/treatment-program/patient-program-actions';

const SENSITIVE_TEST_MARKER = 'SENSITIVE_TEST_MARKER';

/** Форма, которую даёт drizzle поверх ошибки PostgreSQL. */
function databaseFailure(message: string): Error {
  return Object.assign(new Error(message), { code: '42703' });
}

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const COURSE_ID = '22222222-2222-4222-8222-222222222222';
const INSTANCE_ID = '33333333-3333-4333-8333-333333333333';

const fakes = vi.hoisted(() => ({
  getPatientPlanPassageStats: vi.fn(),
  createScheduleTemplate: vi.fn(),
  updateCourse: vi.fn(),
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePatientApiBusinessAccess: vi
    .fn()
    .mockResolvedValue({ ok: true, session: { user: { userId: 'patient-1' } } }),
  requireDoctorWorkspaceApiContext: vi.fn().mockResolvedValue({
    ok: true,
    ctx: {
      organizationId: '11111111-1111-4111-8111-111111111111',
      session: { user: { userId: 'doctor-1' } },
    },
  }),
  requireOrganizationWorkspaceApiContext: vi.fn().mockResolvedValue({
    ok: true,
    ctx: {
      organizationId: '11111111-1111-4111-8111-111111111111',
      session: { user: { userId: 'doctor-1' } },
      membershipId: 'membership-1',
      membershipRole: 'owner',
      specialistId: 'specialist-1',
      canManageOrganization: true,
      canManageAllSpecialists: true,
    },
  }),
}));

vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  requireEntitlementForRead: vi.fn().mockResolvedValue({ ok: true }),
  requireEntitlementForMutation: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: (_ctx: unknown, _source: unknown, fn: () => Promise<unknown>) =>
    fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    treatmentProgramPatientActions: {
      getPatientPlanPassageStats: fakes.getPatientPlanPassageStats,
    },
    bookingEngine: { catalog: {} },
    bookingScheduling: { createScheduleTemplate: fakes.createScheduleTemplate },
    courses: { updateCourse: fakes.updateCourse },
  }),
}));

import { GET as passageStatsRoute } from './patient/treatment-program-instances/[instanceId]/passage-stats/route';
import { POST as scheduleTemplateRoute } from './doctor/booking-engine/working-schedule-templates/route';
import { PATCH as courseUpdateRoute } from './doctor/courses/[id]/route';

beforeEach(() => {
  vi.clearAllMocks();
});

function passageStatsRequest() {
  return passageStatsRoute(
    new Request(
      `https://example.test/api/patient/treatment-program-instances/${INSTANCE_ID}/passage-stats`,
    ),
    { params: Promise.resolve({ instanceId: INSTANCE_ID }) },
  );
}

function scheduleTemplateRequest() {
  return scheduleTemplateRoute(
    new Request('https://example.test/api/doctor/booking-engine/working-schedule-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Смена', startMinute: 540, endMinute: 1080 }),
    }),
  );
}

function courseUpdateRequest() {
  return courseUpdateRoute(
    new Request(`https://example.test/api/doctor/courses/${COURSE_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Курс' }),
    }),
    { params: Promise.resolve({ id: COURSE_ID }) },
  );
}

describe('GET …/passage-stats — статус по доменному контракту, а не по подстроке', () => {
  it('оставляет 404 предметному отказу «программа не найдена»', async () => {
    fakes.getPatientPlanPassageStats.mockRejectedValue(
      new UserFacingError(PATIENT_PROGRAM_NOT_FOUND_MESSAGE),
    );

    const response = await passageStatsRequest();

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      ok: false,
      message: PATIENT_PROGRAM_NOT_FOUND_MESSAGE,
    });
  });

  it('не выдаёт ошибку драйвера за «не найдено» и не показывает пациенту её текст', async () => {
    fakes.getPatientPlanPassageStats.mockRejectedValue(
      databaseFailure(
        `Failed query: select secret_column from patients where phone = $1\nparams: ${SENSITIVE_TEST_MARKER} — план не найден`,
      ),
    );

    const response = await passageStatsRequest();
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain(SENSITIVE_TEST_MARKER);
    expect(JSON.stringify(body)).not.toContain('secret_column');
    expect(body.message).toBeUndefined();
    expect(body.digest).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('POST …/working-schedule-templates — клиентские ключи помимо `error`', () => {
  it('не кладёт текст исключения ни в один ключ ответа', async () => {
    fakes.createScheduleTemplate.mockRejectedValue(
      databaseFailure(
        `Failed query: insert into schedule_templates …\nparams: ${SENSITIVE_TEST_MARKER}`,
      ),
    );

    const response = await scheduleTemplateRequest();
    const body = (await response.json()) as Record<string, unknown>;

    expect(JSON.stringify(body)).not.toContain(SENSITIVE_TEST_MARKER);
    expect(JSON.stringify(body)).not.toContain('Failed query');
    expect(body.detail).toBeUndefined();
    expect(body.error).toBe('create_failed');
    expect(response.status).toBe(500);
  });
});

describe('PATCH /api/doctor/courses/[id] — предметный отказ не становится безликим 500', () => {
  it('доводит до врача помеченный автором текст со своим статусом', async () => {
    fakes.updateCourse.mockRejectedValue(new UserFacingError('Название курса обязательно'));

    const response = await courseUpdateRequest();

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      message: 'Название курса обязательно',
    });
  });

  it('на ошибке драйвера отдаёт только код и digest', async () => {
    fakes.updateCourse.mockRejectedValue(
      databaseFailure(
        `Failed query: update courses set title = $1\nparams: ${SENSITIVE_TEST_MARKER}`,
      ),
    );

    const response = await courseUpdateRequest();
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain(SENSITIVE_TEST_MARKER);
    expect(body.error).toBe('course_update_failed');
    expect(body.digest).toMatch(/^[0-9a-f]{8}$/);
  });
});

void ORGANIZATION_ID;
