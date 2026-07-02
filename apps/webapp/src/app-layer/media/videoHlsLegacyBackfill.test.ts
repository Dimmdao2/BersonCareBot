/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueueMock = vi.fn();
const getConfigBoolMock = vi.fn();

vi.mock("@/app-layer/media/mediaTranscodeJobs", () => ({
  enqueueMediaTranscodeJob: (...a: unknown[]) => enqueueMock(...a),
}));

vi.mock("@/modules/system-settings/configAdapter", () => ({
  getConfigBool: (...a: unknown[]) => getConfigBoolMock(...a),
}));

import {
  clampBackfillBatchSize,
  clampBackfillSleepMs,
  fetchLegacyBackfillBatch,
  legacyHlsBackfillCandidateWhereClause,
  runVideoHlsLegacyBackfill,
} from "./videoHlsLegacyBackfill";
import type {
  VideoHlsLegacyBackfillCandidateRow,
  VideoHlsLegacyBackfillReadRepo,
  VideoHlsLegacyFailedReasonRow,
  VideoHlsLegacyStatusHistogramRow,
} from "@/infra/repos/pgVideoHlsLegacyBackfill";

describe("clampBackfillBatchSize", () => {
  it("clamps to 1..500", () => {
    expect(clampBackfillBatchSize(0)).toBe(50);
    expect(clampBackfillBatchSize(9999)).toBe(500);
    expect(clampBackfillBatchSize(10)).toBe(10);
  });
});

describe("clampBackfillSleepMs", () => {
  it("clamps max sleep", () => {
    expect(clampBackfillSleepMs(-1)).toBe(0);
    expect(clampBackfillSleepMs(9999999)).toBe(600_000);
  });
});

describe("legacyHlsBackfillCandidateWhereClause", () => {
  it("matches fetchLegacyBackfillBatch includeFailed semantics in SQL shape", () => {
    expect(legacyHlsBackfillCandidateWhereClause("x", false)).not.toContain("x.video_processing_status = 'failed'");
    expect(legacyHlsBackfillCandidateWhereClause("x", true)).toContain("x.video_processing_status = 'failed'");
  });
});

describe("fetchLegacyBackfillBatch", () => {
  it("delegates to read repo with expected params", async () => {
    const readRepo = createFakeReadRepo({
      batches: [[{ id: "a", size_bytes: "100" }]],
    });
    const rows = await fetchLegacyBackfillBatch(readRepo, {
      batchSize: 5,
      cursorAfterMediaId: "00000000-0000-4000-8000-000000000001",
      cutoffCreatedBefore: new Date("2020-01-01T00:00:00.000Z"),
      includeFailed: true,
    });
    expect(rows).toHaveLength(1);
    expect(readRepo.fetchBatch).toHaveBeenCalledWith({
      batchSize: 5,
      cursorAfterMediaId: "00000000-0000-4000-8000-000000000001",
      cutoffCreatedBefore: new Date("2020-01-01T00:00:00.000Z"),
      includeFailed: true,
    });
  });
});

function createFakeReadRepo(params?: {
  batches?: VideoHlsLegacyBackfillCandidateRow[][];
  histogram?: VideoHlsLegacyStatusHistogramRow[];
  failedReasons?: VideoHlsLegacyFailedReasonRow[];
}): VideoHlsLegacyBackfillReadRepo {
  const batches = [...(params?.batches ?? [[]])];
  return {
    fetchBatch: vi.fn(async () => batches.shift() ?? []),
    loadHistogram: vi.fn(async () => params?.histogram ?? []),
    loadFailedReasons: vi.fn(async () => params?.failedReasons ?? []),
  };
}

