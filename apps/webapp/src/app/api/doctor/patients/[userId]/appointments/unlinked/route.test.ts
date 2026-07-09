import { beforeEach, describe, expect, it, vi } from "vitest";

const buildAppDepsMock = vi.hoisted(() => vi.fn());
const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() => vi.fn((_: unknown, fn: () => unknown) => fn()));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));

vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: (ctx: unknown, fn: () => unknown) =>
    withDoctorWorkspacePrincipalMock(ctx, fn),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

import { GET } from "./route";

const ORG_ID = "10000000-0000-4000-8000-000000000001";
const PATIENT_ID = "00000000-0000-4000-8000-000000000001";
const CANONICAL_PATIENT_ID = "00000000-0000-4000-8000-000000000002";

describe("doctor patient unlinked appointments route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: ORG_ID, session: { user: { userId: "doctor-1", role: "doctor" } } },
    });
    withDoctorWorkspacePrincipalMock.mockImplementation((_: unknown, fn: () => unknown) => fn());
  });

  it("rejects unlinked appointment reads outside selected workspace", async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue(null);
    const listPatientAppointments = vi.fn();
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization, listPatientAppointments },
      patientClinical: { listLinkedAppointmentRecordIds: vi.fn() },
    });

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ userId: PATIENT_ID }),
    });

    expect(res.status).toBe(404);
    expect(listPatientAppointments).not.toHaveBeenCalled();
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
  });

  it("filters linked appointments for canonical patient under selected workspace principal", async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue({ userId: CANONICAL_PATIENT_ID });
    const listPatientAppointments = vi.fn().mockResolvedValue([
      { id: "a1", internalId: "record-1", status: "upcoming" },
      { id: "a2", internalId: "record-2", status: "upcoming" },
    ]);
    const listLinkedAppointmentRecordIds = vi.fn().mockResolvedValue(["record-1"]);
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization, listPatientAppointments },
      patientClinical: { listLinkedAppointmentRecordIds },
    });

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ userId: PATIENT_ID }),
    });
    const json = (await res.json()) as { appointments?: Array<{ internalId: string }> };

    expect(res.status).toBe(200);
    expect(json.appointments?.map((a) => a.internalId)).toEqual(["record-2"]);
    expect(listPatientAppointments).toHaveBeenCalledWith(CANONICAL_PATIENT_ID, ORG_ID);
    expect(listLinkedAppointmentRecordIds).toHaveBeenCalledWith(CANONICAL_PATIENT_ID);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID }),
      expect.any(Function),
    );
  });
});
