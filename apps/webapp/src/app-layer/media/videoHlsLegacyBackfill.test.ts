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
  MEDIA_READABLE_SQL_M,
  runVideoHlsLegacyBackfill,
} from "./videoHlsLegacyBackfill";

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
  it("passes expected params", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: "a", size_bytes: "100" }],
    });
    const pool = { query } as unknown as import("pg").Pool;
    const rows = await fetchLegacyBackfillBatch(pool, {
      batchSize: 5,
      cursorAfterMediaId: "00000000-0000-4000-8000-000000000001",
      cutoffCreatedBefore: new Date("2020-01-01T00:00:00.000Z"),
      includeFailed: true,
    });
    expect(rows).toHaveLength(1);
    expect(query).toHaveBeenCalledTimes(1);
    const [, params] = query.mock.calls[0] as [string, unknown[]];
    const sql = query.mock.calls[0][0] as string;
    expect(params[0]).toBe("00000000-0000-4000-8000-000000000001");
    expect(params[1]).toBe("2020-01-01T00:00:00.000Z");
    expect(params[2]).toBe(5);
    expect(params).toHaveLength(3);
    expect(sql).toContain(MEDIA_READABLE_SQL_M);
    expect(sql).toContain("media_transcode_jobs");
    expect(sql).toContain("video_processing_status = 'failed'");
  });
});

describe("runVideoHlsLegacyBackfill", () => {
  beforeEach(() => {
    enqueueMock.mockReset();
    getConfigBoolMock.mockReset();
    getConfigBoolMock.mockResolvedValue(true);
  });

  it("dry-run does not call enqueue", async () => {
    const query = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("FROM media_files m") && sql.includes("LIMIT")) {
        return Promise.resolve({
          rows: [{ id: "00000000-0000-4000-8000-0000000000aa", size_bytes: "100" }],
        });
      }
      if (sql.includes("GROUP BY") && sql.includes("video_processing_status")) {
        return Promise.resolve({ rows: [{ status: "none", count: "1" }] });
      }
      if (sql.includes("video_processing_status = 'failed'")) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });
    const pool = { query } as unknown as import("pg").Pool;

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
      { pool, sleepFn: async () => {} },
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

    const query = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("FROM media_files m") && sql.includes("ORDER BY m.id")) {
        return Promise.resolve({
          rows: [{ id: "00000000-0000-4000-8000-0000000000bb", size_bytes: "100" }],
        });
      }
      if (sql.includes("GROUP BY") && sql.includes("video_processing_status")) {
        return Promise.resolve({ rows: [{ status: "pending", count: "1" }] });
      }
      if (sql.includes("video_processing_status = 'failed'")) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });
    const pool = { query } as unknown as import("pg").Pool;

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
      { pool, sleepFn: async () => {} },
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

    const query = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("FROM media_files m") && sql.includes("ORDER BY m.id")) {
        return Promise.resolve({
          rows: [
            {
              id: "00000000-0000-4000-8000-0000000000cc",
              size_bytes: String(4 * 1024 * 1024 * 1024),
            },
          ],
        });
      }
      if (sql.includes("GROUP BY") && sql.includes("video_processing_status")) {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes("video_processing_status = 'failed'")) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });
    const pool = { query } as unknown as import("pg").Pool;

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
      { pool, sleepFn: async () => {} },
    );

    expect(enqueueMock).not.toHaveBeenCalled();
    expect(report.skippedOversized).toBe(1);
  });

  it("aborts commit when pipeline disabled and requirePipelineEnabled", async () => {
    getConfigBoolMock.mockResolvedValue(false);

    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as import("pg").Pool;

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
        pool,
        sleepFn: async () => {},
      },
    );

    expect(report.abortedReason).toMatch(/video_hls_pipeline_enabled/);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("counts enqueue throw without aborting run", async () => {
    enqueueMock.mockRejectedValue(new Error("db_down"));

    const query = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("FROM media_files m") && sql.includes("ORDER BY m.id")) {
        return Promise.resolve({
          rows: [{ id: "00000000-0000-4000-8000-0000000000dd", size_bytes: "100" }],
        });
      }
      if (sql.includes("GROUP BY") && sql.includes("video_processing_status")) {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes("video_processing_status = 'failed'")) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });
    const pool = { query } as unknown as import("pg").Pool;

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
      { pool, sleepFn: async () => {} },
    );

    expect(report.enqueue.errors).toBe(1);
  });
});
