/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const insertPendingMock = vi.fn();
const insertSessionMock = vi.fn();
const createMultipartMock = vi.fn();

vi.mock("@/config/env", () => ({
  env: {
    S3_ENDPOINT: "https://fs.test",
    S3_ACCESS_KEY: "access",
    S3_SECRET_KEY: "secret",
    S3_PUBLIC_BUCKET: "public-bucket",
    S3_PRIVATE_BUCKET: "private-bucket",
    S3_REGION: "us-east-1",
    S3_FORCE_PATH_STYLE: true,
  },
  isS3MediaEnabled: () => true,
}));

vi.mock("@/infra/userLifecycleLock", () => ({
  withUserLifecycleLock: async (
    _pool: unknown,
    _userId: string,
    _mode: string,
    fn: (c: { query: ReturnType<typeof vi.fn> }) => Promise<void>,
  ) => {
    await fn({ query: vi.fn() });
  },
}));

vi.mock("@/infra/db/client", () => ({
  getPool: () => ({ query: vi.fn().mockResolvedValue({ rowCount: 0 }) }),
}));

vi.mock("@/infra/repos/s3MediaStorage", () => ({
  insertPendingMediaFileTx: (...args: unknown[]) => insertPendingMock(...args),
}));

vi.mock("@/infra/repos/mediaUploadSessionsRepo", () => ({
  insertUploadSessionTx: (...args: unknown[]) => insertSessionMock(...args),
}));

vi.mock("@/infra/s3/client", () => ({
  s3ObjectKey: (mediaId: string, filename: string) => `media/${mediaId}/${filename}`,
  s3CreateMultipartUpload: (...args: unknown[]) => createMultipartMock(...args),
  s3AbortMultipartUpload: vi.fn().mockResolvedValue(undefined),
}));

const sessionMock = vi.fn();
vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: () => sessionMock(),
}));

import { MAX_MEDIA_BYTES } from "@/modules/media/uploadAllowedMime";
import { POST } from "./route";

describe("POST /api/media/multipart/init", () => {
  beforeEach(() => {
    insertPendingMock.mockReset();
    insertSessionMock.mockReset();
    createMultipartMock.mockReset();
    sessionMock.mockReset();
    insertPendingMock.mockResolvedValue(undefined);
    insertSessionMock.mockResolvedValue(undefined);
    createMultipartMock.mockResolvedValue({ uploadId: "s3-upload-id-1" });
  });

  it("returns 403 without doctor session", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost/api/media/multipart/init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: "a.png", mimeType: "image/png", size: 100 }),
      }),
    );
    expect(res.status).toBe(403);
    expect(createMultipartMock).not.toHaveBeenCalled();
  });

  it("returns 200 with session, uploadId, partSizeBytes, maxParts, expiresAt, readUrl", async () => {
    sessionMock.mockResolvedValue({ user: { userId: "doc-1", role: "doctor" } });
    const res = await POST(
      new Request("http://localhost/api/media/multipart/init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: "a.png", mimeType: "image/png", size: 100 }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      mediaId: string;
      sessionId: string;
      uploadId: string;
      partSizeBytes: number;
      maxParts: number;
      expiresAt: string;
      readUrl: string;
    };
    expect(json.ok).toBe(true);
    expect(json.uploadId).toBe("s3-upload-id-1");
    expect(json.readUrl).toBe(`/api/media/${json.mediaId}`);
    expect(json.partSizeBytes).toBeGreaterThan(0);
    expect(json.maxParts).toBeGreaterThan(0);
    expect(new Date(json.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(insertPendingMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        filename: "a.png",
        mimeType: "image/png",
        sizeBytes: 100,
        userId: "doc-1",
        folderId: null,
      }),
    );
    expect(insertSessionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        uploadId: "s3-upload-id-1",
        ownerUserId: "doc-1",
        expectedSizeBytes: 100,
        mimeType: "image/png",
      }),
    );
    expect(createMultipartMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "image/png",
        metadata: expect.objectContaining({
          "media-id": json.mediaId,
          "owner-user-id": "doc-1",
          "expected-size": "100",
        }),
      }),
    );
  });

  it("returns 415 for disallowed mime", async () => {
    sessionMock.mockResolvedValue({ user: { userId: "doc-1", role: "doctor" } });
    const res = await POST(
      new Request("http://localhost/api/media/multipart/init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: "x.exe", mimeType: "application/octet-stream", size: 10 }),
      }),
    );
    expect(res.status).toBe(415);
    expect(createMultipartMock).not.toHaveBeenCalled();
  });

  it("returns 413 when size exceeds MAX_MEDIA_BYTES", async () => {
    sessionMock.mockResolvedValue({ user: { userId: "doc-1", role: "doctor" } });
    const res = await POST(
      new Request("http://localhost/api/media/multipart/init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: "huge.mp4", mimeType: "video/mp4", size: MAX_MEDIA_BYTES + 1 }),
      }),
    );
    expect(res.status).toBe(413);
    expect(createMultipartMock).not.toHaveBeenCalled();
  });

  it("returns 501 when S3 is not configured", async () => {
    const origMod = await import("@/config/env");
    const spy = vi.spyOn(origMod, "isS3MediaEnabled").mockReturnValue(false);
    const res = await POST(
      new Request("http://localhost/api/media/multipart/init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: "a.png", mimeType: "image/png", size: 10 }),
      }),
    );
    spy.mockRestore();
    expect(res.status).toBe(501);
    expect(createMultipartMock).not.toHaveBeenCalled();
  });
});
