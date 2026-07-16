/** @vitest-environment node */

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/config/env", () => ({
  env: {
    S3_ENDPOINT: "https://fs.test",
    S3_ACCESS_KEY: "a",
    S3_SECRET_KEY: "b",
    S3_PUBLIC_BUCKET: "pub",
    S3_PRIVATE_BUCKET: "priv",
    S3_REGION: "us-east-1",
    S3_FORCE_PATH_STYLE: true,
  },
  isS3MediaEnabled: () => true,
}));

const insertMock = vi.fn();
const deleteMock = vi.fn();
const presignMock = vi.fn();
const lockMock = vi.fn();
const withExplicitOrganizationPrincipalMock = vi.fn();
const principalState = { inside: false };

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

vi.mock("@/app-layer/media/s3MediaStorage", () => ({
  insertPendingProgramSubmissionMediaFileTx: (...a: unknown[]) => insertMock(...a),
  deletePendingMediaFileById: (...a: unknown[]) => deleteMock(...a),
}));

vi.mock("@/app-layer/media/s3Client", () => ({
  presignPutUrl: (...a: unknown[]) => presignMock(...a),
  s3ObjectKey: (_id: string, name: string) => `media/id/${name}`,
}));

vi.mock("@/app-layer/db/client", () => ({ getPool: () => ({}) }));

vi.mock("@/app-layer/locks/userLifecycleLock", () => ({
  withUserLifecycleLock: (...args: unknown[]) => lockMock(...args),
}));

vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withExplicitOrganizationPrincipal: (...args: unknown[]) => withExplicitOrganizationPrincipalMock(...args),
}));

const ensurePatientFolderMock = vi.fn();
vi.mock("@/infra/repos/pgClientMediaFolders", () => ({
  pgEnsureClientPatientFolder: (...a: unknown[]) => ensurePatientFolderMock(...a),
}));

const getBooleanMock = vi.fn();
const getPatientProgramInteractionPolicyMock = vi.fn();
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    runtimeConfig: { getBoolean: getBooleanMock },
    doctorClients: {
      getPatientProgramInteractionPolicy: getPatientProgramInteractionPolicyMock,
    },
  }),
}));

const gateMock = vi.fn();
vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: (...a: unknown[]) => gateMock(...a),
}));

import { POST } from "./route";

describe("POST /api/patient/media/program-submission/presign", () => {
  beforeEach(() => {
    insertMock.mockReset();
    deleteMock.mockReset();
    presignMock.mockReset();
    lockMock.mockReset();
    withExplicitOrganizationPrincipalMock.mockReset();
    principalState.inside = false;
    ensurePatientFolderMock.mockReset();
    ensurePatientFolderMock.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      parentId: "22222222-2222-4222-8222-222222222222",
      name: "Клиент · 00000000",
      kind: "client_patient",
      patientUserId: "00000000-0000-4000-8000-000000000001",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    getBooleanMock.mockReset();
    getPatientProgramInteractionPolicyMock.mockReset();
    gateMock.mockReset();
    getBooleanMock.mockResolvedValue(true);
    getPatientProgramInteractionPolicyMock.mockResolvedValue({
      organizationId: ORG_ID,
      onSupport: true,
      commentsAllowed: true,
      mediaAllowed: true,
    });
    gateMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "00000000-0000-4000-8000-000000000001", role: "patient" } },
    });
    lockMock.mockImplementation(async (_p, _u, _m, fn) => fn({ query: vi.fn() }));
    withExplicitOrganizationPrincipalMock.mockImplementation(async (_ctx, fn) => {
      principalState.inside = true;
      try {
        return await fn();
      } finally {
        principalState.inside = false;
      }
    });
    presignMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(false);
      return "https://upload.test/put";
    });
    insertMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
    });
  });

  it("returns 403 when feature disabled", async () => {
    getBooleanMock.mockResolvedValue(false);
    const res = await POST(
      new Request("http://localhost/api/patient/media/program-submission/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: "a.jpg", mimeType: "image/jpeg", size: 1000 }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 413 when file exceeds 250 MiB", async () => {
    const res = await POST(
      new Request("http://localhost/api/patient/media/program-submission/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: "big.mp4",
          mimeType: "video/mp4",
          size: 300 * 1024 * 1024,
        }),
      }),
    );
    expect(res.status).toBe(413);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns 415 for disallowed mime", async () => {
    const res = await POST(
      new Request("http://localhost/api/patient/media/program-submission/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: "a.exe", mimeType: "application/x-msdownload", size: 1000 }),
      }),
    );
    expect(res.status).toBe(415);
  });

  it("returns 403 when patient support policy has no organization context", async () => {
    getPatientProgramInteractionPolicyMock.mockResolvedValue({
      organizationId: null,
      onSupport: true,
      commentsAllowed: true,
      mediaAllowed: true,
    });
    const res = await POST(
      new Request("http://localhost/api/patient/media/program-submission/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: "a.jpg", mimeType: "image/jpeg", size: 1000 }),
      }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: "organization_context_required" });
    expect(withExplicitOrganizationPrincipalMock).not.toHaveBeenCalled();
    expect(ensurePatientFolderMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    expect(presignMock).not.toHaveBeenCalled();
  });

  it("returns presign payload for allowed mime", async () => {
    ensurePatientFolderMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      return {
        id: "11111111-1111-4111-8111-111111111111",
        parentId: "22222222-2222-4222-8222-222222222222",
        name: "Клиент · 00000000",
        kind: "client_patient",
        patientUserId: "00000000-0000-4000-8000-000000000001",
        createdAt: "2026-01-01T00:00:00.000Z",
      };
    });
    const res = await POST(
      new Request("http://localhost/api/patient/media/program-submission/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: "a.jpg", mimeType: "image/jpeg", size: 1000 }),
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.mediaId).toBeTruthy();
    expect(data.uploadUrl).toBe("https://upload.test/put");
    expect(withExplicitOrganizationPrincipalMock).toHaveBeenCalledWith(
      { organizationId: ORG_ID, source: "patient.program-submission.media.presign" },
      expect.any(Function),
    );
  });
});
