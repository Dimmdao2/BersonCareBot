/**
 * #1069 (4a.4): `patient_diaries` is a critical mechanic (owner 31.07, "дневники у пациентов не
 * отбираем" — same treatment as `patient_card`/`patient_app`, see `patientCardNeverGated.route.test.ts`
 * for the sibling proof). Diary write routes on BOTH sides — patient self-service and the doctor
 * workspace — must never call the entitlement resolver at all.
 *
 * This exercises the real route/action handlers (not mocked) against a fake `buildAppDeps()` whose
 * `orgEntitlements` port throws if touched. Reintroducing an entitlement/mechanic gate on any of
 * these write paths turns the corresponding assertion below red (either the resolver gets called,
 * or the response turns into a 403 instead of success).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requirePatientApiBusinessAccess: vi.fn(),
  requirePatientAccessWithPhone: vi.fn(),
  requireDoctorWorkspaceApiContext: vi.fn(),
  withDoctorWorkspacePrincipal: vi.fn(<T>(...args: unknown[]): T => (args.at(-1) as () => T)()),
  getAppDisplayTimeZone: vi.fn().mockResolvedValue('Europe/Moscow'),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePatientApiBusinessAccess: fakes.requirePatientApiBusinessAccess,
  requirePatientAccessWithPhone: fakes.requirePatientAccessWithPhone,
  requireDoctorWorkspaceApiContext: fakes.requireDoctorWorkspaceApiContext,
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: fakes.withDoctorWorkspacePrincipal,
}));
vi.mock('@/modules/system-settings/appDisplayTimezone', () => ({
  getAppDisplayTimeZone: fakes.getAppDisplayTimeZone,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { POST as submitMood } from '@/app/api/patient/mood/route';
import { addSymptomEntry } from '@/app/app/patient/diary/symptoms/actions';
import { POST as createDoctorSymptomTracking } from '@/app/api/doctor/clients/[userId]/symptom-trackings/route';
import { PATCH as updateDoctorLfkDiaryComment } from '@/app/api/doctor/clients/[userId]/lfk-complex-exercises/[exerciseRowId]/route';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000001069';
const PATIENT_ID = '00000000-0000-4000-8000-000000003069';

/** An orgEntitlements port that fails the test the moment anything on it is called. */
function poisonedOrgEntitlements() {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        throw new Error(`orgEntitlements.${String(prop)} must never be called for patient_diaries`);
      },
    },
  );
}

function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('patient_diaries write paths ignore entitlement state (critical mechanic, #1069)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.getAppDisplayTimeZone.mockResolvedValue('Europe/Moscow');
    fakes.withDoctorWorkspacePrincipal.mockImplementation(
      <T>(...args: unknown[]): T => (args.at(-1) as () => T)(),
    );
  });

  it('records a mood check-in without resolving any mechanic', async () => {
    fakes.requirePatientApiBusinessAccess.mockResolvedValue({
      ok: true,
      session: { user: { userId: PATIENT_ID } },
    });
    const submitScore = vi.fn().mockResolvedValue({
      ok: true,
      mood: { score: 4 },
      lastEntry: null,
    });
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: poisonedOrgEntitlements(),
      patientMood: { submitScore },
    });

    const response = await submitMood(
      jsonRequest('https://app.example.test/api/patient/mood', 'POST', { score: 4 }),
    );

    expect(response.status).toBe(200);
    expect(submitScore).toHaveBeenCalledTimes(1);
  });

  it('adds a symptom diary entry without resolving any mechanic', async () => {
    fakes.requirePatientAccessWithPhone.mockResolvedValue({
      user: { userId: PATIENT_ID },
    });
    const addSymptomEntryPort = vi.fn().mockResolvedValue(undefined);
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: poisonedOrgEntitlements(),
      diaries: {
        listSymptomTrackings: vi
          .fn()
          .mockResolvedValue([{ id: 'tracking-1', symptomKey: 'pain' }]),
        listSymptomEntriesForTrackingInRange: vi.fn().mockResolvedValue([]),
        addSymptomEntry: addSymptomEntryPort,
      },
    });

    const form = new FormData();
    form.set('trackingId', 'tracking-1');
    form.set('value', '5');
    form.set('entryType', 'instant');
    const result = await addSymptomEntry(form);

    expect(result).toEqual({ ok: true });
    expect(addSymptomEntryPort).toHaveBeenCalledTimes(1);
  });

  it('creates a doctor-authored symptom tracking without resolving any mechanic', async () => {
    fakes.requireDoctorWorkspaceApiContext.mockResolvedValue({
      ok: true,
      ctx: { organizationId: ORGANIZATION_ID },
    });
    const createSymptomTracking = vi.fn().mockResolvedValue({
      id: 'tracking-1',
      symptomTitle: 'Боль',
      symptomKey: 'pain',
    });
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: poisonedOrgEntitlements(),
      doctorClientsPort: {
        getClientIdentityForOrganization: vi.fn().mockResolvedValue({ userId: PATIENT_ID }),
      },
      diaries: { createSymptomTracking },
    });

    const response = await createDoctorSymptomTracking(
      jsonRequest(
        `https://app.example.test/api/doctor/clients/${PATIENT_ID}/symptom-trackings`,
        'POST',
        { symptomTitle: 'Боль' },
      ),
      { params: Promise.resolve({ userId: PATIENT_ID }) },
    );

    expect(response.status).toBe(200);
    expect(createSymptomTracking).toHaveBeenCalledTimes(1);
  });

  it('updates a doctor comment on an LFK diary entry without resolving any mechanic', async () => {
    fakes.requireDoctorWorkspaceApiContext.mockResolvedValue({
      ok: true,
      ctx: { organizationId: ORGANIZATION_ID },
    });
    const updateLfkComplexExerciseLocalCommentForUser = vi.fn().mockResolvedValue(undefined);
    fakes.buildAppDeps.mockReturnValue({
      orgEntitlements: poisonedOrgEntitlements(),
      doctorClientsPort: {
        getClientIdentityForOrganization: vi.fn().mockResolvedValue({ userId: PATIENT_ID }),
      },
      diaries: { updateLfkComplexExerciseLocalCommentForUser },
    });

    const response = await updateDoctorLfkDiaryComment(
      jsonRequest(
        `https://app.example.test/api/doctor/clients/${PATIENT_ID}/lfk-complex-exercises/00000000-0000-4000-8000-000000009069`,
        'PATCH',
        { localComment: 'Комментарий' },
      ),
      {
        params: Promise.resolve({
          userId: PATIENT_ID,
          exerciseRowId: '00000000-0000-4000-8000-000000009069',
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(updateLfkComplexExerciseLocalCommentForUser).toHaveBeenCalledTimes(1);
  });
});
