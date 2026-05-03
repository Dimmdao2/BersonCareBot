/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const connectMock = vi.fn();

vi.mock("@/infra/db/client", () => ({
  getPool: () => ({
    query: queryMock,
    connect: connectMock,
  }),
}));

import { enqueueMediaTranscodeJob } from "./pgMediaTranscodeJobs";

describe("enqueueMediaTranscodeJob", () => {
  beforeEach(() => {
    queryMock.mockReset();
    connectMock.mockReset();
  });

  it("returns already_ready when HLS is ready", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "00000000-0000-4000-8000-0000000000aa",
          mime_type: "video/mp4",
          s3_key: "media/x/f.mp4",
          hls_master_playlist_s3_key: "media/x/hls/master.m3u8",
          video_processing_status: "ready",
        },
      ],
    });
    const out = await enqueueMediaTranscodeJob("00000000-0000-4000-8000-0000000000aa");
    expect(out).toEqual({ ok: true, kind: "already_ready" });
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("returns not_video for image mime", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "00000000-0000-4000-8000-0000000000bb",
          mime_type: "image/jpeg",
          s3_key: "media/x/a.jpg",
          hls_master_playlist_s3_key: null,
          video_processing_status: null,
        },
      ],
    });
    const out = await enqueueMediaTranscodeJob("00000000-0000-4000-8000-0000000000bb");
    expect(out).toEqual({ ok: false, error: "not_video" });
  });

  it("returns queued with alreadyQueued when active job exists", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "00000000-0000-4000-8000-0000000000cc",
            mime_type: "video/mp4",
            s3_key: "media/x/v.mp4",
            hls_master_playlist_s3_key: null,
            video_processing_status: "pending",
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
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("inserts job in transaction", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "00000000-0000-4000-8000-0000000000dd",
            mime_type: "video/mp4",
            s3_key: "media/x/v.mp4",
            hls_master_playlist_s3_key: null,
            video_processing_status: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const qClient = vi.fn().mockImplementation((sql: string) => {
      if (sql === "BEGIN") return Promise.resolve({ rowCount: 0, rows: [] });
      if (sql.includes("INSERT INTO media_transcode_jobs")) {
        return Promise.resolve({ rows: [{ id: "job-new" }], rowCount: 1 });
      }
      if (sql.includes("UPDATE media_files")) {
        return Promise.resolve({ rowCount: 1, rows: [] });
      }
      if (sql === "COMMIT") return Promise.resolve({ rowCount: 0, rows: [] });
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    connectMock.mockResolvedValue({
      query: qClient,
      release: vi.fn(),
    });

    const out = await enqueueMediaTranscodeJob("00000000-0000-4000-8000-0000000000dd");
    expect(out).toEqual({
      ok: true,
      kind: "queued",
      jobId: "job-new",
      alreadyQueued: false,
    });
    expect(qClient).toHaveBeenCalledWith("BEGIN");
    expect(qClient).toHaveBeenCalledWith("COMMIT");
  });
});
