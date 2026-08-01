/**
 * #1069 (31.07): `patient_card` is a critical mechanic — the owner named it explicitly as
 * something the tariff must never be able to disable ("карточка пациента — это только
 * медицинские записи визитов... тоже не трогай"). It was found gated via
 * `requireEntitlementForMutation(gate.ctx, 'patient_card')` on nine patient-card write routes,
 * and `patient_card` had a real, toggleable key in `MECHANIC_REGISTRY` — an admin could disable
 * it, and an org with no tariff got it disabled by default.
 *
 * This test proves the fix holds under the worst commercial state (blocked lifecycle, no tariff —
 * every mechanic in `MECHANIC_REGISTRY` resolves to `false`): every
 * patient-card write must still succeed. It exercises the real `requireEntitlementForMutation` /
 * `resolveOrgEntitlementSnapshot` code path (not mocked) against a fake `orgEntitlements` port, so
 * reintroducing the gate call (and the `patient_card` registry key it requires to compile) turns
 * every `it` below into a 403 and fails the assertions.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DoctorWorkspaceAccessContext } from '@/app-layer/guards/requireRole';
import type { ClientIdentity } from '@/modules/doctor-clients/ports';
import type { OrgEntitlementSnapshot } from '@/modules/org-entitlements/types';

type AppDeps = ReturnType<typeof import('@/app-layer/di/buildAppDeps').buildAppDeps>;
type RequireDoctorWorkspace =
  typeof import('@/app-layer/guards/requireRole').requireDoctorWorkspaceApiContext;

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn<typeof import('@/app-layer/di/buildAppDeps').buildAppDeps>(),
  requireDoctorWorkspace: vi.fn<RequireDoctorWorkspace>(),
  getClientIdentity: vi.fn<AppDeps['doctorClientsPort']['getClientIdentityForOrganization']>(),
  getSnapshot: vi.fn<AppDeps['orgEntitlements']['getSnapshot']>(),
  createVisit: vi.fn(),
  updateVisitFields: vi.fn(),
  appendAnamnesisTrauma: vi.fn(),
  updateComplaintFields: vi.fn(),
  updateDiagnosisFields: vi.fn(),
  setDiagnosisClinicalStatus: vi.fn(),
  setPatientPhysical: vi.fn(),
  addComorbidity: vi.fn(),
  editComorbidityText: vi.fn(),
  markComorbidityRemoved: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: fakes.requireDoctorWorkspace,
}));
vi.mock('@bersoncare/db-principal', () => ({
  runWithDbOrganizationPrincipal: <T>(_organizationId: string, callback: () => T): T => callback(),
  runWithDbPatientPrincipal: <T>(_ctx: unknown, callback: () => T): T => callback(),
}));

import { POST as createVisitRoute } from './visits/route';
import { PATCH as updateVisitRoute } from './visits/[visitId]/route';
import { POST as appendAnamnesisRoute } from './anamnesis/route';
import { PATCH as updateComplaintRoute } from './complaints/[complaintId]/route';
import { PATCH as updateDiagnosisRoute } from './diagnoses/[diagnosisId]/route';
import { PATCH as updateDiagnosisStatusRoute } from './diagnoses/[diagnosisId]/status/route';
import { PATCH as updatePhysicalRoute } from './physical/route';
import { POST as createComorbidityRoute } from './comorbidities/route';
import {
  PATCH as updateComorbidityRoute,
  DELETE as deleteComorbidityRoute,
} from './comorbidities/[comorbidityId]/route';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000001069';
const DOCTOR_ID = '00000000-0000-4000-8000-000000002069';
const PATIENT_ID = '00000000-0000-4000-8000-000000003069';
const VISIT_ID = '00000000-0000-4000-8000-000000004069';
const COMPLAINT_ID = '00000000-0000-4000-8000-000000005069';
const DIAGNOSIS_ID = '00000000-0000-4000-8000-000000006069';
const COMORBIDITY_ID = '00000000-0000-4000-8000-000000007069';

const doctorContext: DoctorWorkspaceAccessContext = {
  session: {
    user: { userId: DOCTOR_ID, role: 'doctor', displayName: 'Patient-card doctor', bindings: {} },
    issuedAt: 1_790_000_000,
    expiresAt: 1_790_043_200,
  },
  organizationId: ORGANIZATION_ID,
  membershipId: 'membership-1069',
  membershipRole: 'doctor',
  specialistId: 'specialist-1069',
  canManageOrganization: false,
  canManageAllSpecialists: false,
  canAccessClinicalWorkspace: true,
  capabilities: ['clinical.workspace'],
};

const clientIdentity: ClientIdentity = {
  userId: PATIENT_ID,
  displayName: 'Patient-card patient',
  phone: null,
  bindings: {},
  createdAt: '2026-07-31T00:00:00.000Z',
  isBlocked: false,
  blockedReason: null,
  isArchived: false,
  channelBindingDates: {},
};

/**
 * Worst commercial state: no tariff, lifecycle `blocked` (every `MECHANIC_REGISTRY` key resolves
 * to `false` per `entitlementsFromSnapshot`). If any patient-card route ever asks the resolver
 * about a mechanic again, this snapshot denies it.
 */
