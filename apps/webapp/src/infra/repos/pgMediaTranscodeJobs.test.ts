/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzleSqlFragmentToApproximateSql } from "@/infra/db/drizzleSqlDebugText";

const runWebappSqlMock = vi.hoisted(() => vi.fn());
const runWebappTransactionMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  getWebappSqlDb: vi.fn(() => ({})),
  runWebappSql: runWebappSqlMock,
  runWebappTransaction: runWebappTransactionMock,
}));

import {
  enqueueMediaTranscodeJob,
  enqueueProgramSubmissionTranscodeJob,
} from "./pgMediaTranscodeJobs";

function approxSqlAt(callIndex: number): string {
  const fragment = runWebappSqlMock.mock.calls[callIndex]?.[1];
  return drizzleSqlFragmentToApproximateSql(fragment);
}

describe("enqueueMediaTranscodeJob", () => {
  beforeEach(() => {
    runWebappSqlMock.mockReset();
    runWebappTransactionMock.mockReset();
    runWebappSqlMock.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it("returns already_ready when HLS is ready", async () => {
    runWebappSqlMock.mockResolvedValueOnce({
      rows: [
        {
          id: "00000000-0000-4000-8000-0000000000aa",
          mime_type: "video/mp4",
          s3_key: "media/x/f.mp4",
          hls_master_playlist_s3_key: "media/x/hls/master.m3u8",
          video_processing_status: "ready",
          usage_purpose: null,
        },
      ],
    });
    const out = await enqueueMediaTranscodeJob("00000000-0000-4000-8000-0000000000aa");
    expect(out).toEqual({ ok: true, kind: "already_ready" });
    expect(runWebappTransactionMock).not.toHaveBeenCalled();
  });

  it("returns not_video for image mime", async () => {
    runWebappSqlMock.mockResolvedValueOnce({
      rows: [
        {
          id: "00000000-0000-4000-8000-0000000000bb",
          mime_type: "image/jpeg",
          s3_key: "media/x/a.jpg",
          hls_master_playlist_s3_key: null,
          video_processing_status: null,
          usage_purpose: null,
        },
      ],
    });
    const out = await enqueueMediaTranscodeJob("00000000-0000-4000-8000-0000000000bb");
    expect(out).toEqual({ ok: false, error: "not_video" });
  });

  it("returns queued with alreadyQueued when active job exists", async () => {
    runWebappSqlMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "00000000-0000-4000-8000-0000000000cc",
            mime_type: "video/mp4",
            s3_key: "media/x/v.mp4",
            hls_master_playlist_s3_key: null,
            video_processing_status: "pending",
            usage_purpose: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "job-existing" }] });
    const out = await enqueueMediaTranscodeJob("00000000-0000-4000-8000-0000000000cc");
    expect(out).toEqual({
      ok: true,
      kind: "queued",
      jobId: "job-existing",
      alreadyQueued: true,
    });
    expect(runWebappTransactionMock).not.toHaveBeenCalled();
  });

  it("inserts job in transaction", async () => {
    runWebappSqlMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "00000000-0000-4000-8000-0000000000dd",
            mime_type: "video/mp4",
            s3_key: "media/x/v.mp4",
            hls_master_playlist_s3_key: null,
            video_processing_status: null,
            usage_purpose: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    runWebappTransactionMock.mockImplementation(async (fn) =>
      fn({
        insert: () => ({
          values: () => ({
            returning: async () => [{ id: "job-new" }],
          }),
        }),
        update: () => ({
          set: () => ({
            where: async () => [],
          }),
        }),
      }),
    );

    const out = await enqueueMediaTranscodeJob("00000000-0000-4000-8000-0000000000dd");
    expect(out).toEqual({
      ok: true,
      kind: "queued",
      jobId: "job-new",
      alreadyQueued: false,
    });
    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
  });

  it("on unique violation (23505), returns alreadyQueued when concurrent insert won the race", async () => {
    runWebappSqlMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "00000000-0000-4000-8000-0000000000ee",
            mime_type: "video/mp4",
            s3_key: "media/x/v.mp4",
            hls_master_playlist_s3_key: null,
            video_processing_status: null,
            usage_purpose: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "job-concurrent" }] });

    runWebappTransactionMock.mockRejectedValueOnce(Object.assign(new Error("duplicate key"), { code: "23505" }));

    const out = await enqueueMediaTranscodeJob("00000000-0000-4000-8000-0000000000ee");
    expect(out).toEqual({
      ok: true,
      kind: "queued",
      jobId: "job-concurrent",
      alreadyQueued: true,
    });
    expect(approxSqlAt(2)).toContain("media_transcode_jobs");
  });
});

describe("enqueueProgramSubmissionTranscodeJob", () => {
  beforeEach(() => {
    runWebappSqlMock.mockReset();
    runWebappTransactionMock.mockReset();
    runWebappSqlMock.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it("returns not_found when usage_purpose is not program_item_submission", async () => {
    runWebappSqlMock.mockResolvedValueOnce({
      rows: [
        {
          id: "00000000-0000-4000-8000-0000000000ff",
          mime_type: "video/mp4",
          s3_key: "media/x/v.mp4",
          hls_master_playlist_s3_key: null,
          video_processing_status: null,
          usage_purpose: null,
        },
      ],
    });
    const out = await enqueueProgramSubmissionTranscodeJob("00000000-0000-4000-8000-0000000000ff");
    expect(out).toEqual({ ok: false, error: "not_found" });
    expect(runWebappTransactionMock).not.toHaveBeenCalled();
  });

  it("returns already_ready when progressive transcode is ready", async () => {
    runWebappSqlMock.mockResolvedValueOnce({
      rows: [
        {
          id: "00000000-0000-4000-8000-000000000011",
          mime_type: "video/mp4",
          s3_key: "media/x/v.mp4",
          hls_master_playlist_s3_key: null,
          video_processing_status: "ready",
          usage_purpose: "program_item_submission",
        },
      ],
    });
    const out = await enqueueProgramSubmissionTranscodeJob("00000000-0000-4000-8000-000000000011");
    expect(out).toEqual({ ok: true, kind: "already_ready" });
    expect(runWebappTransactionMock).not.toHaveBeenCalled();
  });

  it("enqueues job for program submission video", async () => {
    runWebappSqlMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "00000000-0000-4000-8000-000000000022",
            mime_type: "video/mp4",
            s3_key: "media/x/v.mp4",
            hls_master_playlist_s3_key: null,
            video_processing_status: "pending",
            usage_purpose: "program_item_submission",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    runWebappTransactionMock.mockImplementation(async (fn) =>
      fn({
        insert: () => ({
          values: () => ({
            returning: async () => [{ id: "job-program" }],
          }),
        }),
        update: () => ({
          set: () => ({
            where: async () => [],
          }),
        }),
      }),
    );

    const out = await enqueueProgramSubmissionTranscodeJob("00000000-0000-4000-8000-000000000022");
    expect(out).toEqual({
      ok: true,
      kind: "queued",
      jobId: "job-program",
      alreadyQueued: false,
    });
    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
  });
});
