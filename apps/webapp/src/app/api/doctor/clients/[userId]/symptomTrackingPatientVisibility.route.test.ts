/**
 * C3M-10 blind acceptance oracle — the per-symptom «разрешить отслеживание пациентом» switch.
 * Oracle: roadmap §C3M.4 («у каждой активной записи `symptom_trackings` появляется отдельный boolean
 * `patient_tracking_enabled` … не переиспользовать `is_active`»; «в workspace settings хранится только
 * create-time default … это шаблон формы, а не живая policy»), §C3M.6 («в режиме `on_support` при
 * создании один раз читается текущее значение `onSupport`») and §C3M.8 («переключение symptom default
 * влияет только на новые tracking»).
 *
 * WHAT BREAKS WITHOUT THIS:
 * 1. `off` still creates a patient-visible tracking (or `all` creates a hidden one), so the
 *    organization's chosen default silently does the opposite of what the specialist selected.
 * 2. `on_support` ignores the client's current `onSupport` at create time.
 * 3. The stored value is recomputed from the current default on read, turning a one-time snapshot
 *    into a live policy: changing the workspace default or the support group later flips symptoms
 *    the specialist already configured, and the patient loses or gains a diary row on his own.
 * 4. The specialist's explicit choice in the create form is overwritten by the default.
 * 5. Turning patient tracking off archives the symptom (`is_active`) instead, so the specialist
 *    loses the symptom and its history from his own card.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireDoctorWorkspaceApiContext: vi.fn(),
  withDoctorWorkspacePrincipal: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: fakes.requireDoctorWorkspaceApiContext,
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: fakes.withDoctorWorkspacePrincipal,
}));

import {
  GET as readSymptomTrackings,
  PATCH as setPatientVisibility,
  POST as createSymptomTracking,
} from './symptom-trackings/route';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000001098';
const PATIENT_ID = '00000000-0000-4000-8000-000000003098';
const TRACKING_ID = '00000000-0000-4000-8000-000000006098';

type Mode = 'off' | 'all' | 'on_support';

function buildDeps(options: {
  mode: Mode;
  onSupport: boolean;
  storedPatientTrackingEnabled?: boolean;
}) {
  const created: Array<{ patientTrackingEnabled?: boolean }> = [];
  const tracking = {
    id: TRACKING_ID,
    organizationId: ORGANIZATION_ID,
    symptomKey: null,
    symptomTitle: 'Боль в колене',
    isActive: true,
    patientTrackingEnabled: options.storedPatientTrackingEnabled ?? true,
  };
  return {
    created,
    tracking,
    deps: {
      doctorClientsPort: {
        getClientIdentityForOrganization: vi.fn().mockResolvedValue({ userId: PATIENT_ID }),
      },
      systemSettings: {
        getDoctorWorkspaceClientDefaults: vi
          .fn()
          .mockResolvedValue({ patientSymptomTrackingDefault: options.mode }),
      },
      doctorClients: {
        getClientSupport: vi.fn().mockResolvedValue({ onSupport: options.onSupport }),
      },
      diaries: {
        createSymptomTracking: vi.fn(async (params: { patientTrackingEnabled?: boolean }) => {
          created.push(params);
          return { ...tracking, patientTrackingEnabled: params.patientTrackingEnabled };
        }),
        listSymptomTrackings: vi.fn().mockResolvedValue([tracking]),
        getSymptomTrackingForUser: vi.fn().mockResolvedValue(tracking),
        setPatientTrackingEnabled: vi.fn().mockResolvedValue(undefined),
        archiveSymptomTracking: vi.fn(),
        renameSymptomTracking: vi.fn(),
        deleteSymptomTracking: vi.fn(),
      },
    },
  };
}

const params = { params: Promise.resolve({ userId: PATIENT_ID }) };

function jsonRequest(method: string, body: unknown): Request {
  return new Request(
    `https://app.example.test/api/doctor/clients/${PATIENT_ID}/symptom-trackings`,
    { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
  );
}

describe('C3M-10 per-symptom patient tracking switch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.requireDoctorWorkspaceApiContext.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: ORGANIZATION_ID,
        session: { user: { userId: '00000000-0000-4000-8000-000000005098' } },
      },
    });
    fakes.withDoctorWorkspacePrincipal.mockImplementation(
      <T>(...args: unknown[]): T => (args.at(-1) as () => T)(),
    );
  });

  it.each([
    ['off', false, false],
    ['off', true, false],
    ['all', false, true],
    ['all', true, true],
    ['on_support', false, false],
    ['on_support', true, true],
  ] as ReadonlyArray<readonly [Mode, boolean, boolean]>)(
    'creates with %s default and onSupport=%s as patientTrackingEnabled=%s',
    async (mode, onSupport, expected) => {
      const { deps, created } = buildDeps({ mode, onSupport });
      fakes.buildAppDeps.mockReturnValue(deps);

      const response = await createSymptomTracking(
        jsonRequest('POST', { symptomTitle: 'Боль в колене' }),
        params,
      );

      expect(response.status).toBe(200);
      expect(created).toHaveLength(1);
      expect(created[0]?.patientTrackingEnabled).toBe(expected);
    },
  );

  it('lets the specialist override the default in the create form', async () => {
    const { deps, created } = buildDeps({ mode: 'off', onSupport: false });
    fakes.buildAppDeps.mockReturnValue(deps);

    await createSymptomTracking(
      jsonRequest('POST', { symptomTitle: 'Боль в колене', patientTrackingEnabled: true }),
      params,
    );

    expect(created[0]?.patientTrackingEnabled).toBe(true);
  });

  it('reports the stored value of an existing tracking, not the current default', async () => {
    const { deps } = buildDeps({
      mode: 'off',
      onSupport: false,
      storedPatientTrackingEnabled: true,
    });
    fakes.buildAppDeps.mockReturnValue(deps);

    const response = await readSymptomTrackings(new Request('https://app.example.test'), params);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      createDefault: false,
      trackings: [{ id: TRACKING_ID, patientTrackingEnabled: true, isActive: true }],
    });
  });

  it('changes only patient visibility and never archives the symptom', async () => {
    const { deps } = buildDeps({ mode: 'all', onSupport: true });
    fakes.buildAppDeps.mockReturnValue(deps);

    const response = await setPatientVisibility(
      jsonRequest('PATCH', { trackingId: TRACKING_ID, patientTrackingEnabled: false }),
      params,
    );

    expect(response.status).toBe(200);
    expect(deps.diaries.setPatientTrackingEnabled).toHaveBeenCalledWith({
      userId: PATIENT_ID,
      trackingId: TRACKING_ID,
      patientTrackingEnabled: false,
    });
    expect(deps.diaries.archiveSymptomTracking).not.toHaveBeenCalled();
    expect(deps.diaries.deleteSymptomTracking).not.toHaveBeenCalled();
  });

  it('refuses a tracking that belongs to another organization', async () => {
    const { deps, tracking } = buildDeps({ mode: 'all', onSupport: false });
    tracking.organizationId = '00000000-0000-4000-8000-000000009098';
    fakes.buildAppDeps.mockReturnValue(deps);

    const response = await setPatientVisibility(
      jsonRequest('PATCH', { trackingId: TRACKING_ID, patientTrackingEnabled: false }),
      params,
    );

    expect(response.status).toBe(404);
    expect(deps.diaries.setPatientTrackingEnabled).not.toHaveBeenCalled();
  });
});
