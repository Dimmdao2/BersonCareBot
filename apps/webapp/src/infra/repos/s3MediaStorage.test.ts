/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const connectQueryMock = vi.fn();
const s3PutObjectBodyMock = vi.fn();
const s3DeleteObjectMock = vi.fn();

vi.mock("@/infra/db/client", () => ({
  getPool: () => ({
    query: (...args: unknown[]) => queryMock(...args),
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

import { createS3MediaStoragePort, purgePendingMediaDeleteBatch } from "./s3MediaStorage";

describe("createS3MediaStoragePort", () => {
  beforeEach(() => {
    queryMock.mockReset();
    connectQueryMock.mockReset();
    s3PutObjectBodyMock.mockReset();
    s3DeleteObjectMock.mockReset();
    s3PutObjectBodyMock.mockResolvedValue(undefined);
    s3DeleteObjectMock.mockResolvedValue(undefined);
  });

  // ----- upload -----

  it("upload puts object to S3 and inserts ready row", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: "11111111-1111-4111-8111-111111111111" }] })
      .mockResolvedValueOnce({ rows: [] });

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
    expect(queryMock).toHaveBeenCalledTimes(2);
    const insertSql = String(queryMock.mock.calls[1]![0]);
    expect(insertSql).toContain("INSERT INTO media_files");
    expect(insertSql).toContain("'ready'");
    expect(result.record.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(result.url).toBe("/api/media/11111111-1111-4111-8111-111111111111");
  });

  // ----- getUrl -----

  it("getUrl returns app media path when s3_key is set", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ s3_key: "media/abc/file.png" }] });
    const port = createS3MediaStoragePort();
    const url = await port.getUrl("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(url).toBe("/api/media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("getUrl returns null when no s3_key row", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const port = createS3MediaStoragePort();
    const url = await port.getUrl("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(url).toBeNull();
  });

  it("getUrl returns null when record not found", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const port = createS3MediaStoragePort();
    const url = await port.getUrl("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    expect(url).toBeNull();
  });

  // ----- deleteHard -----

  it("deleteHard queues pending_delete for S3-backed file (no immediate s3 delete)", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ stored_path: "media/x/f.mp4", s3_key: "media/x/f.mp4", status: "ready" }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [] });
    const port = createS3MediaStoragePort();
    const deleted = await port.deleteHard("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    expect(deleted).toBe(true);
    expect(s3DeleteObjectMock).not.toHaveBeenCalled();
    const updateSql = String(queryMock.mock.calls[2]![0]);
    expect(updateSql).toContain("pending_delete");
  });

  it("deleteHard removes DB row when row has no s3_key", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ stored_path: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", s3_key: null, status: "ready" }],
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [] });
    const port = createS3MediaStoragePort();
    const deleted = await port.deleteHard("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
    expect(deleted).toBe(true);
    expect(s3DeleteObjectMock).not.toHaveBeenCalled();
  });

  it("deleteHard returns false when record not found", async () => {
    // lock -> select none -> unlock
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const port = createS3MediaStoragePort();
    const deleted = await port.deleteHard("ffffffff-ffff-4fff-8fff-ffffffffffff");
    expect(deleted).toBe(false);
    expect(s3DeleteObjectMock).not.toHaveBeenCalled();
  });
});

describe("purgePendingMediaDeleteBatch", () => {
  beforeEach(() => {
    queryMock.mockReset();
    connectQueryMock.mockReset();
    s3DeleteObjectMock.mockReset();
    s3DeleteObjectMock.mockResolvedValue(undefined);
  });

  it("increments delete_attempts and counts errors when S3 delete fails", async () => {
    s3DeleteObjectMock.mockRejectedValueOnce(new Error("s3 unavailable"));
    connectQueryMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            s3_key: "media/a/x",
            status: "pending_delete",
            delete_attempts: 0,
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(undefined);
    queryMock.mockResolvedValueOnce({ rowCount: 0 });

    const r = await purgePendingMediaDeleteBatch(5);
    expect(r.errors).toBe(1);
    expect(r.removed).toBe(0);
    expect(s3DeleteObjectMock).toHaveBeenCalledWith("media/a/x");
    const updateSql = String(
      connectQueryMock.mock.calls.find((c) => String(c[0]).includes("UPDATE media_files"))?.[0] ?? "",
    );
    expect(updateSql).toContain("delete_attempts");
    expect(updateSql).toContain("next_attempt_at");
  });
});
