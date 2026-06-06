/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzleSqlFragmentToApproximateSql } from "@/infra/db/drizzleSqlDebugText";

const runWebappSqlMock = vi.hoisted(() => vi.fn());
const insertMock = vi.hoisted(() => vi.fn());
const connectQueryMock = vi.hoisted(() => vi.fn());
const s3PutObjectBodyMock = vi.hoisted(() => vi.fn());
const s3DeleteObjectMock = vi.hoisted(() => vi.fn());
const s3ListObjectKeysUnderPrefixMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  getWebappSqlDb: vi.fn(() => ({
    insert: insertMock,
  })),
  getWebappSqlFromPgClient: vi.fn(() => ({})),
  runWebappSql: runWebappSqlMock,
}));

vi.mock("@/infra/db/pgAdvisoryLock", () => ({
  pgSessionAdvisoryLock: vi.fn().mockResolvedValue(undefined),
  pgSessionAdvisoryUnlock: vi.fn().mockResolvedValue(undefined),
  drizzleOnPgClient: vi.fn(() => ({})),
}));

vi.mock("@/infra/db/client", () => ({
  getPool: () => ({
    connect: async () => ({
      query: (...args: unknown[]) => connectQueryMock(...args),
      release: () => {},
    }),
  }),
}));

vi.mock("@/infra/s3/client", async () => {
  const actual = await vi.importActual<typeof import("@/infra/s3/client")>("@/infra/s3/client");
  return {
    ...actual,
    s3PutObjectBody: (...args: unknown[]) => s3PutObjectBodyMock(...args),
    s3DeleteObject: (...args: unknown[]) => s3DeleteObjectMock(...args),
    s3ListObjectKeysUnderPrefix: (...args: unknown[]) => s3ListObjectKeysUnderPrefixMock(...args),
  };
});

vi.mock("@/config/env", () => ({
  env: {
    MEDIA_STORAGE_DIR: "",
    S3_ENDPOINT: "https://fs.test",
    S3_ACCESS_KEY: "k",
    S3_SECRET_KEY: "s",
    S3_PUBLIC_BUCKET: "b",
    S3_PRIVATE_BUCKET: "private-b",
    S3_REGION: "us-east-1",
    S3_FORCE_PATH_STYLE: true,
  },
}));

import { collectS3KeysForMediaPurge, createS3MediaStoragePort, purgePendingMediaDeleteBatch } from "./s3MediaStorage";

function approxSqlAt(callIndex: number): string {
  const fragment = runWebappSqlMock.mock.calls[callIndex]?.[1];
  return drizzleSqlFragmentToApproximateSql(fragment);
}

