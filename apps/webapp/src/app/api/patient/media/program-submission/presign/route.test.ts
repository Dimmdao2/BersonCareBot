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

const getSettingMock = vi.fn();
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    systemSettings: { getSetting: getSettingMock },
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
    getSettingMock.mockReset();
    gateMock.mockReset();
    getSettingMock.mockResolvedValue({ valueJson: { value: true } });
    gateMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "00000000-0000-4000-8000-000000000001", role: "patient" } },
    });
    lockMock.mockImplementation(async (_p, _u, _m, fn) => fn({ query: vi.fn() }));
    presignMock.mockResolvedValue("https://upload.test/put");
    insertMock.mockResolvedValue(undefined);
  });

  it("returns 403 when feature disabled", async () => {
    getSettingMock.mockResolvedValue({ valueJson: { value: false } });
    const res = await POST(
      new Request("http://localhost/api/patient/media/program-submission/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: "a.jpg", mimeType: "image/jpeg", size: 1000 }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns presign payload for allowed mime", async () => {
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
  });
});
