import { beforeEach, describe, expect, it, vi } from "vitest";

const buildAppDepsMock = vi.hoisted(() => vi.fn());
const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() => vi.fn((_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
  const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
  if (!fn) throw new Error("principal_callback_required");
  return fn();
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));

vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: (
    ctx: unknown,
    sourceOrFn: string | (() => unknown),
    maybeFn?: () => unknown,
  ) => {
    const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
    if (!fn) throw new Error("principal_callback_required");
    return withDoctorWorkspacePrincipalMock(ctx, fn);
  },
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

vi.mock("@/config/env", () => ({
  env: {},
  isS3MediaEnabled: () => false,
}));

import { GET, PATCH } from "./route";

const ORG_ID = "10000000-0000-4000-8000-000000000001";
const PATIENT_ID = "00000000-0000-4000-8000-000000000001";
const CANONICAL_PATIENT_ID = "00000000-0000-4000-8000-000000000002";
const FILE_ID = "00000000-0000-4000-8000-0000000000f1";
const VISIT_ID = "00000000-0000-4000-8000-0000000000v1".replace("v", "a");

function fileRow(overrides: Partial<{ patientUserId: string; fileName: string }> = {}) {
  return {
    id: FILE_ID,
    patientUserId: CANONICAL_PATIENT_ID,
    fileName: "blood.pdf",
    s3Key: "patient-files/file-1/blood.pdf",
    ...overrides,
  };
}

describe("doctor patient file item route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: ORG_ID,
        session: { user: { userId: "doc-1", role: "doctor" } },
      },
    });
    withDoctorWorkspacePrincipalMock.mockImplementation(
      (_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
        const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
        if (!fn) throw new Error("principal_callback_required");
        return fn();
      },
    );
  });

  it("rejects file reads outside selected workspace", async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue(null);
    const getFile = vi.fn();
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      patientFiles: { getFile },
    });

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ userId: PATIENT_ID, fileId: FILE_ID }),
    });

    expect(res.status).toBe(404);
    expect(getClientIdentityForOrganization).toHaveBeenCalledWith(PATIENT_ID, ORG_ID);
    expect(getFile).not.toHaveBeenCalled();
  });

  it("reads file for canonical patient under selected workspace principal", async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue({ userId: CANONICAL_PATIENT_ID });
    const getFile = vi.fn().mockResolvedValue(fileRow());
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      patientFiles: { getFile },
    });

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ userId: PATIENT_ID, fileId: FILE_ID }),
    });

    expect(res.status).toBe(200);
    expect(getFile).toHaveBeenCalledWith(FILE_ID);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID }),
      expect.any(Function),
    );
  });

  it("updates file visit/name under selected workspace principal", async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue({ userId: CANONICAL_PATIENT_ID });
    const getFile = vi.fn().mockResolvedValue(fileRow());
    const linkFileToVisit = vi.fn().mockResolvedValue(fileRow());
    const renameFile = vi.fn().mockResolvedValue(fileRow({ fileName: "renamed.pdf" }));
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      patientFiles: { getFile, linkFileToVisit, renameFile },
    });

    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visitId: VISIT_ID, fileName: "renamed.pdf" }),
      }),
      { params: Promise.resolve({ userId: PATIENT_ID, fileId: FILE_ID }) },
    );

    expect(res.status).toBe(200);
    expect(linkFileToVisit).toHaveBeenCalledWith(FILE_ID, VISIT_ID);
    expect(renameFile).toHaveBeenCalledWith(FILE_ID, "renamed.pdf");
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID }),
      expect.any(Function),
    );
  });

  it("maps principal and visit mismatch errors to not_found", async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue({ userId: CANONICAL_PATIENT_ID });
    const getFile = vi.fn().mockResolvedValue(fileRow());
    const linkFileToVisit = vi.fn().mockRejectedValue(new Error("patient_file_visit_patient_mismatch"));
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      patientFiles: { getFile, linkFileToVisit },
    });

    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visitId: VISIT_ID }),
      }),
      { params: Promise.resolve({ userId: PATIENT_ID, fileId: FILE_ID }) },
    );

    expect(res.status).toBe(404);
  });
});