describe("createS3MediaStoragePort", () => {
  beforeEach(() => {
    runWebappSqlMock.mockReset();
    insertMock.mockReset();
    connectQueryMock.mockReset();
    s3PutObjectBodyMock.mockReset();
    s3DeleteObjectMock.mockReset();
    s3ListObjectKeysUnderPrefixMock.mockReset();
    s3PutObjectBodyMock.mockResolvedValue(undefined);
    s3DeleteObjectMock.mockResolvedValue(undefined);
    s3ListObjectKeysUnderPrefixMock.mockResolvedValue([]);
    insertMock.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("upload puts object to S3 and inserts ready row", async () => {
    runWebappSqlMock.mockResolvedValueOnce({ rows: [{ id: "11111111-1111-4111-8111-111111111111" }] });

    const port = createS3MediaStoragePort();
    const body = new Uint8Array([9, 9, 9]).buffer;
    const result = await port.upload({
      body,
      filename: "pic.png",
      mimeType: "image/png",
      userId: "22222222-2222-4222-8222-222222222222",
    });

    expect(s3PutObjectBodyMock).toHaveBeenCalledWith(
      expect.stringMatching(/^media\/11111111-1111-4111-8111-111111111111\/pic\.png$/),
      expect.any(Buffer),
      "image/png",
    );
    expect(insertMock).toHaveBeenCalled();
    expect(result.record.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(result.url).toBe("/api/media/11111111-1111-4111-8111-111111111111");
  });

  it("getUrl returns app media path when s3_key is set", async () => {
    runWebappSqlMock.mockResolvedValueOnce({ rows: [{ s3_key: "media/abc/file.png" }] });
    const port = createS3MediaStoragePort();
    const url = await port.getUrl("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(url).toBe("/api/media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("getUrl returns null when no s3_key row", async () => {
    runWebappSqlMock.mockResolvedValueOnce({ rows: [] });
    const port = createS3MediaStoragePort();
    const url = await port.getUrl("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(url).toBeNull();
  });

  it("deleteHard queues pending_delete for S3-backed file (no immediate s3 delete)", async () => {
    runWebappSqlMock
      .mockResolvedValueOnce({ rows: [{ s3_key: "media/x/f.mp4", status: "ready" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    connectQueryMock.mockImplementation((sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT") return Promise.resolve({ rowCount: 0, rows: [] });
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const port = createS3MediaStoragePort();
    const deleted = await port.deleteHard("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    expect(deleted).toBe(true);
    expect(s3DeleteObjectMock).not.toHaveBeenCalled();
    expect(approxSqlAt(1)).toContain("pending_delete");
  });

  it("deleteHard removes DB row when row has no s3_key", async () => {
    runWebappSqlMock
      .mockResolvedValueOnce({ rows: [{ s3_key: null, status: "ready" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    connectQueryMock.mockImplementation((sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT") return Promise.resolve({ rowCount: 0, rows: [] });
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const port = createS3MediaStoragePort();
    const deleted = await port.deleteHard("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
    expect(deleted).toBe(true);
    expect(s3DeleteObjectMock).not.toHaveBeenCalled();
  });

  it("deleteHard returns false when record not found", async () => {
    runWebappSqlMock.mockResolvedValueOnce({ rows: [] });
    connectQueryMock.mockImplementation((sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT") return Promise.resolve({ rowCount: 0, rows: [] });
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const port = createS3MediaStoragePort();
    const deleted = await port.deleteHard("ffffffff-ffff-4fff-8fff-ffffffffffff");
    expect(deleted).toBe(false);
    expect(s3DeleteObjectMock).not.toHaveBeenCalled();
  });
});

describe("purgePendingMediaDeleteBatch", () => {
  beforeEach(() => {
    runWebappSqlMock.mockReset();
    connectQueryMock.mockReset();
    s3DeleteObjectMock.mockReset();
    s3ListObjectKeysUnderPrefixMock.mockReset();
    s3DeleteObjectMock.mockResolvedValue(undefined);
    s3ListObjectKeysUnderPrefixMock.mockResolvedValue([]);
    connectQueryMock.mockImplementation((sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return Promise.resolve({ rowCount: 0, rows: [] });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
  });

  it("collectS3KeysForMediaPurge merges list results with source mp4", async () => {
    s3ListObjectKeysUnderPrefixMock
      .mockResolvedValueOnce(["media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/hls/master.m3u8"])
      .mockResolvedValueOnce(["media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/poster/poster.jpg"]);
    const keys = await collectS3KeysForMediaPurge({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      s3_key: "media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/video.mp4",
      preview_sm_key: "previews/sm/x.jpg",
      preview_md_key: null,
      hls_artifact_prefix: null,
      poster_s3_key: null,
      hls_master_playlist_s3_key: null,
    });
    expect(keys.sort()).toEqual(
      [
        "previews/sm/x.jpg",
        "media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/hls/master.m3u8",
        "media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/poster/poster.jpg",
        "media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/video.mp4",
      ].sort(),
    );
  });

  it("increments delete_attempts and counts errors when S3 delete fails", async () => {
    s3DeleteObjectMock.mockRejectedValueOnce(new Error("s3 unavailable"));
    runWebappSqlMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            s3_key: "media/a/x",
            status: "pending_delete",
            delete_attempts: 0,
            preview_sm_key: null,
            preview_md_key: null,
            hls_artifact_prefix: null,
            poster_s3_key: null,
            hls_master_playlist_s3_key: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const r = await purgePendingMediaDeleteBatch(5);
    expect(r.errors).toBe(1);
    expect(r.removed).toBe(0);
    expect(s3DeleteObjectMock).toHaveBeenCalledWith("media/a/x");
    expect(approxSqlAt(1)).toContain("delete_attempts");
  });

  it("does not throw when DB delete is blocked by check constraint", async () => {
    const pgConstraintErr = Object.assign(new Error("check constraint"), {
      code: "23514",
      constraint: "program_item_discussion_messages_payload_check",
    });

    runWebappSqlMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            s3_key: "media/a/x",
            status: "pending_delete",
            delete_attempts: 2,
            preview_sm_key: null,
            preview_md_key: null,
            hls_artifact_prefix: null,
            poster_s3_key: null,
            hls_master_playlist_s3_key: null,
          },
        ],
      })
      .mockRejectedValueOnce(pgConstraintErr)
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const r = await purgePendingMediaDeleteBatch(5);
    expect(r.errors).toBe(1);
    expect(r.removed).toBe(0);
    expect(s3DeleteObjectMock).toHaveBeenCalledWith("media/a/x");
    expect(approxSqlAt(2)).toContain("delete_attempts");
  });
});