const blockedNoTariffSnapshot: OrgEntitlementSnapshot = {
  tariff: null,
  overrides: [],
  access: { lifecycle: 'blocked', tariffId: null, source: 'assignment' },
};

const fakeDeps = {
  doctorClientsPort: { getClientIdentityForOrganization: fakes.getClientIdentity },
  orgEntitlements: { getSnapshot: fakes.getSnapshot },
  patientClinical: {
    createVisit: fakes.createVisit,
    updateVisitFields: fakes.updateVisitFields,
    appendAnamnesisTrauma: fakes.appendAnamnesisTrauma,
    updateComplaintFields: fakes.updateComplaintFields,
    updateDiagnosisFields: fakes.updateDiagnosisFields,
    setDiagnosisClinicalStatus: fakes.setDiagnosisClinicalStatus,
  },
  doctorClients: { setPatientPhysical: fakes.setPatientPhysical },
  patientComorbidities: {
    add: fakes.addComorbidity,
    editText: fakes.editComorbidityText,
    markRemoved: fakes.markComorbidityRemoved,
  },
} as unknown as AppDeps;

function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.buildAppDeps.mockReturnValue(fakeDeps);
  fakes.requireDoctorWorkspace.mockResolvedValue({ ok: true, ctx: doctorContext });
  fakes.getClientIdentity.mockResolvedValue(clientIdentity);
  fakes.getSnapshot.mockResolvedValue(blockedNoTariffSnapshot);
  fakes.createVisit.mockResolvedValue(VISIT_ID);
  fakes.updateVisitFields.mockResolvedValue(true);
  fakes.appendAnamnesisTrauma.mockResolvedValue(undefined);
  fakes.updateComplaintFields.mockResolvedValue(true);
  fakes.updateDiagnosisFields.mockResolvedValue(true);
  fakes.setDiagnosisClinicalStatus.mockResolvedValue(true);
  fakes.setPatientPhysical.mockResolvedValue(undefined);
  fakes.addComorbidity.mockResolvedValue({
    id: COMORBIDITY_ID,
    text: 'Гипертония',
    since: null,
    createdAt: '2026-07-31T00:00:00.000Z',
  });
  fakes.editComorbidityText.mockResolvedValue(true);
  fakes.markComorbidityRemoved.mockResolvedValue(true);
});

