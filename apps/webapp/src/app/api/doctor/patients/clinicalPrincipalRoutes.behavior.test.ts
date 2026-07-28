import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requireDoctorWorkspaceApiContextMock,
  withDoctorWorkspacePrincipalMock,
  patientClinicalMocks,
  getClientIdentityForOrganizationMock,
  principalState,
} = vi.hoisted(() => {
  const principalState = { inside: false };
  return {
    requireDoctorWorkspaceApiContextMock: vi.fn(),
    withDoctorWorkspacePrincipalMock: vi.fn(
      async <T>(_workspace: { organizationId: string }, _source: string, fn: () => Promise<T>) => {
        principalState.inside = true;
        try {
          return await fn();
        } finally {
          principalState.inside = false;
        }
      },
    ),
    patientClinicalMocks: {
      appendAnamnesisTrauma: vi.fn(),
      appendAnamnesisIllness: vi.fn(),
      appendAnamnesisLifestyle: vi.fn(),
      createDiagnosisCatalogEntry: vi.fn(),
      updateComplaintFields: vi.fn(),
      updateDiagnosisFields: vi.fn(),
      setDiagnosisClinicalStatus: vi.fn(),
    },
    getClientIdentityForOrganizationMock: vi.fn(),
    principalState,
  };
});

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: requireDoctorWorkspaceApiContextMock,
  requireDoctorApiSession: vi.fn(),
}));

vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  requireEntitlementForMutation: async () => ({ ok: true }),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    doctorClientsPort: {
      getClientIdentityForOrganization: getClientIdentityForOrganizationMock,
    },
    patientClinical: patientClinicalMocks,
  }),
}));

import { POST as postAnamnesis } from './[userId]/anamnesis/route';
import { PATCH as patchComplaint } from './[userId]/complaints/[complaintId]/route';
import { POST as postDiagnosisCatalog } from './[userId]/diagnosis-catalog/route';
import { PATCH as patchDiagnosis } from './[userId]/diagnoses/[diagnosisId]/route';
import { PATCH as patchDiagnosisStatus } from './[userId]/diagnoses/[diagnosisId]/status/route';

const DOCTOR_ID = '00000000-0000-4000-8000-00000000000d';
const ORG_ID = '00000000-0000-4000-8000-0000000000f1';
const PATIENT_ID = '00000000-0000-4000-8000-000000000001';
const COMPLAINT_ID = '00000000-0000-4000-8000-0000000000c1';
const DIAGNOSIS_ID = '00000000-0000-4000-8000-0000000000d1';

const workspace = {
  organizationId: ORG_ID,
  session: { user: { userId: DOCTOR_ID, role: 'doctor', bindings: {} } },
};

function jsonRequest(url: string, body: unknown, method = 'POST') {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('doctor patient clinical write route principal behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    principalState.inside = false;
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: workspace });
    getClientIdentityForOrganizationMock.mockResolvedValue({ userId: PATIENT_ID });
    patientClinicalMocks.appendAnamnesisTrauma.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      return { id: 'trauma-1' };
    });
    patientClinicalMocks.appendAnamnesisIllness.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      return { id: 'illness-1' };
    });
    patientClinicalMocks.appendAnamnesisLifestyle.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      return { id: 'lifestyle-1' };
    });
    patientClinicalMocks.createDiagnosisCatalogEntry.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      return { id: 'catalog-1', label: 'Diagnosis', note: null };
    });
    patientClinicalMocks.updateComplaintFields.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      return true;
    });
    patientClinicalMocks.updateDiagnosisFields.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      return true;
    });
    patientClinicalMocks.setDiagnosisClinicalStatus.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      return true;
    });
  });

  it('POST anamnesis wraps only the section append mutation', async () => {
    const res = await postAnamnesis(
      jsonRequest(`http://localhost/api/doctor/patients/${PATIENT_ID}/anamnesis`, {
        section: 'trauma',
        year: '2024',
        what: 'Fall',
        type: 'injury',
        immobilization: 'none',
      }),
      { params: Promise.resolve({ userId: PATIENT_ID }) },
    );

    expect(res.status).toBe(201);
    expect(patientClinicalMocks.appendAnamnesisTrauma).toHaveBeenCalledWith(
      expect.objectContaining({ patientUserId: PATIENT_ID, createdBy: DOCTOR_ID }),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      workspace,
      'doctor.patients.clinical.anamnesis.trauma.create',
      expect.any(Function),
    );
  });

  it('POST diagnosis catalog uses the workspace principal', async () => {
    const res = await postDiagnosisCatalog(
      jsonRequest(`http://localhost/api/doctor/patients/${PATIENT_ID}/diagnosis-catalog`, {
        label: 'Diagnosis',
      }),
      { params: Promise.resolve({ userId: PATIENT_ID }) },
    );

    expect(res.status).toBe(201);
    expect(patientClinicalMocks.createDiagnosisCatalogEntry).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Diagnosis', createdBy: DOCTOR_ID }),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      workspace,
      'doctor.patients.clinical.diagnosis-catalog.create',
      expect.any(Function),
    );
  });

  it('PATCH complaint uses the workspace principal', async () => {
    const res = await patchComplaint(
      jsonRequest(
        `http://localhost/api/doctor/patients/${PATIENT_ID}/complaints/${COMPLAINT_ID}`,
        { priority: true },
        'PATCH',
      ),
      { params: Promise.resolve({ userId: PATIENT_ID, complaintId: COMPLAINT_ID }) },
    );

    expect(res.status).toBe(200);
    expect(patientClinicalMocks.updateComplaintFields).toHaveBeenCalledWith({
      patientUserId: PATIENT_ID,
      complaintId: COMPLAINT_ID,
      text: undefined,
      priority: true,
    });
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      workspace,
      'doctor.patients.clinical.complaint.update',
      expect.any(Function),
    );
  });

  it('PATCH diagnosis uses the workspace principal', async () => {
    const res = await patchDiagnosis(
      jsonRequest(
        `http://localhost/api/doctor/patients/${PATIENT_ID}/diagnoses/${DIAGNOSIS_ID}`,
        { text: 'Updated diagnosis' },
        'PATCH',
      ),
      { params: Promise.resolve({ userId: PATIENT_ID, diagnosisId: DIAGNOSIS_ID }) },
    );

    expect(res.status).toBe(200);
    expect(patientClinicalMocks.updateDiagnosisFields).toHaveBeenCalledWith(
      expect.objectContaining({
        patientUserId: PATIENT_ID,
        diagnosisId: DIAGNOSIS_ID,
        text: 'Updated diagnosis',
      }),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      workspace,
      'doctor.patients.clinical.diagnosis.update',
      expect.any(Function),
    );
  });

  it('PATCH diagnosis status uses the workspace principal', async () => {
    const res = await patchDiagnosisStatus(
      jsonRequest(
        `http://localhost/api/doctor/patients/${PATIENT_ID}/diagnoses/${DIAGNOSIS_ID}/status`,
        { status: 'подтверждённый', note: 'confirmed' },
        'PATCH',
      ),
      { params: Promise.resolve({ userId: PATIENT_ID, diagnosisId: DIAGNOSIS_ID }) },
    );

    expect(res.status).toBe(200);
    expect(patientClinicalMocks.setDiagnosisClinicalStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        patientUserId: PATIENT_ID,
        diagnosisId: DIAGNOSIS_ID,
        newStatus: 'подтверждённый',
        changedBy: DOCTOR_ID,
      }),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      workspace,
      'doctor.patients.clinical.diagnosis-status.update',
      expect.any(Function),
    );
  });
});
