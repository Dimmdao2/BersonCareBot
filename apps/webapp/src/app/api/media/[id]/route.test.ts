/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const getS3KeyMock = vi.fn();
const getStoredMock = vi.fn();
const s3PublicUrlMock = vi.fn();

vi.mock("@/config/env", () => ({
  env: { DATABASE_URL: "postgres://test/db" },
}));

vi.mock("@/infra/repos/s3MediaStorage", () => ({
  getMediaS3KeyForRedirect: (...args: unknown[]) => getS3KeyMock(...args),
}));

vi.mock("@/infra/repos/mockMediaStorage", () => ({
  getStoredMediaBody: (...args: unknown[]) => getStoredMock(...args),
}));

vi.mock("@/infra/s3/client", () => ({
  s3PublicUrl: (...args: unknown[]) => s3PublicUrlMock(...args),
}));

import { GET } from "./route";

const testUuid = "00000000-0000-4000-8000-000000000099";

describe("GET /api/media/[id]", () => {
  beforeEach(() => {
    getS3KeyMock.mockReset();
    getStoredMock.mockReset();
    s3PublicUrlMock.mockReset();
  });

  it("redirects to public S3 URL when s3_key is set and ready", async () => {
    getS3KeyMock.mockResolvedValue("media/uuid/file.png");
    s3PublicUrlMock.mockReturnValue("https://fs.example/bucket/media/uuid/file.png");

    const res = await GET(new Request("http://localhost/api/media/x"), {
      params: Promise.resolve({ id: testUuid }),
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://fs.example/bucket/media/uuid/file.png");
    expect(getS3KeyMock).toHaveBeenCalledWith(testUuid);
  });

  it("returns 404 when S3 key is missing in DB mode", async () => {
    getS3KeyMock.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/media/x"), {
      params: Promise.resolve({ id: testUuid }),
    });

    expect(res.status).toBe(404);
  });
});
