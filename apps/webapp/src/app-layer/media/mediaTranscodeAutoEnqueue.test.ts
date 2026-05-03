/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const getConfigBoolMock = vi.fn();
const enqueueMock = vi.fn();
const loggerWarn = vi.fn();
const loggerError = vi.fn();

vi.mock("@/modules/system-settings/configAdapter", () => ({
  getConfigBool: (...a: unknown[]) => getConfigBoolMock(...a),
}));

vi.mock("@/app-layer/media/mediaTranscodeJobs", () => ({
  enqueueMediaTranscodeJob: (...a: unknown[]) => enqueueMock(...a),
}));

vi.mock("@/app-layer/logging/logger", () => ({
  logger: {
    warn: (...a: unknown[]) => loggerWarn(...a),
    error: (...a: unknown[]) => loggerError(...a),
  },
}));

import { maybeAutoEnqueueVideoTranscodeAfterUpload } from "./mediaTranscodeAutoEnqueue";

describe("maybeAutoEnqueueVideoTranscodeAfterUpload", () => {
  beforeEach(() => {
    getConfigBoolMock.mockReset();
    enqueueMock.mockReset();
    loggerWarn.mockReset();
    loggerError.mockReset();
  });

  it("does not enqueue when pipeline flag is off", async () => {
    getConfigBoolMock.mockImplementation(async (key: string) => {
      if (key === "video_hls_pipeline_enabled") return false;
      if (key === "video_hls_new_uploads_auto_transcode") return true;
      return false;
    });
    await maybeAutoEnqueueVideoTranscodeAfterUpload("00000000-0000-4000-8000-000000000001");
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("does not enqueue when auto_transcode flag is off (negative phase-06)", async () => {
    getConfigBoolMock.mockImplementation(async (key: string) => {
      if (key === "video_hls_pipeline_enabled") return true;
      if (key === "video_hls_new_uploads_auto_transcode") return false;
      return false;
    });
    await maybeAutoEnqueueVideoTranscodeAfterUpload("00000000-0000-4000-8000-000000000002");
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("enqueues when both flags on", async () => {
    getConfigBoolMock.mockImplementation(async (key: string) => {
      if (key === "video_hls_pipeline_enabled") return true;
      if (key === "video_hls_new_uploads_auto_transcode") return true;
      return false;
    });
    enqueueMock.mockResolvedValue({
      ok: true,
      kind: "queued",
      jobId: "job-1",
      alreadyQueued: false,
    });
    await maybeAutoEnqueueVideoTranscodeAfterUpload("00000000-0000-4000-8000-000000000003");
    expect(enqueueMock).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000003");
    expect(loggerError).not.toHaveBeenCalled();
  });

  it("ignores not_video without warn", async () => {
    getConfigBoolMock.mockResolvedValue(true);
    enqueueMock.mockResolvedValue({ ok: false, error: "not_video" });
    await maybeAutoEnqueueVideoTranscodeAfterUpload("00000000-0000-4000-8000-000000000004");
    expect(loggerWarn).not.toHaveBeenCalled();
  });

  it("logs and swallows enqueue throw", async () => {
    getConfigBoolMock.mockResolvedValue(true);
    enqueueMock.mockRejectedValue(new Error("db_down"));
    await maybeAutoEnqueueVideoTranscodeAfterUpload("00000000-0000-4000-8000-000000000005");
    expect(loggerError).toHaveBeenCalled();
  });
});
