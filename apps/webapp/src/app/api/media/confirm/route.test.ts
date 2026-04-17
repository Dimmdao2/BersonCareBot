/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const getMediaRowMock = vi.fn();
const confirmReadyMock = vi.fn();
const headMock = vi.fn();

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

vi.mock("@/app-layer/media/s3MediaStorage", () => ({
  getMediaRowForConfirm: (...args: unknown[]) => getMediaRowMock(...args),
  confirmMediaFileReady: (...args: unknown[]) => confirmReadyMock(...args),
}));

vi.mock("@/app-layer/media/s3Client", () => ({
  s3HeadObject: (...args: unknown[]) => headMock(...args),
}));

const sessionMock = vi.fn();
vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: () => sessionMock(),
}));

import { POST } from "./route";

describe("POST /api/media/confirm", () => {
  beforeEach(() => {
    getMediaRowMock.mockReset();
    confirmReadyMock.mockReset();
    headMock.mockReset();
    sessionMock.mockReset();
    confirmReadyMock.mockResolvedValue(true);
  });

  it("returns 403 without doctor session", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost/api/media/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaId: "00000000-0000-4000-8000-000000000000" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when record not found", async () => {
    sessionMock.mockResolvedValue({ user: { userId: "doc-1", role: "doctor" } });
    getMediaRowMock.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost/api/media/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaId: "00000000-0000-4000-8000-000000000001" }),
      }),
    );
    expect(res.status).toBe(404);
    expect(getMediaRowMock).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001", "doc-1");
  });

  it("returns idempotent 200 when already ready", async () => {
    sessionMock.mockResolvedValue({ user: { userId: "doc-1", role: "doctor" } });
    getMediaRowMock.mockResolvedValue({ s3_key: "media/x/f.png", status: "ready" });
    const res = await POST(
      new Request("http://localhost/api/media/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaId: "00000000-0000-4000-8000-000000000099" }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; url: string };
    expect(json.ok).toBe(true);
    expect(json.url).toBe("/api/media/00000000-0000-4000-8000-000000000099");
    expect(confirmReadyMock).not.toHaveBeenCalled();
  });

  it("returns 404 when object missing in S3", async () => {
    sessionMock.mockResolvedValue({ user: { userId: "doc-1", role: "doctor" } });
    getMediaRowMock.mockResolvedValue({ s3_key: "media/x/f.png", status: "pending" });
    headMock.mockResolvedValue(false);
    const res = await POST(
      new Request("http://localhost/api/media/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaId: "00000000-0000-4000-8000-000000000002" }),
      }),
    );
    expect(res.status).toBe(404);
    expect(confirmReadyMock).not.toHaveBeenCalled();
  });

  it("confirms and returns url", async () => {
    sessionMock.mockResolvedValue({ user: { userId: "doc-1", role: "doctor" } });
    getMediaRowMock.mockResolvedValue({ s3_key: "media/x/f.png", status: "pending" });
    headMock.mockResolvedValue(true);
    const res = await POST(
      new Request("http://localhost/api/media/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaId: "00000000-0000-4000-8000-000000000003" }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; url: string };
    expect(json.ok).toBe(true);
    expect(json.url).toBe("/api/media/00000000-0000-4000-8000-000000000003");
    expect(confirmReadyMock).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000003");
  });

  it("returns 409 when confirm races (updated 0 rows)", async () => {
    sessionMock.mockResolvedValue({ user: { userId: "doc-1", role: "doctor" } });
    getMediaRowMock
      .mockResolvedValueOnce({ s3_key: "media/x/f.png", status: "pending" })
      // second call inside confirm race: still pending (not ready yet)
      .mockResolvedValueOnce({ s3_key: "media/x/f.png", status: "pending" });
    headMock.mockResolvedValue(true);
    confirmReadyMock.mockResolvedValue(false); // 0 rows updated

    const res = await POST(
      new Request("http://localhost/api/media/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaId: "00000000-0000-4000-8000-000000000004" }),
      }),
    );
    expect(res.status).toBe(409);
  });
});