describe('patient card mutations ignore commercial/tariff state (critical mechanic, #1069)', () => {
  it('creates a visit', async () => {
    const res = await createVisitRoute(
      jsonRequest(`https://app.example.test/api/doctor/patients/${PATIENT_ID}/visits`, 'POST', {
        visitType: 'first',
        date: '2026-07-31',
      }),
      { params: Promise.resolve({ userId: PATIENT_ID }) },
    );
    expect(res.status).toBe(201);
    expect(fakes.getSnapshot).not.toHaveBeenCalled();
  });

  it('updates a visit', async () => {
    const res = await updateVisitRoute(
      jsonRequest(
        `https://app.example.test/api/doctor/patients/${PATIENT_ID}/visits/${VISIT_ID}`,
        'PATCH',
        { location: 'Кабинет 3' },
      ),
      { params: Promise.resolve({ userId: PATIENT_ID, visitId: VISIT_ID }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('appends an anamnesis entry', async () => {
    const res = await appendAnamnesisRoute(
      jsonRequest(`https://app.example.test/api/doctor/patients/${PATIENT_ID}/anamnesis`, 'POST', {
        section: 'trauma',
        year: '2020',
        what: 'Перелом',
        type: 'Бытовая',
      }),
      { params: Promise.resolve({ userId: PATIENT_ID }) },
    );
    expect(res.status).toBe(201);
  });

  it('updates a complaint', async () => {
    const res = await updateComplaintRoute(
      jsonRequest(
        `https://app.example.test/api/doctor/patients/${PATIENT_ID}/complaints/${COMPLAINT_ID}`,
        'PATCH',
        { priority: true },
      ),
      { params: Promise.resolve({ userId: PATIENT_ID, complaintId: COMPLAINT_ID }) },
    );
    expect(res.status).toBe(200);
  });

  it('updates a diagnosis', async () => {
    const res = await updateDiagnosisRoute(
      jsonRequest(
        `https://app.example.test/api/doctor/patients/${PATIENT_ID}/diagnoses/${DIAGNOSIS_ID}`,
        'PATCH',
        { priority: true },
      ),
      { params: Promise.resolve({ userId: PATIENT_ID, diagnosisId: DIAGNOSIS_ID }) },
    );
    expect(res.status).toBe(200);
  });

  it('updates a diagnosis clinical status', async () => {
    const res = await updateDiagnosisStatusRoute(
      jsonRequest(
        `https://app.example.test/api/doctor/patients/${PATIENT_ID}/diagnoses/${DIAGNOSIS_ID}/status`,
        'PATCH',
        { status: 'подтверждённый' },
      ),
      { params: Promise.resolve({ userId: PATIENT_ID, diagnosisId: DIAGNOSIS_ID }) },
    );
    expect(res.status).toBe(200);
  });

  it('updates physical parameters', async () => {
    const res = await updatePhysicalRoute(
      jsonRequest(`https://app.example.test/api/doctor/patients/${PATIENT_ID}/physical`, 'PATCH', {
        heightCm: 180,
      }),
      { params: Promise.resolve({ userId: PATIENT_ID }) },
    );
    expect(res.status).toBe(200);
  });

  it('creates a comorbidity', async () => {
    const res = await createComorbidityRoute(
      jsonRequest(
        `https://app.example.test/api/doctor/patients/${PATIENT_ID}/comorbidities`,
        'POST',
        { text: 'Гипертония' },
      ),
      { params: Promise.resolve({ userId: PATIENT_ID }) },
    );
    expect(res.status).toBe(201);
  });

  it('updates a comorbidity', async () => {
    const res = await updateComorbidityRoute(
      jsonRequest(
        `https://app.example.test/api/doctor/patients/${PATIENT_ID}/comorbidities/${COMORBIDITY_ID}`,
        'PATCH',
        { text: 'Гипертония II' },
      ),
      { params: Promise.resolve({ userId: PATIENT_ID, comorbidityId: COMORBIDITY_ID }) },
    );
    expect(res.status).toBe(200);
  });

  it('removes a comorbidity', async () => {
    const res = await deleteComorbidityRoute(
      new Request(
        `https://app.example.test/api/doctor/patients/${PATIENT_ID}/comorbidities/${COMORBIDITY_ID}`,
        { method: 'DELETE' },
      ),
      { params: Promise.resolve({ userId: PATIENT_ID, comorbidityId: COMORBIDITY_ID }) },
    );
    expect(res.status).toBe(200);
  });
});