describe("runVideoHlsLegacyBackfill", () => {
  beforeEach(() => {
    enqueueMock.mockReset();
    getConfigBoolMock.mockReset();
    getConfigBoolMock.mockResolvedValue(true);
  });

  it("dry-run does not call enqueue", async () => {
    const readRepo = createFakeReadRepo({
      batches: [[{ id: "00000000-0000-4000-8000-0000000000aa", size_bytes: "100" }], []],
      histogram: [{ status: "none", count: "1" }],
    });

    await runVideoHlsLegacyBackfill(
      {
        dryRun: true,
        limit: 10,
        batchSize: 50,
        sleepMsBetweenBatches: 0,
        cursorAfterMediaId: null,
        cutoffCreatedBefore: null,
        includeFailed: false,
        maxSizeBytes: 3 * 1024 * 1024 * 1024,
        requirePipelineEnabled: true,
        defaultRunCap: 100,
      },
      { readRepo, sleepFn: async () => {} },
    );

    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("commit calls enqueue once per candidate", async () => {
    enqueueMock.mockResolvedValue({
      ok: true,
      kind: "queued",
      jobId: "job-1",
      alreadyQueued: false,
    });

    const readRepo = createFakeReadRepo({
      batches: [[{ id: "00000000-0000-4000-8000-0000000000bb", size_bytes: "100" }], []],
      histogram: [{ status: "pending", count: "1" }],
    });

    const report = await runVideoHlsLegacyBackfill(
      {
        dryRun: false,
        limit: 10,
        batchSize: 50,
        sleepMsBetweenBatches: 0,
        cursorAfterMediaId: null,
        cutoffCreatedBefore: null,
        includeFailed: false,
        maxSizeBytes: 3 * 1024 * 1024 * 1024,
        requirePipelineEnabled: true,
        defaultRunCap: 100,
      },
      { readRepo, sleepFn: async () => {} },
    );

    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock).toHaveBeenCalledWith("00000000-0000-4000-8000-0000000000bb");
    expect(report.enqueue.queuedNew).toBe(1);
    expect(report.lastMediaId).toBe("00000000-0000-4000-8000-0000000000bb");
  });

  it("skips oversized rows without enqueue", async () => {
    enqueueMock.mockResolvedValue({
      ok: true,
      kind: "queued",
      jobId: "job-1",
      alreadyQueued: false,
    });

    const readRepo = createFakeReadRepo({
      batches: [
        [
          {
            id: "00000000-0000-4000-8000-0000000000cc",
            size_bytes: String(4 * 1024 * 1024 * 1024),
          },
        ],
        [],
      ],
    });

    const report = await runVideoHlsLegacyBackfill(
      {
        dryRun: false,
        limit: 10,
        batchSize: 50,
        sleepMsBetweenBatches: 0,
        cursorAfterMediaId: null,
        cutoffCreatedBefore: null,
        includeFailed: false,
        maxSizeBytes: 1024,
        requirePipelineEnabled: true,
        defaultRunCap: 100,
      },
      { readRepo, sleepFn: async () => {} },
    );

    expect(enqueueMock).not.toHaveBeenCalled();
    expect(report.skippedOversized).toBe(1);
  });

  it("aborts commit when pipeline disabled and requirePipelineEnabled", async () => {
    getConfigBoolMock.mockResolvedValue(false);

    const readRepo = createFakeReadRepo();

    const report = await runVideoHlsLegacyBackfill(
      {
        dryRun: false,
        limit: 10,
        batchSize: 50,
        sleepMsBetweenBatches: 0,
        cursorAfterMediaId: null,
        cutoffCreatedBefore: null,
        includeFailed: false,
        maxSizeBytes: 1024,
        requirePipelineEnabled: true,
        defaultRunCap: 100,
      },
      {
        readRepo,
        sleepFn: async () => {},
      },
    );

    expect(report.abortedReason).toMatch(/video_hls_pipeline_enabled/);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("counts enqueue throw without aborting run", async () => {
    enqueueMock.mockRejectedValue(new Error("db_down"));

    const readRepo = createFakeReadRepo({
      batches: [[{ id: "00000000-0000-4000-8000-0000000000dd", size_bytes: "100" }], []],
    });

    const report = await runVideoHlsLegacyBackfill(
      {
        dryRun: false,
        limit: 10,
        batchSize: 50,
        sleepMsBetweenBatches: 0,
        cursorAfterMediaId: null,
        cutoffCreatedBefore: null,
        includeFailed: false,
        maxSizeBytes: 3 * 1024 * 1024 * 1024,
        requirePipelineEnabled: true,
        defaultRunCap: 100,
      },
      { readRepo, sleepFn: async () => {} },
    );

    expect(report.enqueue.errors).toBe(1);
  });
});
