/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

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

const getRowMock = vi.fn();
const confirmMock = vi.fn();
const headMock = vi.fn();
const enqueueMock = vi.fn();
const gateMock = vi.fn();
const getSettingMock = vi.fn();
const getPatientProgramInteractionPolicyMock = vi.fn();

vi.mock("@/app-layer/media/s3MediaStorage", () => ({
  getMediaRowForConfirm: (...a: unknown[]) => getRowMock(...a),
  confirmProgramSubmissionMediaFileReady: (...a: unknown[]) => confirmMock(...a),
  deletePendingMediaFileById: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/app-layer/media/s3Client", () => ({
  s3HeadObjectDetails: (...a: unknown[]) => headMock(...a),
}));

vi.mock("@/app-layer/media/programSubmissionTranscodeEnqueue", () => ({
  enqueueProgramSubmissionTranscodeAfterConfirm: (...a: unknown[]) => enqueueMock(...a),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    systemSettings: { getSetting: getSettingMock },
    doctorClients: {
      getPatientProgramInteractionPolicy: getPatientProgramInteractionPolicyMock,
    },
  }),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: (...a: unknown[]) => gateMock(...a),
}));

import { POST } from "./route";

const mediaId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const patientId = "00000000-0000-4000-8000-000000000001";

describe("POST /api/patient/media/program-submission/confirm", () => {
  beforeEach(() => {
    getRowMock.mockReset();
    confirmMock.mockReset();
    headMock.mockReset();
    enqueueMock.mockReset();
    gateMock.mockReset();
    getSettingMock.mockReset();
    getPatientProgramInteractionPolicyMock.mockReset();
    getSettingMock.mockResolvedValue({ valueJson: { value: true } });
    getPatientProgramInteractionPolicyMock.mockResolvedValue({
      onSupport: true,
      commentsAllowed: true,
      mediaAllowed: true,
    });
    gateMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: patientId, role: "patient" } },
    });
    enqueueMock.mockResolvedValue({ ok: true });
  });

  it("returns 403 when media flow disabled", async () => {
    getSettingMock.mockResolvedValue({ valueJson: { value: false } });
    const res = await POST(
      new Request("http://localhost/api/patient/media/program-submission/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaId }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when row missing or wrong usage_purpose", async () => {
    getRowMock.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost/api/patient/media/program-submission/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaId }),
      }),
    );
    expect(res.status).toBe(404);

    getRowMock.mockResolvedValue({
      status: "pending",
      s3_key: "media/x/a.jpg",
      mime_type: "image/jpeg",
      usage_purpose: "other",
      size_bytes: 1000,
    });
    const res2 = await POST(
      new Request("http://localhost/api/patient/media/program-submission/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaId }),
      }),
    );
    expect(res2.status).toBe(404);
  });

  it("confirms image without transcode enqueue", async () => {
    getRowMock.mockResolvedValue({
      status: "pending",
      s3_key: "media/x/a.jpg",
      mime_type: "image/jpeg",
      usage_purpose: "program_item_submission",
      size_bytes: 1000,
    });
    headMock.mockResolvedValue({
      contentLength: 1000,
      contentType: "image/jpeg",
      metadata: {},
    });
    confirmMock.mockResolvedValue(true);

    const res = await POST(
      new Request("http://localhost/api/patient/media/program-submission/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaId }),
      }),
    );
    expect(res.status).toBe(200);
    expect(enqueueMock).not.toHaveBeenCalled();
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.mediaId).toBe(mediaId);
  });

  it("enqueues transcode for video after confirm", async () => {
    getRowMock.mockResolvedValue({
      status: "pending",
      s3_key: "media/x/v.mp4",
      mime_type: "video/mp4",
      usage_purpose: "program_item_submission",
      size_bytes: 5_000_000,
    });
    headMock.mockResolvedValue({
      contentLength: 5_000_000,
      contentType: "video/mp4",
      metadata: {},
    });
    confirmMock.mockResolvedValue(true);

    const res = await POST(
      new Request("http://localhost/api/patient/media/program-submission/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaId }),
      }),
    );
    expect(res.status).toBe(200);
    expect(enqueueMock).toHaveBeenCalledWith(mediaId);
  });

  it("returns 413 when S3 object exceeds size limit", async () => {
    getRowMock.mockResolvedValue({
      status: "pending",
      s3_key: "media/x/big.mp4",
      mime_type: "video/mp4",
      usage_purpose: "program_item_submission",
      size_bytes: 300 * 1024 * 1024,
    });
    headMock.mockResolvedValue({
      contentLength: 300 * 1024 * 1024,
      contentType: "video/mp4",
      metadata: {},
    });

    const res = await POST(
      new Request("http://localhost/api/patient/media/program-submission/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaId }),
      }),
    );
    expect(res.status).toBe(413);
    expect(confirmMock).not.toHaveBeenCalled();
  });
});
