/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/env", () => ({
  env: { S3_ENDPOINT: "https://s3.test", S3_ACCESS_KEY: "a", S3_SECRET_KEY: "b" },
  isS3MediaEnabled: () => true,
}));

const gateMock = vi.fn();
const resolveMock = vi.fn();
const ensureFolderMock = vi.fn();
const insertMock = vi.fn();
const presignMock = vi.fn();

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: () => gateMock(),
}));
vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: (_ctx: unknown, fn: () => unknown) => fn(),
}));
vi.mock("../../_doctorInstanceWorkspace", () => ({
  resolveDoctorInstanceInWorkspace: (...args: unknown[]) => resolveMock(...args),
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({ buildAppDeps: () => ({}) }));
vi.mock("@/app-layer/media/clientMediaFolders", () => ({
  pgEnsureClientPatientFolder: (...args: unknown[]) => ensureFolderMock(...args),
}));
vi.mock("@/app-layer/media/s3MediaStorage", () => ({
  insertPendingMediaFileTx: (...args: unknown[]) => insertMock(...args),
  deletePendingMediaFileById: vi.fn(),
}));
vi.mock("@/app-layer/media/s3Client", () => ({
  s3ObjectKey: (_id: string, filename: string) => `media/${filename}`,
  presignPutUrl: (...args: unknown[]) => presignMock(...args),
}));
vi.mock("@/app-layer/db/client", () => ({ getPool: () => ({}) }));
vi.mock("@/app-layer/locks/userLifecycleLock", () => ({
  withUserLifecycleLock: async (_pool: unknown, _userId: string, _mode: string, fn: (client: unknown) => unknown) => fn({}),
}));

import { POST } from "./route";

const INSTANCE_ID = "11111111-1111-4111-8111-111111111111";
const PATIENT_ID = "22222222-2222-4222-8222-222222222222";
const DOCTOR_ID = "33333333-3333-4333-8333-333333333333";
const ORG_ID = "44444444-4444-4444-8444-444444444444";
const context = { params: Promise.resolve({ instanceId: INSTANCE_ID }) };

describe("POST doctor instance individual exercise media-presign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gateMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: ORG_ID,
        session: { user: { userId: DOCTOR_ID, role: "doctor" } },
      },
    });
    resolveMock.mockResolvedValue({
      ok: true,
      instance: { id: INSTANCE_ID, organizationId: ORG_ID, patientUserId: PATIENT_ID },
    });
    ensureFolderMock.mockResolvedValue({ id: "55555555-5555-4555-8555-555555555555" });
    presignMock.mockResolvedValue("https://s3.test/upload");
  });

  it("resolves the patient from the authorized instance and stores video in that patient folder", async () => {
    const response = await POST(
      new Request("http://local", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: "demo.mp4", mimeType: "video/mp4", size: 1024 }),
      }),
      context,
    );
    expect(response.status).toBe(200);
    expect(ensureFolderMock).toHaveBeenCalledWith(PATIENT_ID);
    expect(insertMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: DOCTOR_ID, folderId: "55555555-5555-4555-8555-555555555555" }),
    );
  });

  it("fails closed when the instance is outside the current organization", async () => {
    resolveMock.mockResolvedValue({
      ok: false,
      response: Response.json({ ok: false, error: "not_found" }, { status: 404 }),
    });
    const response = await POST(
      new Request("http://local", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: "demo.mp4", mimeType: "video/mp4", size: 1024 }),
      }),
      context,
    );
    expect(response.status).toBe(404);
    expect(ensureFolderMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("accepts only video mime types", async () => {
    const response = await POST(
      new Request("http://local", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: "photo.jpg", mimeType: "image/jpeg", size: 1024 }),
      }),
      context,
    );
    expect(response.status).toBe(415);
    expect(resolveMock).not.toHaveBeenCalled();
  });
});
