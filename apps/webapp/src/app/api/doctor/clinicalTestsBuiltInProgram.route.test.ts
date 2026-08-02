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

function neverTariffGated() {
  return new Proxy(
    {},
    {
      get(_target, property) {
        throw new Error(`orgEntitlements.${String(property)} must not be used for clinical tests`);
      },
    },
  );
}

describe('clinical tests are built into treatment programs (owner correction 2026-08-02)', () => {
  const createClinicalTestPort = vi.fn();
  const createTestSetPort = vi.fn();
  const addStageItemPort = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requireDoctorWorkspaceApiContext.mockResolvedValue({
      ok: true,
      ctx: { organizationId: ORGANIZATION_ID, session: { user: { userId: USER_ID } } },
    });
    createClinicalTestPort.mockResolvedValue({ id: TEST_ID, title: 'Тест равновесия' });
    createTestSetPort.mockResolvedValue({ id: TEST_ID, title: 'Первичный осмотр' });
    addStageItemPort.mockResolvedValue({ id: TEST_ID, itemType: 'clinical_test' });
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: neverTariffGated(),
      clinicalTests: { createClinicalTest: createClinicalTestPort },
      testSets: { createTestSet: createTestSetPort },
      treatmentProgram: { addStageItem: addStageItemPort },
    });
  });

  it('keeps catalog and set creation available without resolving a tariff mechanic', async () => {
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

  it('keeps a clinical-test item available in a treatment program without tariff resolution', async () => {
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
