/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const abortTxMock = vi.fn();
const s3AbortMock = vi.fn();

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

vi.mock("@/app-layer/locks/multipartSessionLock", () => ({
  withMultipartSessionLock: vi.fn(async (_pool: unknown, _sid: string, fn: (c: unknown) => Promise<unknown>) =>
    fn({}),
  ),
}));

vi.mock("@/app-layer/media/mediaUploadSessionsRepo", () => ({
  abortMultipartPendingTx: (...args: unknown[]) => abortTxMock(...args),
}));

vi.mock("@/app-layer/media/s3Client", () => ({
  s3AbortMultipartUpload: (...args: unknown[]) => s3AbortMock(...args),
}));

vi.mock("@/app-layer/db/client", () => ({
  getPool: () => ({}),
}));

const sessionMock = vi.fn();
vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: () => sessionMock(),
}));

import { POST } from "./route";

describe("POST /api/media/multipart/abort", () => {
  beforeEach(() => {
    abortTxMock.mockReset();
    s3AbortMock.mockReset();
    sessionMock.mockReset();
    s3AbortMock.mockResolvedValue(undefined);
  });

  it("returns alreadyGone when DB reports not_found", async () => {
    sessionMock.mockResolvedValue({ user: { userId: "doc-1", role: "doctor" } });
    abortTxMock.mockResolvedValue({ ok: "not_found" as const });
    const res = await POST(
      new Request("http://localhost/api/media/multipart/abort", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "00000000-0000-4000-8000-000000000001" }),
      }),
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { ok: boolean; alreadyGone?: boolean };
    expect(j.ok).toBe(true);
    expect(j.alreadyGone).toBe(true);
    expect(s3AbortMock).not.toHaveBeenCalled();
  });

  it("calls S3 abort after aborted DB path", async () => {
    sessionMock.mockResolvedValue({ user: { userId: "doc-1", role: "doctor" } });
    abortTxMock.mockResolvedValue({
      ok: "aborted" as const,
      s3Key: "media/k/o.png",
      uploadId: "u-99",
    });
    const res = await POST(
      new Request("http://localhost/api/media/multipart/abort", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "00000000-0000-4000-8000-000000000002" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(s3AbortMock).toHaveBeenCalledWith("media/k/o.png", "u-99");
  });

  it("returns alreadyCompleted without S3 abort", async () => {
    sessionMock.mockResolvedValue({ user: { userId: "doc-1", role: "doctor" } });
    abortTxMock.mockResolvedValue({ ok: "already_completed" as const });
    const res = await POST(
      new Request("http://localhost/api/media/multipart/abort", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "00000000-0000-4000-8000-000000000003" }),
      }),
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { alreadyCompleted?: boolean };
    expect(j.alreadyCompleted).toBe(true);
    expect(s3AbortMock).not.toHaveBeenCalled();
  });
});
