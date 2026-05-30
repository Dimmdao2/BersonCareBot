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

vi.mock("@/app-layer/media/s3MediaStorage", () => ({
  getMediaRowForConfirm: (...a: unknown[]) => getRowMock(...a),
  confirmProgramSubmissionMediaFileReady: (...a: unknown[]) => confirmMock(...a),
}));

vi.mock("@/app-layer/media/s3Client", () => ({
  s3HeadObject: (...a: unknown[]) => headMock(...a),
}));

vi.mock("@/app-layer/media/programSubmissionTranscodeEnqueue", () => ({
  enqueueProgramSubmissionTranscodeAfterConfirm: (...a: unknown[]) => enqueueMock(...a),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    systemSettings: { getSetting: getSettingMock },
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
    getSettingMock.mockResolvedValue({ valueJson: { value: true } });
    gateMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: patientId, role: "patient" } },
    });
    enqueueMock.mockResolvedValue(undefined);
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
    });
    headMock.mockResolvedValue(true);
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
    });
    headMock.mockResolvedValue(true);
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
});
