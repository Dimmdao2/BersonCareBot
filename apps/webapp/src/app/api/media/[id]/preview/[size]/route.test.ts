import { describe, expect, it, vi, beforeEach } from "vitest";

const MEDIA_ID = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  getMediaPreviewS3KeyForRedirect: vi.fn(),
  s3HeadObjectDetails: vi.fn(),
  s3GetObjectBody: vi.fn(),
  presignGetUrl: vi.fn(),
  getVideoPresignTtlSeconds: vi.fn(),
}));

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: mocks.getCurrentSession,
}));

vi.mock("@/app-layer/media/s3MediaStorage", () => ({
  getMediaPreviewS3KeyForRedirect: mocks.getMediaPreviewS3KeyForRedirect,
}));

vi.mock("@/app-layer/media/s3Client", () => ({
  s3HeadObjectDetails: mocks.s3HeadObjectDetails,
  s3GetObjectBody: mocks.s3GetObjectBody,
  presignGetUrl: mocks.presignGetUrl,
}));

vi.mock("@/app-layer/media/videoPresignTtl", () => ({
  getVideoPresignTtlSeconds: mocks.getVideoPresignTtlSeconds,
}));

describe("GET /api/media/[id]/preview/[size]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getCurrentSession.mockResolvedValue({ user: { id: "u1" } } as never);
    mocks.getMediaPreviewS3KeyForRedirect.mockResolvedValue("previews/sm/x.jpg");
    mocks.s3HeadObjectDetails.mockResolvedValue({
      eTag: '"s3etag"',
      lastModified: new Date("2024-06-01T12:00:00.000Z"),
    });
    mocks.s3GetObjectBody.mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    mocks.presignGetUrl.mockResolvedValue("https://signed.example/preview.jpg");
    mocks.getVideoPresignTtlSeconds.mockResolvedValue(3600);
  });

  it("returns 200 with ETag on first successful body read", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request(`http://localhost/api/media/${MEDIA_ID}/preview/sm`), {
      params: Promise.resolve({ id: MEDIA_ID, size: "sm" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("ETag")).toBe('"s3etag"');
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("returns 304 when If-None-Match matches ETag from head", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      new Request(`http://localhost/api/media/${MEDIA_ID}/preview/sm`, {
        headers: { "if-none-match": '"s3etag"' },
      }),
      { params: Promise.resolve({ id: MEDIA_ID, size: "sm" }) },
    );
    expect(res.status).toBe(304);
    expect(res.headers.get("ETag")).toBe('"s3etag"');
    expect(mocks.s3GetObjectBody).not.toHaveBeenCalled();
  });

  it("fallback redirect returns 307 with Location when S3 body read fails", async () => {
    mocks.s3GetObjectBody.mockResolvedValueOnce(Buffer.alloc(0));
    const { GET } = await import("./route");
    const res = await GET(new Request(`http://localhost/api/media/${MEDIA_ID}/preview/sm`), {
      params: Promise.resolve({ id: MEDIA_ID, size: "sm" }),
    });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://signed.example/preview.jpg");
    expect(res.headers.get("cache-control")).toBe("private, max-age=3600, must-revalidate");
    expect(mocks.presignGetUrl).toHaveBeenCalledWith("previews/sm/x.jpg", 3600);
  });

  it("redirects to original media when preview metadata is missing", async () => {
    mocks.getMediaPreviewS3KeyForRedirect.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const res = await GET(new Request(`http://localhost/api/media/${MEDIA_ID}/preview/sm`), {
      params: Promise.resolve({ id: MEDIA_ID, size: "sm" }),
    });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`/api/media/${MEDIA_ID}`);
    expect(res.headers.get("cache-control")).toBe("private, max-age=60");
    expect(mocks.s3HeadObjectDetails).not.toHaveBeenCalled();
    expect(mocks.s3GetObjectBody).not.toHaveBeenCalled();
  });
});
