/**
 * Ловимая поломка: маршрут, который НЕ переведён на `respondWithSafeApiError`, кладёт `e.message`
 * пойманного исключения в поле `error`, а экран кабинета читает это поле «голым» fetch-ом и рисует
 * его человеку — `setError(data.error ?? '…')`. Для ошибки драйвера это текст запроса, имена
 * таблиц/колонок и значения параметров на экране врача и пациента.
 *
 * Почему это не покрыто существующей защитой: `apiJson` действительно перестал доверять полю
 * `error`, но перечисленные ниже экраны через `apiJson` не ходят — они разбирают ответ сами:
 *   - `app/app/doctor/courses/new/DoctorCourseDraftCreateForm.tsx`
 *     → `setError(data.error ?? 'Не удалось создать курс')`  →  POST /api/doctor/courses
 *   - `app/app/patient/courses/PatientCoursesCatalogClient.tsx`
 *     → `setError(data.error ?? 'Не удалось записаться')`    →  POST /api/patient/courses/[id]/enroll
 * Поэтому «UI-показ перекрыт `apiJson`» здесь не выполняется, и проверять надо тело ответа.
 *
 * Отказ дорогой (внутренняя схема и значения строк наружу) и молчаливый (для человека это обычная
 * красная плашка «не удалось сохранить»), поэтому он закреплён тестом, а не взглядом.
 *
 * Oracle — требование владельца: врач, клиника и пациент не видят raw SQL, параметры, имена
 * таблиц/колонок, stack trace и произвольный `Error.message`; допустимы безопасный авторский текст,
 * непрозрачный digest и код ошибки.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SENSITIVE_TEST_MARKER = 'SENSITIVE_TEST_MARKER';

/** Форма, которую даёт drizzle поверх ошибки PostgreSQL. */
function databaseFailure(): Error {
  return Object.assign(
    new Error(
      `Failed query: select secret_column from patients where phone = $1\nparams: ${SENSITIVE_TEST_MARKER}`,
    ),
    { code: '42703' },
  );
}

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const DOCTOR_USER_ID = '33333333-3333-4333-8333-333333333333';
const PATIENT_USER_ID = '44444444-4444-4444-8444-444444444444';
const COURSE_ID = '22222222-2222-4222-8222-222222222222';
const TEMPLATE_ID = '55555555-5555-4555-8555-555555555555';

const fakes = vi.hoisted(() => ({
  createCourse: vi.fn(),
  enrollPatient: vi.fn(),
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: vi.fn().mockResolvedValue({
    ok: true,
    ctx: {
      organizationId: '11111111-1111-4111-8111-111111111111',
      session: { user: { userId: '33333333-3333-4333-8333-333333333333' } },
    },
  }),
  requirePatientApiBusinessAccess: vi.fn().mockResolvedValue({
    ok: true,
    session: { user: { userId: '44444444-4444-4444-8444-444444444444' } },
  }),
}));

vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  requireEntitlementForRead: vi.fn().mockResolvedValue({ ok: true }),
  requireEntitlementForMutation: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: (_ctx: unknown, _source: unknown, fn: () => Promise<unknown>) =>
    fn(),
  withPatientOrganizationPrincipal: (_ctx: unknown, fn: () => Promise<unknown>) => fn(),
}));

vi.mock('@/app/api/booking/bookingTenant', () => ({
  resolvePatientEnrollmentOrganizationId: vi
    .fn()
    .mockResolvedValue({ ok: true, organizationId: '11111111-1111-4111-8111-111111111111' }),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    courses: { createCourse: fakes.createCourse, enrollPatient: fakes.enrollPatient },
  }),
}));

import { POST as createCourseRoute } from './doctor/courses/route';
import { POST as enrollCourseRoute } from './patient/courses/[courseId]/enroll/route';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('текст исключения в поле `error` у маршрутов, которые читает «голый» fetch', () => {
  it('POST /api/doctor/courses не отдаёт врачу SQL и значения параметров упавшего запроса', async () => {
    fakes.createCourse.mockRejectedValue(databaseFailure());

    const response = await createCourseRoute(
      new Request('https://example.test/api/doctor/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Курс', programTemplateId: TEMPLATE_ID }),
      }),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(JSON.stringify(body)).not.toContain(SENSITIVE_TEST_MARKER);
    expect(JSON.stringify(body)).not.toContain('secret_column');
    expect(JSON.stringify(body)).not.toContain('Failed query');
  });

  it('POST /api/patient/courses/[courseId]/enroll не отдаёт пациенту SQL и значения параметров', async () => {
    fakes.enrollPatient.mockRejectedValue(databaseFailure());

    const response = await enrollCourseRoute(
      new Request(`https://example.test/api/patient/courses/${COURSE_ID}/enroll`, {
        method: 'POST',
      }),
      { params: Promise.resolve({ courseId: COURSE_ID }) },
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(JSON.stringify(body)).not.toContain(SENSITIVE_TEST_MARKER);
    expect(JSON.stringify(body)).not.toContain('secret_column');
    expect(JSON.stringify(body)).not.toContain('Failed query');
  });

  it('оба маршрута сохраняют машинный код в поле `error`, пригодный для показа человеку', async () => {
    fakes.createCourse.mockRejectedValue(databaseFailure());
    fakes.enrollPatient.mockRejectedValue(databaseFailure());

    const [doctorBody, patientBody] = await Promise.all([
      createCourseRoute(
        new Request('https://example.test/api/doctor/courses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Курс', programTemplateId: TEMPLATE_ID }),
        }),
      ).then((r) => r.json() as Promise<{ error?: unknown }>),
      enrollCourseRoute(
        new Request(`https://example.test/api/patient/courses/${COURSE_ID}/enroll`, {
          method: 'POST',
        }),
        { params: Promise.resolve({ courseId: COURSE_ID }) },
      ).then((r) => r.json() as Promise<{ error?: unknown }>),
    ]);

    // Форма машинного кода: без пробелов, переносов строк и кавычек — см. `isSafeApiErrorCode`.
    for (const body of [doctorBody, patientBody]) {
      expect(body.error).toMatch(/^[a-z][a-z0-9_]*(?::[A-Za-z0-9_.-]{1,64})?$/);
    }
  });
});

// Ссылки на используемые константы, чтобы линтер не считал их мёртвыми.
void ORGANIZATION_ID;
void DOCTOR_USER_ID;
void PATIENT_USER_ID;
