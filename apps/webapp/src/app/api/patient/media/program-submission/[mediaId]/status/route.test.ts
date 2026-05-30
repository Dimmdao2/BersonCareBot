/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const getStatusRowMock = vi.fn();
const isReadyMock = vi.fn();
const gateMock = vi.fn();
const getSettingMock = vi.fn();

vi.mock("@/app-layer/media/s3MediaStorage", () => ({
  getProgramSubmissionMediaStatusRow: (...a: unknown[]) => getStatusRowMock(...a),
  isProgramSubmissionMediaAttachReady: (...a: unknown[]) => isReadyMock(...a),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    systemSettings: { getSetting: getSettingMock },
  }),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: (...a: unknown[]) => gateMock(...a),
}));

import { GET } from "./route";

const mediaId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const patientId = "00000000-0000-4000-8000-000000000001";

describe("GET /api/patient/media/program-submission/[mediaId]/status", () => {
  beforeEach(() => {
    getStatusRowMock.mockReset();
    isReadyMock.mockReset();
    gateMock.mockReset();
    getSettingMock.mockReset();
    getSettingMock.mockResolvedValue({ valueJson: { value: true } });
    gateMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: patientId, role: "patient" } },
    });
  });

  it("returns ready when attach-ready", async () => {
    const row = {
      id: mediaId,
      mime_type: "video/mp4",
      status: "ready",
      video_processing_status: "ready",
      video_processing_error: null,
    };
    getStatusRowMock.mockResolvedValue(row);
    isReadyMock.mockReturnValue(true);

    const res = await GET(new Request("http://localhost/status"), {
      params: Promise.resolve({ mediaId }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true, ready: true, state: "ready" });
  });

  it("returns processing for video awaiting transcode", async () => {
    const row = {
      id: mediaId,
      mime_type: "video/mp4",
      status: "ready",
      video_processing_status: "pending",
      video_processing_error: null,
    };
    getStatusRowMock.mockResolvedValue(row);
    isReadyMock.mockReturnValue(false);

    const res = await GET(new Request("http://localhost/status"), {
      params: Promise.resolve({ mediaId }),
    });
    const data = await res.json();
    expect(data.ready).toBe(false);
    expect(data.state).toBe("processing");
  });
});
