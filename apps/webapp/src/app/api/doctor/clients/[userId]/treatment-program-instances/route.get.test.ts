import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionMock,
  listClinicalMock,
  getClientIdentityMock,
  buildAppDepsMock,
} = vi.hoisted(() => {
  const listClinicalMockInner = vi.fn();
  return {
    getSessionMock: vi.fn(),
    listClinicalMock: listClinicalMockInner,
    getClientIdentityMock: vi.fn(),
    buildAppDepsMock: vi.fn(() => ({
      treatmentProgramInstance: {
        listForPatientClinicalView: listClinicalMockInner,
      },
      doctorClientsPort: {
        getClientIdentity: getClientIdentityMock,
      },
    })),
  };
});

vi.mock("@/app-layer/di/buildAppDeps", () => ({ buildAppDeps: buildAppDepsMock }));
vi.mock("@/modules/auth/service", () => ({ getCurrentSession: getSessionMock }));

import { GET } from "./route";

const PATIENT_ID = "00000000-0000-4000-8000-000000000001";
const DOCTOR_INSTANCE = {
  id: "11111111-1111-4111-8111-111111111111",
  patientUserId: PATIENT_ID,
  templateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  assignedBy: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  assignmentSource: "doctor" as const,
  title: "Клиника",
  status: "active" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  patientPlanLastOpenedAt: null,
};

describe("GET /api/doctor/clients/[userId]/treatment-program-instances", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    listClinicalMock.mockReset();
    getClientIdentityMock.mockReset();
    getSessionMock.mockResolvedValue({
      user: { userId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", role: "doctor", bindings: {} },
    });
    getClientIdentityMock.mockResolvedValue({
      userId: PATIENT_ID,
      displayName: "P",
      phone: "+70000000000",
      bindings: {},
      createdAt: null,
      isBlocked: false,
      blockedReason: null,
      isArchived: false,
    });
  });

  it("returns clinical instances without promo", async () => {
    listClinicalMock.mockResolvedValue([DOCTOR_INSTANCE]);
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ userId: PATIENT_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, items: [DOCTOR_INSTANCE] });
    expect(listClinicalMock).toHaveBeenCalledWith(PATIENT_ID);
  });
});
