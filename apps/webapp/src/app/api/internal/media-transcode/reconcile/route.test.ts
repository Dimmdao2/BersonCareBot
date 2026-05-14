/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const runBackfillMock = vi.fn();

const reconcileTestEnv = vi.hoisted(() => ({
  INTERNAL_JOB_SECRET: "test-internal-secret" as string | undefined,
}));

vi.mock("@/config/env", () => ({
  env: reconcileTestEnv,
  webappReposAreInMemory: () => true,
}));

vi.mock("@/modules/system-settings/configAdapter", () => ({
  getConfigBool: vi.fn(),
}));

vi.mock("@/app-layer/media/videoHlsLegacyBackfill", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app-layer/media/videoHlsLegacyBackfill")>();
  return {
    ...actual,
    runVideoHlsLegacyBackfill: (...args: unknown[]) => runBackfillMock(...args),
  };
});

vi.mock("@/app-layer/logging/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import { getConfigBool } from "@/modules/system-settings/configAdapter";
import { logger } from "@/app-layer/logging/logger";
import { resetMediaTranscodeReconcileWriteLog, mediaTranscodeReconcileWriteLog, setOperatorHealthWriteReconcileSuccessThrowsForTests } from "@/infra/repos/inMemoryOperatorHealthWrite";
import { POST } from "./route";

describe("POST /api/internal/media-transcode/reconcile", () => {
  beforeEach(() => {
    runBackfillMock.mockReset();
    vi.mocked(getConfigBool).mockReset();
    reconcileTestEnv.INTERNAL_JOB_SECRET = "test-internal-secret";
    resetMediaTranscodeReconcileWriteLog();
    setOperatorHealthWriteReconcileSuccessThrowsForTests(undefined);
  });

  it("returns 503 when INTERNAL_JOB_SECRET is not configured", async () => {
    reconcileTestEnv.INTERNAL_JOB_SECRET = "";
    vi.mocked(getConfigBool).mockResolvedValue(true);
    const res = await POST(
      new Request("http://localhost/api/internal/media-transcode/reconcile", {
        method: "POST",
        headers: {
          authorization: "Bearer test-internal-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ limit: 10 }),
      }),
    );
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe("not_configured");
    expect(runBackfillMock).not.toHaveBeenCalled();
  });

  it("returns 400 when JSON body is not valid JSON", async () => {
    vi.mocked(getConfigBool).mockResolvedValue(true);
    const res = await POST(
      new Request("http://localhost/api/internal/media-transcode/reconcile", {
        method: "POST",
        headers: {
          authorization: "Bearer test-internal-secret",
          "content-type": "application/json",
        },
        body: "{",
      }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe("invalid_body");
    expect(runBackfillMock).not.toHaveBeenCalled();
  });

  it("returns 400 when limit is not coercible to a valid integer", async () => {
    vi.mocked(getConfigBool).mockResolvedValue(true);
    const res = await POST(
      new Request("http://localhost/api/internal/media-transcode/reconcile", {
        method: "POST",
        headers: {
          authorization: "Bearer test-internal-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ limit: "nope" }),
      }),
    );
    expect(res.status).toBe(400);
    expect(runBackfillMock).not.toHaveBeenCalled();
  });

  it("returns 401 without bearer token", async () => {
    const res = await POST(
      new Request("http://localhost/api/internal/media-transcode/reconcile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: 10 }),
      }),
    );
    expect(res.status).toBe(401);
    expect(runBackfillMock).not.toHaveBeenCalled();
  });

  it("returns 503 when pipeline flag is off", async () => {
    vi.mocked(getConfigBool).mockImplementation(async (key: string) =>
      key === "video_hls_reconcile_enabled" ? true : false,
    );
    const res = await POST(
      new Request("http://localhost/api/internal/media-transcode/reconcile", {
        method: "POST",
        headers: {
          authorization: "Bearer test-internal-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ limit: 10 }),
      }),
    );
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe("pipeline_disabled");
    expect(runBackfillMock).not.toHaveBeenCalled();
  });

  it("returns 503 when reconcile flag is off", async () => {
    vi.mocked(getConfigBool).mockImplementation(async (key: string) =>
      key === "video_hls_pipeline_enabled" ? true : false,
    );
    const res = await POST(
      new Request("http://localhost/api/internal/media-transcode/reconcile", {
        method: "POST",
        headers: {
          authorization: "Bearer test-internal-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ limit: 10 }),
      }),
    );
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe("reconcile_disabled");
    expect(runBackfillMock).not.toHaveBeenCalled();
  });

  it("returns 400 when limit exceeds cap", async () => {
    vi.mocked(getConfigBool).mockResolvedValue(true);
    const res = await POST(
      new Request("http://localhost/api/internal/media-transcode/reconcile", {
        method: "POST",
        headers: {
          authorization: "Bearer test-internal-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ limit: 201 }),
      }),
    );
    expect(res.status).toBe(400);
    expect(runBackfillMock).not.toHaveBeenCalled();
  });

  it("runs one backfill batch when authorized and flags on", async () => {
    vi.mocked(getConfigBool).mockResolvedValue(true);
    runBackfillMock.mockResolvedValue({
      dryRun: false,
      pipelineEnabled: true,
      abortedReason: null,
      batches: 1,
      candidatesScanned: 5,
      skippedOversized: 0,
      skippedPipelineOff: 0,
      enqueue: {
        queuedNew: 2,
        alreadyQueued: 1,
        alreadyReady: 0,
        notVideo: 0,
        notReadable: 0,
        noS3Key: 0,
        notFound: 0,
        errors: 0,
      },
      lastMediaId: "00000000-0000-4000-8000-000000000099",
      statusHistogram: [],
      failedReasons: [],
    });

    const res = await POST(
      new Request("http://localhost/api/internal/media-transcode/reconcile", {
        method: "POST",
        headers: {
          authorization: "Bearer test-internal-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ limit: 100 }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; report?: { candidatesScanned: number } };
    expect(json.ok).toBe(true);
    expect(json.report?.candidatesScanned).toBe(5);
    expect(runBackfillMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dryRun: false,
        limit: 100,
        batchSize: 100,
        sleepMsBetweenBatches: 0,
        includeFailed: false,
        requirePipelineEnabled: true,
        defaultRunCap: 200,
      }),
    );
    expect(mediaTranscodeReconcileWriteLog).toHaveLength(1);
    expect(mediaTranscodeReconcileWriteLog[0]?.kind).toBe("success");
    const tick = mediaTranscodeReconcileWriteLog[0] as { kind: "success"; metaJson: Record<string, unknown> };
    expect(tick.metaJson.candidatesScanned).toBe(5);
    expect(tick.metaJson.queuedNew).toBe(2);
  });

  it("returns 200 with report when success tick write fails (best-effort)", async () => {
    vi.mocked(getConfigBool).mockResolvedValue(true);
    setOperatorHealthWriteReconcileSuccessThrowsForTests(new Error("pg tick failed"));
    runBackfillMock.mockResolvedValue({
      dryRun: false,
      pipelineEnabled: true,
      abortedReason: null,
      batches: 1,
      candidatesScanned: 1,
      skippedOversized: 0,
      skippedPipelineOff: 0,
      enqueue: {
        queuedNew: 0,
        alreadyQueued: 0,
        alreadyReady: 1,
        notVideo: 0,
        notReadable: 0,
        noS3Key: 0,
        notFound: 0,
        errors: 0,
      },
      lastMediaId: null,
      statusHistogram: [],
      failedReasons: [],
    });

    const res = await POST(
      new Request("http://localhost/api/internal/media-transcode/reconcile", {
        method: "POST",
        headers: {
          authorization: "Bearer test-internal-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ limit: 10 }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; report?: { candidatesScanned: number } };
    expect(json.ok).toBe(true);
    expect(json.report?.candidatesScanned).toBe(1);
    expect(mediaTranscodeReconcileWriteLog).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("writes operator_job_status failure tick when reconcile throws", async () => {
    vi.mocked(getConfigBool).mockResolvedValue(true);
    runBackfillMock.mockRejectedValue(new Error("boom"));

    const res = await POST(
      new Request("http://localhost/api/internal/media-transcode/reconcile", {
        method: "POST",
        headers: {
          authorization: "Bearer test-internal-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ limit: 10 }),
      }),
    );
    expect(res.status).toBe(500);
    expect(mediaTranscodeReconcileWriteLog).toHaveLength(1);
    expect(mediaTranscodeReconcileWriteLog[0]?.kind).toBe("failure");
    expect((mediaTranscodeReconcileWriteLog[0] as { error: string }).error).toContain("boom");
  });
});
