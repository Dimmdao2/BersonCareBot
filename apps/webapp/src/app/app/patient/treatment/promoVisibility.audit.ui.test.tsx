// Audit acceptance for the four patient-facing direct promo entry points.
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  getOptionalPatientSession: vi.fn(),
  patientRscPersonalDataGate: vi.fn(),
  buildAppDeps: vi.fn(),
  getMechanicSurfaceVisibility: vi.fn(),
  resolvePromoAccessForPatient: vi.fn(),
  resolvePlanStartLessonPathForPatient: vi.fn(),
  loadPatientProgramInteractionBundle: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipalOrganizationId: () => ORGANIZATION_ID,
}));
vi.mock('@/app-layer/guards/requireRole', () => ({
  getOptionalPatientSession: fakes.getOptionalPatientSession,
  patientRscPersonalDataGate: fakes.patientRscPersonalDataGate,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  getMechanicSurfaceVisibility: fakes.getMechanicSurfaceVisibility,
}));
vi.mock('@/app-layer/treatment-program/promoMaterializationGate', () => ({
  resolvePromoAccessForPatient: fakes.resolvePromoAccessForPatient,
}));
vi.mock('@/app/app/patient/go/resolvePatientReminderGoTargets', () => ({
  resolvePlanStartLessonPathForPatient: fakes.resolvePlanStartLessonPathForPatient,
}));
vi.mock('@/app/app/patient/treatment/loadPatientProgramInteractionBundle', () => ({
  loadPatientProgramInteractionBundle: fakes.loadPatientProgramInteractionBundle,
}));
vi.mock('@/modules/system-settings/appDisplayTimezone', () => ({
  getAppDisplayTimeZone: vi.fn().mockResolvedValue('Europe/Moscow'),
}));
vi.mock('@/modules/system-settings/calendarIana', () => ({
  resolveCalendarDayIanaForPatient: () => 'Europe/Moscow',
}));
vi.mock('@/modules/reminders/summarizeReminderForCalendarDay', () => ({
  formatExercisesTodayTrainingStatus: () => 'Нет тренировки',
}));
vi.mock('@/modules/treatment-program/stage-semantics', () => ({
  omitDisabledInstanceStageItemsForPatientApi: (detail: unknown) => detail,
  selectCurrentWorkingStageForPatientDetail: () => null,
  splitPatientProgramStagesForDetailUi: () => ({ pipeline: [] }),
}));
vi.mock('@/shared/ui/patient/PatientAppShell', () => ({
  PatientAppShell: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/app/app/patient/treatment/PatientTreatmentProgramDetailClient', () => ({
  PatientTreatmentProgramDetailClient: () => <div>PROGRAM_DETAIL</div>,
}));
vi.mock('@/app/app/patient/treatment/PatientProgramStageItemPageClient', () => ({
  PatientProgramStageItemPageClient: () => <div>PROGRAM_ITEM</div>,
}));

import PatientTreatmentProgramDetailPage from './[instanceId]/page';
import PatientTreatmentProgramItemPage from './[instanceId]/item/[itemId]/page';
import PatientTreatmentPromoDefaultPage from './promo/page';
import PatientTreatmentPromoItemPage from './promo/item/[templateStageItemId]/page';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const INSTANCE_ID = '33333333-3333-4333-8333-333333333333';
const ITEM_ID = '44444444-4444-4444-8444-444444444444';

function detail(assignmentSource: 'promo' | 'doctor') {
  return {
    id: INSTANCE_ID,
    organizationId: ORGANIZATION_ID,
    patientUserId: USER_ID,
    templateId: null,
    assignedBy: assignmentSource === 'doctor' ? 'doctor' : null,
    assignmentSource,
    title: assignmentSource === 'promo' ? 'Промо' : 'Назначенная программа',
    status: 'active',
    stages: [],
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
  };
}

function depsWith(programSource: 'promo' | 'doctor' = 'promo') {
  return {
    patientOrganization: {
      resolveTreatmentProgramOrganizationForPatient: vi
        .fn()
        .mockResolvedValue({ ok: true, organizationId: ORGANIZATION_ID }),
    },
    treatmentProgramInstance: {
      getInstanceForPatient: vi.fn().mockResolvedValue(detail(programSource)),
      listProgramEvents: vi.fn().mockResolvedValue([]),
    },
    treatmentProgramProgress: { listTestResultsForInstance: vi.fn().mockResolvedValue([]) },
    patientCalendarTimezone: { getIanaForUser: vi.fn().mockResolvedValue(null) },
    reminders: { listRulesByUser: vi.fn().mockResolvedValue([]) },
    runtimeConfig: { getInteger: vi.fn().mockResolvedValue(30) },
    treatmentProgram: { getTemplate: vi.fn() },
    systemSettings: { getPatientDefaultPromoTreatmentProgramTemplateId: vi.fn() },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.getOptionalPatientSession.mockResolvedValue({ user: { userId: USER_ID } });
  fakes.patientRscPersonalDataGate.mockResolvedValue('allow');
  fakes.getMechanicSurfaceVisibility.mockResolvedValue({ directUrl: false });
  fakes.resolvePromoAccessForPatient.mockResolvedValue({ visible: false, canMaterialize: false });
  fakes.loadPatientProgramInteractionBundle.mockResolvedValue({
    comments: { visible: false, enabled: false },
    media: { visible: false, enabled: false },
  });
  fakes.buildAppDeps.mockReturnValue(depsWith());
});

describe('promo direct patient surfaces', () => {
  it('closes both legacy promo links before redirecting or materializing when disabled', async () => {
    await expect(PatientTreatmentPromoDefaultPage()).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(
      PatientTreatmentPromoItemPage({ params: Promise.resolve({ templateStageItemId: ITEM_ID }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(fakes.resolvePlanStartLessonPathForPatient).not.toHaveBeenCalled();
  });

  it('closes materialized promo detail and item links when disabled', async () => {
    await expect(
      PatientTreatmentProgramDetailPage({
        params: Promise.resolve({ instanceId: INSTANCE_ID }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(
      PatientTreatmentProgramItemPage({
        params: Promise.resolve({ instanceId: INSTANCE_ID, itemId: ITEM_ID }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(fakes.getMechanicSurfaceVisibility).toHaveBeenCalledTimes(2);
  });

  it('does not apply the promo direct-link gate to an ordinary doctor program', async () => {
    fakes.buildAppDeps.mockReturnValue(depsWith('doctor'));

    await expect(
      PatientTreatmentProgramDetailPage({
        params: Promise.resolve({ instanceId: INSTANCE_ID }),
        searchParams: Promise.resolve({}),
      }),
    ).resolves.toBeTruthy();
    expect(fakes.getMechanicSurfaceVisibility).not.toHaveBeenCalled();
  });
});
