/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const getS3KeyMock = vi.fn();
const getStoredMock = vi.fn();
const presignGetUrlMock = vi.fn();
const getSessionMock = vi.fn();

vi.mock("@/config/env", () => ({
  env: { DATABASE_URL: "postgres://test/db" },
  isS3MediaEnabled: () => true,
}));

vi.mock("@/infra/repos/s3MediaStorage", () => ({
  getMediaS3KeyForRedirect: (...args: unknown[]) => getS3KeyMock(...args),
}));

vi.mock("@/infra/repos/mockMediaStorage", () => ({
  getStoredMediaBody: (...args: unknown[]) => getStoredMock(...args),
}));

vi.mock("@/infra/s3/client", () => ({
  presignGetUrl: (...args: unknown[]) => presignGetUrlMock(...args),
}));

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: () => getSessionMock(),
}));

import { GET } from "./route";

const testUuid = "00000000-0000-4000-8000-000000000099";

describe("GET /api/media/[id]", () => {
  beforeEach(() => {
    getS3KeyMock.mockReset();
    getStoredMock.mockReset();
    presignGetUrlMock.mockReset();
    getSessionMock.mockReset();
    getSessionMock.mockResolvedValue({ user: { userId: "u1", role: "patient" } });
  });

  it("returns 401 when there is no session", async () => {
    getSessionMock.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/media/x"), {
      params: Promise.resolve({ id: testUuid }),
    });

    expect(res.status).toBe(401);
    expect(getS3KeyMock).not.toHaveBeenCalled();
  });

  it("redirects to presigned private S3 URL when s3_key is set and ready", async () => {
    getS3KeyMock.mockResolvedValue("media/uuid/file.png");
    presignGetUrlMock.mockResolvedValue("https://fs.example/signed-get?token=abc");

    const res = await GET(new Request("http://localhost/api/media/x"), {
      params: Promise.resolve({ id: testUuid }),
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://fs.example/signed-get?token=abc");
    expect(res.headers.get("Cache-Control")).toContain("max-age=0");
    expect(getS3KeyMock).toHaveBeenCalledWith(testUuid);
    expect(presignGetUrlMock).toHaveBeenCalledWith("media/uuid/file.png");
  });

  it("returns 404 when S3 key is missing in DB mode", async () => {
    getS3KeyMock.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/media/x"), {
      params: Promise.resolve({ id: testUuid }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 503 when presign throws", async () => {
    getS3KeyMock.mockResolvedValue("media/uuid/file.png");
    presignGetUrlMock.mockRejectedValue(new Error("sign failed"));

    const res = await GET(new Request("http://localhost/api/media/x"), {
      params: Promise.resolve({ id: testUuid }),
    });

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("storage_error");
  });

  it("returns 404 for non-UUID id when S3 media is enabled (no in-memory fallback)", async () => {
    const res = await GET(new Request("http://localhost/api/media/x"), {
      params: Promise.resolve({ id: "media-1" }),
    });

    expect(res.status).toBe(404);
    expect(getS3KeyMock).not.toHaveBeenCalled();
    expect(getStoredMock).not.toHaveBeenCalled();
  });
});
