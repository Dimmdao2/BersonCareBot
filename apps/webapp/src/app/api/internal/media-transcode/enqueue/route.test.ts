/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueueMock = vi.fn();

vi.mock("@/config/env", () => ({
  env: {
    INTERNAL_JOB_SECRET: "test-internal-secret",
  },
}));

vi.mock("@/modules/system-settings/configAdapter", () => ({
  getConfigBool: vi.fn(),
}));

vi.mock("@/app-layer/media/mediaTranscodeJobs", () => ({
  enqueueMediaTranscodeJob: (...args: unknown[]) => enqueueMock(...args),
}));

import { getConfigBool } from "@/modules/system-settings/configAdapter";
import { POST } from "./route";

describe("POST /api/internal/media-transcode/enqueue", () => {
  beforeEach(() => {
    enqueueMock.mockReset();
    vi.mocked(getConfigBool).mockReset();
    vi.mocked(getConfigBool).mockResolvedValue(true);
  });

  it("returns 401 without bearer token", async () => {
    const res = await POST(
      new Request("http://localhost/api/internal/media-transcode/enqueue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaId: "00000000-0000-4000-8000-000000000001" }),
      }),
    );
    expect(res.status).toBe(401);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("returns 503 when pipeline flag is off", async () => {
    vi.mocked(getConfigBool).mockResolvedValue(false);
    const res = await POST(
      new Request("http://localhost/api/internal/media-transcode/enqueue", {
        method: "POST",
        headers: {
          authorization: "Bearer test-internal-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ mediaId: "00000000-0000-4000-8000-000000000001" }),
      }),
    );
    expect(res.status).toBe(503);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("enqueues when authorized", async () => {
    enqueueMock.mockResolvedValue({
      ok: true,
      kind: "queued",
      jobId: "11111111-1111-4111-8111-111111111111",
      alreadyQueued: false,
    });
    const res = await POST(
      new Request("http://localhost/api/internal/media-transcode/enqueue", {
        method: "POST",
        headers: {
          authorization: "Bearer test-internal-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ mediaId: "00000000-0000-4000-8000-000000000002" }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; jobId: string; alreadyQueued: boolean };
    expect(json.ok).toBe(true);
    expect(json.jobId).toBe("11111111-1111-4111-8111-111111111111");
    expect(json.alreadyQueued).toBe(false);
    expect(enqueueMock).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000002");
  });
});
