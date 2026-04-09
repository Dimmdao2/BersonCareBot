/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const insertPendingMock = vi.fn();
const deletePendingMock = vi.fn();
const presignPutUrlMock = vi.fn();

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
  getPool: () => ({}),
}));

vi.mock("@/infra/repos/s3MediaStorage", () => ({
  insertPendingMediaFileTx: (...args: unknown[]) => insertPendingMock(...args),
  deletePendingMediaFileById: (...args: unknown[]) => deletePendingMock(...args),
}));

vi.mock("@/infra/s3/client", () => ({
  s3ObjectKey: (mediaId: string, filename: string) => `media/${mediaId}/${filename}`,
  presignPutUrl: (...args: unknown[]) => presignPutUrlMock(...args),
}));

const sessionMock = vi.fn();
vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: () => sessionMock(),
}));

import { MAX_MEDIA_BYTES } from "@/modules/media/uploadAllowedMime";
import { POST } from "./route";

describe("POST /api/media/presign", () => {
  beforeEach(() => {
    insertPendingMock.mockReset();
    deletePendingMock.mockReset();
    presignPutUrlMock.mockReset();
    sessionMock.mockReset();
    presignPutUrlMock.mockResolvedValue("https://signed-put.example/upload");
    insertPendingMock.mockResolvedValue(undefined);
    deletePendingMock.mockResolvedValue(true);
  });

  it("returns 403 without doctor session", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost/api/media/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: "a.png", mimeType: "image/png", size: 100 }),
      }),
    );
    expect(res.status).toBe(403);
    expect(insertPendingMock).not.toHaveBeenCalled();
  });

  it("returns 200 with uploadUrl and mediaId", async () => {
    sessionMock.mockResolvedValue({ user: { userId: "doc-1", role: "doctor" } });
    const res = await POST(
      new Request("http://localhost/api/media/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: "a.png", mimeType: "image/png", size: 100 }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      mediaId: string;
      uploadUrl: string;
      readUrl: string;
    };
    expect(json.ok).toBe(true);
    expect(json.uploadUrl).toBe("https://signed-put.example/upload");
    expect(json.readUrl).toBe(`/api/media/${json.mediaId}`);
    expect("key" in json).toBe(false);
    expect(insertPendingMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: expect.stringMatching(/^[0-9a-f-]{8}-[0-9a-f-]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
        filename: "a.png",
        key: expect.stringMatching(/^media\/[0-9a-f-]{8}-[0-9a-f-]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/a\.png$/i),
        mimeType: "image/png",
        sizeBytes: 100,
        userId: "doc-1",
        folderId: null,
      }),
    );
    expect(presignPutUrlMock).toHaveBeenCalled();
  });

  it("returns 415 for disallowed mime", async () => {
    sessionMock.mockResolvedValue({ user: { userId: "doc-1", role: "doctor" } });
    const res = await POST(
      new Request("http://localhost/api/media/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: "x.exe", mimeType: "application/octet-stream", size: 10 }),
      }),
    );
    expect(res.status).toBe(415);
    expect(insertPendingMock).not.toHaveBeenCalled();
  });

  it("returns 413 when size exceeds MAX_MEDIA_BYTES", async () => {
    sessionMock.mockResolvedValue({ user: { userId: "doc-1", role: "doctor" } });
    const res = await POST(
      new Request("http://localhost/api/media/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: "huge.mp4", mimeType: "video/mp4", size: MAX_MEDIA_BYTES + 1 }),
      }),
    );
    expect(res.status).toBe(413);
    expect(insertPendingMock).not.toHaveBeenCalled();
  });

  it("returns 501 when S3 is not configured", async () => {
    const { POST: POST501 } = await vi.importActual<typeof import("./route")>("./route");
    // Re-import with isS3MediaEnabled returning false via a separate isolated mock scope
    // We verify via the already-loaded module that 501 path exists by checking env mock
    // (The module is loaded with isS3MediaEnabled: () => true — test this by patching directly)
    const origMod = await import("@/config/env");
    const spy = vi.spyOn(origMod, "isS3MediaEnabled").mockReturnValue(false);
    const res = await POST(
      new Request("http://localhost/api/media/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: "a.png", mimeType: "image/png", size: 10 }),
      }),
    );
    spy.mockRestore();
    expect(res.status).toBe(501);
    expect(insertPendingMock).not.toHaveBeenCalled();
  });

  it("rolls back pending DB record when presignPutUrl throws", async () => {
    sessionMock.mockResolvedValue({ user: { userId: "doc-1", role: "doctor" } });
    presignPutUrlMock.mockRejectedValue(new Error("s3_unreachable"));

    const res = await POST(
      new Request("http://localhost/api/media/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: "a.png", mimeType: "image/png", size: 100 }),
      }),
    );
    expect(res.status).toBe(500);
    expect(insertPendingMock).toHaveBeenCalledOnce();
    // Rollback must have been called with the same mediaId that was inserted
    const insertedId = (insertPendingMock.mock.calls[0]![1] as { id: string }).id;
    expect(deletePendingMock).toHaveBeenCalledWith(insertedId);
  });
});
