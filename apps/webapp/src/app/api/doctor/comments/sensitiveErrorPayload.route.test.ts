/**
 * Ловимая поломка: маршрут кабинета врача поймал ошибку драйвера БД, чей `message` несёт текст
 * запроса и значения параметров (`Failed query: select secret_column … params: …`), и вернул этот
 * текст в JSON-ответе — врач читает SQL, имена колонок и значения чужих строк прямо в интерфейсе.
 *
 * Отказ дорогой (чужие данные и внутренняя схема наружу) и молчаливый (ответ выглядит как обычная
 * ошибка сохранения), поэтому проверяется тестом, а не глазами.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserFacingError } from '@/shared/errors/userFacingError';

const SENSITIVE_TEST_MARKER = 'SENSITIVE_TEST_MARKER';

/** Форма, которую даёт drizzle поверх ошибки PostgreSQL. */
function databaseFailure(): Error {
  const cause = new Error(
    `select secret_column from patients where phone = $1 -- ${SENSITIVE_TEST_MARKER}`,
  );
  Object.assign(cause, { code: '42703', table: 'patients', column: 'secret_column' });
  return Object.assign(
    new Error(
      `Failed query: select secret_column from patients where phone = $1\nparams: ${SENSITIVE_TEST_MARKER}`,
      { cause },
    ),
    { code: '42703' },
  );
}

const fakes = vi.hoisted(() => ({
  requireDoctorWorkspaceApiContext: vi.fn(),
  withDoctorWorkspacePrincipal: vi.fn(),
  buildAppDeps: vi.fn(),
  listByTarget: vi.fn(),
  getInstanceById: vi.fn(),
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: fakes.requireDoctorWorkspaceApiContext,
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: fakes.withDoctorWorkspacePrincipal,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));

import { GET } from './route';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requireDoctorWorkspaceApiContext.mockResolvedValue({
    ok: true,
    ctx: { organizationId: ORGANIZATION_ID, session: { user: { userId: 'doctor-1' } } },
  });
  fakes.withDoctorWorkspacePrincipal.mockImplementation(
    (_ctx: unknown, fn: () => Promise<unknown>) => fn(),
  );
  fakes.getInstanceById.mockResolvedValue({ id: TARGET_ID, organizationId: ORGANIZATION_ID });
  fakes.buildAppDeps.mockReturnValue({
    comments: { listByTarget: fakes.listByTarget },
    treatmentProgramInstance: { getInstanceById: fakes.getInstanceById },
  });
});

function listRequest(): Request {
  return new Request(
    `https://example.test/api/doctor/comments?targetType=program_instance&targetId=${TARGET_ID}`,
  );
}

describe('GET /api/doctor/comments — текст исключения наружу', () => {
  it('не отдаёт врачу SQL и параметры упавшего запроса, оставляя код и digest', async () => {
    fakes.listByTarget.mockRejectedValue(databaseFailure());

    const response = await GET(listRequest());
    const body = (await response.json()) as Record<string, unknown>;

    expect(JSON.stringify(body)).not.toContain(SENSITIVE_TEST_MARKER);
    expect(JSON.stringify(body)).not.toContain('secret_column');
    expect(body.error).toBe('comments_load_failed');
    expect(body.message).toBeUndefined();
    expect(body.digest).toMatch(/^[0-9a-f]{8}$/);
    expect(response.status).toBe(500);
  });

  it('сохраняет предметное сообщение, помеченное автором кода как безопасное', async () => {
    fakes.listByTarget.mockRejectedValue(new UserFacingError('Комментарий не найден'));

    const response = await GET(listRequest());
    const body = (await response.json()) as Record<string, unknown>;

    expect(body).toMatchObject({ ok: false, message: 'Комментарий не найден' });
    expect(response.status).toBe(400);
  });
});
