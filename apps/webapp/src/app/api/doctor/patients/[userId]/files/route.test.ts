import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const buildAppDepsMock = vi.hoisted(() => vi.fn());
const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() => vi.fn((_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
  const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
  if (!fn) throw new Error("principal_callback_required");
  return fn();
}));
const pgEnsureClientPatientFolderMock = vi.hoisted(() => vi.fn());
const requireEntitlementMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));

vi.mock("@/app-layer/guards/requireEntitlement", () => ({
  requireEntitlement: requireEntitlementMock,
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

vi.mock("@/app-layer/media/clientMediaFolders", () => ({
  pgEnsureClientPatientFolder: (patientUserId: string) => pgEnsureClientPatientFolderMock(patientUserId),
}));

vi.mock("@/config/env", () => ({
  env: { S3_PRIVATE_BUCKET: "test-bucket" },
  isS3MediaEnabled: () => false,
}));

import { GET, POST } from "./route";

const ORG_ID = "10000000-0000-4000-8000-000000000001";
const DOCTOR_ID = "00000000-0000-4000-8000-00000000000d";
const PATIENT_ID = "00000000-0000-4000-8000-000000000001";
const CANONICAL_PATIENT_ID = "00000000-0000-4000-8000-000000000002";
const FOLDER_ID = "00000000-0000-4000-8000-0000000000ff";

describe("doctor patient files collection route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: ORG_ID,
        session: { user: { userId: DOCTOR_ID, role: "doctor" } },
      },
    });
    requireEntitlementMock.mockReset();
    requireEntitlementMock.mockResolvedValue({ ok: true });
    withDoctorWorkspacePrincipalMock.mockImplementation(
      (_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
        const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
        if (!fn) throw new Error("principal_callback_required");
        return fn();
      },
    );
    pgEnsureClientPatientFolderMock.mockResolvedValue({ id: FOLDER_ID });
  });

  it("returns workspace gate response before resolving deps", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "doctor_workspace_membership_required" }, { status: 403 }),
    });

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ userId: PATIENT_ID }),
    });

    expect(res.status).toBe(403);
    expect(buildAppDepsMock).not.toHaveBeenCalled();
  });

  it("rejects file reads outside selected workspace", async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue(null);
    const listFiles = vi.fn();
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      patientFiles: { listFiles },
    });

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ userId: PATIENT_ID }),
    });

    expect(res.status).toBe(404);
    expect(getClientIdentityForOrganization).toHaveBeenCalledWith(PATIENT_ID, ORG_ID);
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
    expect(listFiles).not.toHaveBeenCalled();
  });

  it("lists files for canonical patient under selected workspace principal", async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue({ userId: CANONICAL_PATIENT_ID });
    const listFiles = vi.fn().mockResolvedValue([{ id: "file-1", s3Key: "patient-files/file-1/a.pdf" }]);
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      patientFiles: { listFiles },
    });

    const res = await GET(new Request("http://localhost?category=анализ"), {
      params: Promise.resolve({ userId: PATIENT_ID }),
    });
    const json = (await res.json()) as { ok?: boolean; files?: Array<{ id: string; previewUrl: string | null }> };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.files?.[0]?.previewUrl).toBeNull();
    expect(listFiles).toHaveBeenCalledWith(CANONICAL_PATIENT_ID, "анализ");
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID }),
      expect.any(Function),
    );
  });

  it("does not create patient folder or metadata outside selected workspace", async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue(null);
    const createFile = vi.fn();
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      patientFiles: { createFile },
    });

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category: "анализ", fileName: "blood.pdf", mimeType: "application/pdf", sizeBytes: 10 }),
      }),
      { params: Promise.resolve({ userId: PATIENT_ID }) },
    );

    expect(res.status).toBe(404);
    expect(pgEnsureClientPatientFolderMock).not.toHaveBeenCalled();
    expect(createFile).not.toHaveBeenCalled();
  });

  it("returns files entitlement denial after auth without creating folder or metadata", async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue({
      userId: CANONICAL_PATIENT_ID,
    });
    const createFile = vi.fn();
    buildAppDepsMock.mockReturnValue({ doctorClientsPort: { getClientIdentityForOrganization }, patientFiles: { createFile } });
    requireEntitlementMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "entitlement_required", mechanic: "files" }, { status: 403 }),
    });

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category: "анализ", fileName: "blood.pdf", mimeType: "application/pdf", sizeBytes: 10 }),
      }),
      { params: Promise.resolve({ userId: PATIENT_ID }) },
    );

    expect(res.status).toBe(403);
    expect(getClientIdentityForOrganization).toHaveBeenCalledWith(PATIENT_ID, ORG_ID);
    expect(pgEnsureClientPatientFolderMock).not.toHaveBeenCalled();
    expect(createFile).not.toHaveBeenCalled();
    expect(requireDoctorWorkspaceApiContextMock.mock.invocationCallOrder[0]).toBeLessThan(
      requireEntitlementMock.mock.invocationCallOrder[0]!,
    );
  });

  it("creates file metadata for canonical patient under selected workspace principal", async () => {
    const getClientIdentityForOrganization = vi.fn().mockResolvedValue({ userId: CANONICAL_PATIENT_ID });
    const createFile = vi.fn().mockResolvedValue({ id: "file-1" });
    buildAppDepsMock.mockReturnValue({
      doctorClientsPort: { getClientIdentityForOrganization },
      patientFiles: { createFile },
    });

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category: "анализ", fileName: "blood.pdf", mimeType: "application/pdf", sizeBytes: 10 }),
      }),
      { params: Promise.resolve({ userId: PATIENT_ID }) },
    );

    expect(res.status).toBe(201);
    expect(pgEnsureClientPatientFolderMock).toHaveBeenCalledWith(CANONICAL_PATIENT_ID);
    expect(createFile).toHaveBeenCalledWith(
      expect.objectContaining({
        patientUserId: CANONICAL_PATIENT_ID,
        category: "анализ",
        fileName: "blood.pdf",
        s3Bucket: "test-bucket",
        uploadedByUserId: DOCTOR_ID,
        folderId: FOLDER_ID,
      }),
    );
    expect(createFile).toHaveBeenCalledWith(
      expect.objectContaining({
        s3Key: expect.stringMatching(/^patient-files\/[0-9a-f-]+\/blood\.pdf$/),
      }),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID }),
      expect.any(Function),
    );
  });
});
