/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const listExpiredMock = vi.fn();
const markExpiredMock = vi.fn();
const markExpiredTxMock = vi.fn();
const lockExpiredMock = vi.fn();
const deletePendingMock = vi.fn();
const abortMock = vi.fn();

const { envHolder } = vi.hoisted(() => ({
  envHolder: { INTERNAL_JOB_SECRET: "test-internal-secret" as string },
}));

vi.mock("@/config/env", () => ({
  env: envHolder,
}));

vi.mock("@/app-layer/media/mediaUploadSessionsRepo", () => ({
  listExpiredActiveUploadSessions: (...args: unknown[]) => listExpiredMock(...args),
  markUploadSessionExpired: (...args: unknown[]) => markExpiredMock(...args),
  markUploadSessionExpiredTx: (...args: unknown[]) => markExpiredTxMock(...args),
  lockExpiredSessionForCleanupTx: (...args: unknown[]) => lockExpiredMock(...args),
  deletePendingMediaFileTx: (...args: unknown[]) => deletePendingMock(...args),
}));

vi.mock("@/app-layer/media/s3Client", () => ({
  s3AbortMultipartUpload: (...args: unknown[]) => abortMock(...args),
}));

vi.mock("@/app-layer/locks/multipartSessionLock", () => ({
  withMultipartSessionLock: async (
    _pool: unknown,
    _sessionId: string,
    fn: (client: unknown) => Promise<unknown>,
  ) => fn({}),
}));

vi.mock("@/app-layer/db/client", () => ({
  getPool: () => ({}),
}));

vi.mock("@/app-layer/operator-health/recordOperatorCronJobTick", () => ({
  recordOperatorCronJobTickBestEffort: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "./route";

describe("POST /api/internal/media-multipart/cleanup", () => {
  beforeEach(() => {
    listExpiredMock.mockReset();
    markExpiredMock.mockReset();
    markExpiredTxMock.mockReset();
    lockExpiredMock.mockReset();
    deletePendingMock.mockReset();
    abortMock.mockReset();
    envHolder.INTERNAL_JOB_SECRET = "test-internal-secret";
    listExpiredMock.mockResolvedValue([]);
    abortMock.mockResolvedValue(undefined);
    markExpiredMock.mockResolvedValue(undefined);
    markExpiredTxMock.mockResolvedValue(undefined);
    lockExpiredMock.mockResolvedValue({
      id: "00000000-0000-4000-8000-0000000000aa",
      media_id: "00000000-0000-4000-8000-0000000000bb",
      s3_key: "media/x/f.png",
      upload_id: "up-1",
    });
    deletePendingMock.mockResolvedValue(1);
  });

  it("returns 401 without bearer token", async () => {
    const res = await POST(new Request("http://localhost/api/internal/media-multipart/cleanup", { method: "POST" }));
    expect(res.status).toBe(401);
    expect(listExpiredMock).not.toHaveBeenCalled();
  });

  it("returns 401 when bearer does not match", async () => {
    const res = await POST(
      new Request("http://localhost/api/internal/media-multipart/cleanup", {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 503 when INTERNAL_JOB_SECRET is not configured", async () => {
    envHolder.INTERNAL_JOB_SECRET = "";
    const res = await POST(
      new Request("http://localhost/api/internal/media-multipart/cleanup", {
        method: "POST",
        headers: { authorization: "Bearer x" },
      }),
    );
    expect(res.status).toBe(503);
    expect(listExpiredMock).not.toHaveBeenCalled();
  });

  it("returns cleaned count when authorized and sessions exist", async () => {
    listExpiredMock.mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-0000000000aa",
        media_id: "00000000-0000-4000-8000-0000000000bb",
        owner_user_id: "doc-1",
        s3_key: "media/x/f.png",
        upload_id: "up-1",
      },
    ]);
    const res = await POST(
      new Request("http://localhost/api/internal/media-multipart/cleanup?limit=5", {
        method: "POST",
        headers: { authorization: "Bearer test-internal-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; cleaned: number; errors: number };
    expect(json.ok).toBe(true);
    expect(json.cleaned).toBe(1);
    expect(json.errors).toBe(0);
    expect(listExpiredMock).toHaveBeenCalledWith(5);
    expect(lockExpiredMock).toHaveBeenCalled();
    expect(deletePendingMock).toHaveBeenCalledWith(expect.anything(), "00000000-0000-4000-8000-0000000000bb");
    expect(abortMock).toHaveBeenCalledWith("media/x/f.png", "up-1");
  });

  it("marks session expired when pending media delete is ineligible", async () => {
    listExpiredMock.mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-0000000000aa",
        media_id: "00000000-0000-4000-8000-0000000000bb",
        owner_user_id: "doc-1",
        s3_key: "media/x/f.png",
        upload_id: "up-1",
      },
    ]);
    deletePendingMock.mockResolvedValue(0);
    const res = await POST(
      new Request("http://localhost/api/internal/media-multipart/cleanup", {
        method: "POST",
        headers: { authorization: "Bearer test-internal-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; cleaned: number; errors: number };
    expect(json.cleaned).toBe(1);
    expect(markExpiredTxMock).toHaveBeenCalled();
    expect(abortMock).not.toHaveBeenCalled();
  });

  it("does not increment cleaned when lock finds session no longer eligible", async () => {
    listExpiredMock.mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-0000000000aa",
        media_id: "00000000-0000-4000-8000-0000000000bb",
        owner_user_id: "doc-1",
        s3_key: "media/x/f.png",
        upload_id: "up-1",
      },
    ]);
    lockExpiredMock.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost/api/internal/media-multipart/cleanup", {
        method: "POST",
        headers: { authorization: "Bearer test-internal-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; cleaned: number; errors: number };
    expect(json.cleaned).toBe(0);
    expect(deletePendingMock).not.toHaveBeenCalled();
    expect(abortMock).not.toHaveBeenCalled();
  });

  it("returns zeros when no expired sessions", async () => {
    const res = await POST(
      new Request("http://localhost/api/internal/media-multipart/cleanup", {
        method: "POST",
        headers: { authorization: "Bearer test-internal-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; cleaned: number; errors: number };
    expect(json.ok).toBe(true);
    expect(json.cleaned).toBe(0);
    expect(json.errors).toBe(0);
  });
});
