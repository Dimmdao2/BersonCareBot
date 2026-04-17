/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const getRowMock = vi.fn();
const bumpMock = vi.fn();
const presignMock = vi.fn();

vi.mock("@/config/env", () => ({
  env: {
    S3_ENDPOINT: "https://fs.test",
    S3_ACCESS_KEY: "access",
    S3_SECRET_KEY: "secret",
    S3_PRIVATE_BUCKET: "private-bucket",
    S3_REGION: "us-east-1",
    S3_FORCE_PATH_STYLE: true,
  },
  isS3MediaEnabled: () => true,
}));

vi.mock("@/app-layer/media/mediaUploadSessionsRepo", () => ({
  bumpSessionToUploading: (...args: unknown[]) => bumpMock(...args),
  gateUploadSessionForPartUrl: (...args: unknown[]) => getRowMock(...args),
}));

vi.mock("@/app-layer/media/s3Client", () => ({
  presignUploadPartUrl: (...args: unknown[]) => presignMock(...args),
}));

const sessionMock = vi.fn();
vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: () => sessionMock(),
}));

import { POST } from "./route";

describe("POST /api/media/multipart/part-url", () => {
  beforeEach(() => {
    getRowMock.mockReset();
    bumpMock.mockReset();
    presignMock.mockReset();
    sessionMock.mockReset();
    presignMock.mockResolvedValue("https://signed-part.example/upload");
    bumpMock.mockResolvedValue(undefined);
  });

  it("returns 403 without doctor session", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost/api/media/multipart/part-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "00000000-0000-4000-8000-000000000001", partNumber: 1 }),
      }),
    );
    expect(res.status).toBe(403);
    expect(getRowMock).not.toHaveBeenCalled();
  });

  it("returns 404 when session row missing", async () => {
    sessionMock.mockResolvedValue({ user: { userId: "doc-1", role: "doctor" } });
    getRowMock.mockResolvedValue({ ok: false as const, error: "session_not_found" as const });
    const res = await POST(
      new Request("http://localhost/api/media/multipart/part-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "00000000-0000-4000-8000-000000000002", partNumber: 1 }),
      }),
    );
    expect(res.status).toBe(404);
    const j = (await res.json()) as { error?: string };
    expect(j.error).toBe("session_not_found");
  });

  it("returns 409 session_expired when TTL passed", async () => {
    sessionMock.mockResolvedValue({ user: { userId: "doc-1", role: "doctor" } });
    getRowMock.mockResolvedValue({ ok: false as const, error: "session_expired" as const });
    const res = await POST(
      new Request("http://localhost/api/media/multipart/part-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "00000000-0000-4000-8000-000000000022", partNumber: 1 }),
      }),
    );
    expect(res.status).toBe(409);
    const j = (await res.json()) as { error?: string };
    expect(j.error).toBe("session_expired");
  });

  it("returns 409 session_state_conflict when status not uploadable", async () => {
    sessionMock.mockResolvedValue({ user: { userId: "doc-1", role: "doctor" } });
    getRowMock.mockResolvedValue({ ok: false as const, error: "session_state_conflict" as const });
    const res = await POST(
      new Request("http://localhost/api/media/multipart/part-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "00000000-0000-4000-8000-000000000033", partNumber: 1 }),
      }),
    );
    expect(res.status).toBe(409);
    const j = (await res.json()) as { error?: string };
    expect(j.error).toBe("session_state_conflict");
  });

  it("returns 400 when partNumber out of range", async () => {
    sessionMock.mockResolvedValue({ user: { userId: "doc-1", role: "doctor" } });
    getRowMock.mockResolvedValue({
      ok: true as const,
      row: {
        expected_size_bytes: "100",
        part_size_bytes: 100,
        s3_key: "k",
        upload_id: "u",
      },
    });
    const res = await POST(
      new Request("http://localhost/api/media/multipart/part-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "00000000-0000-4000-8000-000000000003", partNumber: 2 }),
      }),
    );
    expect(res.status).toBe(400);
    expect(presignMock).not.toHaveBeenCalled();
  });

  it("returns 200 with uploadUrl", async () => {
    sessionMock.mockResolvedValue({ user: { userId: "doc-1", role: "doctor" } });
    getRowMock.mockResolvedValue({
      ok: true as const,
      row: {
        expected_size_bytes: "100",
        part_size_bytes: 100,
        s3_key: "media/x/f.png",
        upload_id: "up-1",
      },
    });
    const res = await POST(
      new Request("http://localhost/api/media/multipart/part-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "00000000-0000-4000-8000-000000000004", partNumber: 1 }),
      }),
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { ok: boolean; uploadUrl?: string };
    expect(j.ok).toBe(true);
    expect(j.uploadUrl).toBe("https://signed-part.example/upload");
    expect(bumpMock).toHaveBeenCalled();
    expect(presignMock).toHaveBeenCalledWith("media/x/f.png", "up-1", 1);
  });
});
