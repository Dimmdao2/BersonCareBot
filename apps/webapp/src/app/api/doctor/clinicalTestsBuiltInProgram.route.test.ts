import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireDoctorWorkspaceApiContext: vi.fn(),
  withDoctorWorkspacePrincipal: vi.fn(<T>(_context: unknown, _operation: string, fn: () => T): T => fn()),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: fakes.requireDoctorWorkspaceApiContext,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: fakes.withDoctorWorkspacePrincipal,
}));

import { POST as createClinicalTest } from './clinical-tests/route';
import { POST as createTestSet } from './test-sets/route';
import { POST as addTemplateStageItem } from './treatment-program-templates/stages/[stageId]/items/route';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000002080';
const USER_ID = '00000000-0000-4000-8000-000000002081';
const STAGE_ID = '00000000-0000-4000-8000-000000002082';
const TEST_ID = '00000000-0000-4000-8000-000000002083';

function request(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Рубильник области ЛФК на стороне тарифа. Возвращает то же, что реальная механика: включено или нет.
 * Имя ключа проверяется отдельным утверждением — половина смысла этого файла в том, ЧТО именно спрашивают.
 */
function exerciseCatalogSwitch(enabled: boolean, seen: string[]) {
  return {
    resolveMechanicAccess: vi.fn(async (_organizationId: string, mechanic: string) => {
      seen.push(mechanic);
      return {
        mechanic,
        state: enabled ? 'enabled' : 'disabled',
        policySource: 'mechanic',
        warning: null,
      };
    }),
    resolveCabinetAccess: vi.fn(async () => ({ state: 'enabled' })),
  };
}

/**
 * Владелец 11.09.2026 отменил своё же решение 02.08 («клинические тесты никогда не режутся тарифом») и
 * заменил его на одну цельную механику: «упражнения, наборы ЛФК, клинические тесты, шаблоны программ,
 * наборы тестов — одна цельная механика, выключаем её всю» (`docs/_TODO/SAAS_FOUNDATION/
 * EXERCISE_STORE_PLAN.md`, §2 п.22, там же прямо сказано, что исключений внутри механики по типу элемента
 * нет и не будет). Прежняя редакция этого файла сторожила именно отменённое решение: она требовала, чтобы
 * тариф НЕ спрашивали вовсе, и после приземления единого рубильника падала. Файл переписан под действующее
 * решение — сторожит то же место двери, но с противоположным знаком.
 */
describe('клинические тесты живут внутри общего рубильника ЛФК (решение владельца 2026-09-11)', () => {
  const createClinicalTestPort = vi.fn();
  const createTestSetPort = vi.fn();
  const addStageItemPort = vi.fn();
  let asked: string[] = [];

  function deps(enabled: boolean) {
    asked = [];
    return {
      orgEntitlements: exerciseCatalogSwitch(enabled, asked),
      clinicalTests: { createClinicalTest: createClinicalTestPort },
      testSets: { createTestSet: createTestSetPort },
      treatmentProgram: { addStageItem: addStageItemPort },
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requireDoctorWorkspaceApiContext.mockResolvedValue({
      ok: true,
      ctx: { organizationId: ORGANIZATION_ID, session: { user: { userId: USER_ID } } },
    });
    createClinicalTestPort.mockResolvedValue({ id: TEST_ID, title: 'Тест равновесия' });
    createTestSetPort.mockResolvedValue({ id: TEST_ID, title: 'Первичный осмотр' });
    addStageItemPort.mockResolvedValue({ id: TEST_ID, itemType: 'clinical_test' });
  });

  it('при включённой механике создание теста и набора проходит', async () => {
    fakes.buildAppDeps.mockReturnValue(deps(true));

    const [clinicalTestResponse, testSetResponse] = await Promise.all([
      createClinicalTest(
        request('https://app.example.test/api/doctor/clinical-tests', { title: 'Тест равновесия' }),
      ),
      createTestSet(
        request('https://app.example.test/api/doctor/test-sets', { title: 'Первичный осмотр' }),
      ),
    ]);

    expect(clinicalTestResponse.status).toBe(200);
    expect(testSetResponse.status).toBe(200);
    expect(createClinicalTestPort).toHaveBeenCalledTimes(1);
    expect(createTestSetPort).toHaveBeenCalledTimes(1);
  });

  it('спрашивает ИМЕННО общий ключ области ЛФК, а не отдельный ключ для тестов', async () => {
    fakes.buildAppDeps.mockReturnValue(deps(true));

    await createClinicalTest(
      request('https://app.example.test/api/doctor/clinical-tests', { title: 'Тест равновесия' }),
    );

    expect(asked.length).toBeGreaterThan(0);
    expect(new Set(asked)).toEqual(new Set(['exercise_catalog']));
    expect(asked).not.toContain('clinical_tests');
  });

  it('при выключенной механике создание теста и набора НЕ доходит до порта', async () => {
    fakes.buildAppDeps.mockReturnValue(deps(false));

    const [clinicalTestResponse, testSetResponse] = await Promise.all([
      createClinicalTest(
        request('https://app.example.test/api/doctor/clinical-tests', { title: 'Тест равновесия' }),
      ),
      createTestSet(
        request('https://app.example.test/api/doctor/test-sets', { title: 'Первичный осмотр' }),
      ),
    ]);

    expect(clinicalTestResponse.status).not.toBe(200);
    expect(testSetResponse.status).not.toBe(200);
    expect(createClinicalTestPort).not.toHaveBeenCalled();
    expect(createTestSetPort).not.toHaveBeenCalled();
  });

  it('при выключенной механике клинический тест не кладётся в этап программы', async () => {
    fakes.buildAppDeps.mockReturnValue(deps(false));

    const response = await addTemplateStageItem(
      request(`https://app.example.test/api/doctor/treatment-program-templates/stages/${STAGE_ID}/items`, {
        itemType: 'clinical_test',
        itemRefId: TEST_ID,
      }),
      { params: Promise.resolve({ stageId: STAGE_ID }) },
    );

    expect(response.status).not.toBe(200);
    expect(addStageItemPort).not.toHaveBeenCalled();
  });

  it('при включённой механике клинический тест кладётся в этап программы', async () => {
    fakes.buildAppDeps.mockReturnValue(deps(true));

    const response = await addTemplateStageItem(
      request(`https://app.example.test/api/doctor/treatment-program-templates/stages/${STAGE_ID}/items`, {
        itemType: 'clinical_test',
        itemRefId: TEST_ID,
      }),
      { params: Promise.resolve({ stageId: STAGE_ID }) },
    );

    expect(response.status).toBe(200);
    expect(addStageItemPort).toHaveBeenCalledWith(
      STAGE_ID,
      expect.objectContaining({ itemType: 'clinical_test', itemRefId: TEST_ID }),
      expect.any(Object),
    );
  });
});
