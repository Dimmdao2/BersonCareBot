/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const getS3KeyMock = vi.fn();
const getAccessRowMock = vi.fn();
const getStoredMock = vi.fn();
const readLocalMock = vi.fn();
const presignGetUrlMock = vi.fn();
const getSessionMock = vi.fn();
const resolvePlatformLfkMediaAccessMock = vi.fn();

vi.mock("@/config/env", () => ({
  env: { DATABASE_URL: "postgres://test/bersoncarebot_test" },
  isS3MediaEnabled: () => true,
}));

vi.mock("@/app-layer/media/s3MediaStorage", () => ({
  getMediaS3KeyForRedirect: (...args: unknown[]) => getS3KeyMock(...args),
  getMediaAccessRow: (...args: unknown[]) => getAccessRowMock(...args),
}));
vi.mock("@/app-layer/media/resolvePlatformLfkMediaAccess", () => ({
  resolvePlatformLfkMediaAccess: (...args: unknown[]) => resolvePlatformLfkMediaAccessMock(...args),
}));

vi.mock("@/app-layer/media/mockMediaStorage", () => ({
  getStoredMediaBody: (...args: unknown[]) => getStoredMock(...args),
}));

vi.mock('@/app-layer/media/localSaasTestFixtureMedia', () => ({
  readSaasTestLocalMedia: (...args: unknown[]) => readLocalMock(...args),
}));

vi.mock("@/app-layer/media/s3Client", () => ({
  presignGetUrl: (...args: unknown[]) => presignGetUrlMock(...args),
}));

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: () => getSessionMock(),
}));

vi.mock("@/modules/roles/service", () => ({
  canAccessDoctor: () => false,
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: async () => ({ ok: true, session: await getSessionMock() }),
  requireDoctorWorkspaceApiContext: vi.fn(),
}));

const getTtlMock = vi.fn(() => Promise.resolve(3600));
vi.mock("@/app-layer/media/videoPresignTtl", () => ({
  getVideoPresignTtlSeconds: () => getTtlMock(),
}));

import { GET } from "./route";

const testUuid = "00000000-0000-4000-8000-000000000099";

describe("GET /api/media/[id]", () => {
  beforeEach(() => {
    getS3KeyMock.mockReset();
    getAccessRowMock.mockReset();
    getStoredMock.mockReset();
    readLocalMock.mockReset();
    presignGetUrlMock.mockReset();
    getSessionMock.mockReset();
    resolvePlatformLfkMediaAccessMock.mockReset();
    resolvePlatformLfkMediaAccessMock.mockResolvedValue(false);
    getTtlMock.mockReset();
    getTtlMock.mockResolvedValue(3600);
    getSessionMock.mockResolvedValue({ user: { userId: "u1", role: "client", displayName: "U", bindings: {} } });
    getAccessRowMock.mockResolvedValue({
      usage_purpose: null,
      uploaded_by: "u1",
      mime_type: "image/png",
      stored_path: 'media/uuid/file.png',
      s3_key: 'media/uuid/file.png',
    });
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

    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toBe("https://fs.example/signed-get?token=abc");
    expect(res.headers.get("Cache-Control")).toContain("max-age=0");
    expect(getS3KeyMock).toHaveBeenCalledWith(testUuid, { allowPlatformBase: false });
    expect(presignGetUrlMock).toHaveBeenCalledWith("media/uuid/file.png", 3600);
  });

  it("passes an entitled platform-media decision to both DB reads", async () => {
    resolvePlatformLfkMediaAccessMock.mockResolvedValue(true);
    getAccessRowMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        usage_purpose: null,
        uploaded_by: "u1",
        mime_type: "image/png",
        stored_path: "platform/exercise.png",
        s3_key: "platform/exercise.png",
      });
    getS3KeyMock.mockResolvedValue("platform/exercise.png");
    presignGetUrlMock.mockResolvedValue("https://fs.example/platform-signed");
    const res = await GET(new Request("http://localhost/api/media/x"), {
      params: Promise.resolve({ id: testUuid }),
    });
    expect(res.status).toBe(307);
    expect(getAccessRowMock).toHaveBeenNthCalledWith(1, testUuid);
    expect(getAccessRowMock).toHaveBeenNthCalledWith(2, testUuid, { allowPlatformBase: true });
    expect(getS3KeyMock).toHaveBeenCalledWith(testUuid, { allowPlatformBase: true });
  });

  it("passes presign TTL from settings", async () => {
    getS3KeyMock.mockResolvedValue("media/uuid/file.png");
    getTtlMock.mockResolvedValue(900);
    presignGetUrlMock.mockResolvedValue("https://fs.example/signed");

    const res = await GET(new Request("http://localhost/api/media/x"), {
      params: Promise.resolve({ id: testUuid }),
    });

    expect(res.status).toBe(307);
    expect(presignGetUrlMock).toHaveBeenCalledWith("media/uuid/file.png", 900);
  });

  it("returns 404 when S3 key is missing in DB mode", async () => {
    getAccessRowMock.mockResolvedValue({
      usage_purpose: null,
      uploaded_by: "u1",
      mime_type: "image/png",
      stored_path: 'media/uuid/file.png',
      s3_key: null,
    });
    getS3KeyMock.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/media/x"), {
      params: Promise.resolve({ id: testUuid }),
    });

    expect(res.status).toBe(404);
  });

  it("denies an authenticated other-organization media id before any S3 redirect", async () => {
    getAccessRowMock.mockResolvedValueOnce(null);
    const res = await GET(new Request("http://localhost/api/media/x"), {
      params: Promise.resolve({ id: testUuid }),
    });
    expect(res.status).toBe(404);
    expect(getS3KeyMock).not.toHaveBeenCalled();
  });

  it('returns real local TEST bytes when the fixed DB fixture row has no S3 key', async () => {
    getAccessRowMock.mockResolvedValue({
      usage_purpose: null,
      uploaded_by: 'u1',
      mime_type: 'image/svg+xml',
      stored_path: '/test-fixtures/saas-exercise.svg',
      s3_key: null,
    });
    getS3KeyMock.mockResolvedValue(null);
    readLocalMock.mockResolvedValue(new TextEncoder().encode('<svg>SaaS TEST</svg>').buffer);

    const res = await GET(new Request('http://localhost/api/media/x'), {
      params: Promise.resolve({ id: testUuid }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml');
    expect(await res.text()).toContain('SaaS TEST');
    expect(readLocalMock).toHaveBeenCalledWith({
      databaseUrl: 'postgres://test/bersoncarebot_test',
      storedPath: '/test-fixtures/saas-exercise.svg',
      s3Key: null,
      mimeType: 'image/svg+xml',
    });
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
