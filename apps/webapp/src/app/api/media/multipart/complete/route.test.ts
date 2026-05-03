/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const SESSION = "00000000-0000-4000-8000-0000000000aa";
const MEDIA = "00000000-0000-4000-8000-0000000000bb";

const claimTxMock = vi.fn();
const getCompletingTxMock = vi.fn();
const classifyRejectMock = vi.fn();
const markFailedTxMock = vi.fn();
const tryFinalizeTxMock = vi.fn();
const deletePendingMock = vi.fn();
const completeS3Mock = vi.fn();
const abortS3Mock = vi.fn();
const deleteObjMock = vi.fn();
const headMock = vi.fn();

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

vi.mock("@/app-layer/db/client", () => ({
  getPool: () => ({}),
}));

vi.mock("@/app-layer/locks/multipartSessionLock", () => ({
  withMultipartSessionLock: vi.fn(async (_p: unknown, _sid: string, fn: (c: unknown) => Promise<unknown>) =>
    fn({}),
  ),
}));

vi.mock("@/app-layer/media/mediaUploadSessionsRepo", () => ({
  claimUploadSessionForCompletingTx: (...a: unknown[]) => claimTxMock(...a),
  getCompletingSessionTx: (...a: unknown[]) => getCompletingTxMock(...a),
  classifyMultipartCompleteRejection: (...a: unknown[]) => classifyRejectMock(...a),
  markCompletingSessionFailedTx: (...a: unknown[]) => markFailedTxMock(...a),
  tryFinalizeMultipartIdempotentTx: (...a: unknown[]) => tryFinalizeTxMock(...a),
}));

vi.mock("@/app-layer/media/s3MediaStorage", () => ({
  deletePendingMediaFileById: (...a: unknown[]) => deletePendingMock(...a),
}));

vi.mock("@/app-layer/media/s3Client", () => ({
  s3CompleteMultipartUpload: (...a: unknown[]) => completeS3Mock(...a),
  s3AbortMultipartUpload: (...a: unknown[]) => abortS3Mock(...a),
  s3DeleteObject: (...a: unknown[]) => deleteObjMock(...a),
  s3HeadObjectDetails: (...a: unknown[]) => headMock(...a),
}));

const autoEnqueueMock = vi.fn();
vi.mock("@/app-layer/media/mediaTranscodeAutoEnqueue", () => ({
  maybeAutoEnqueueVideoTranscodeAfterUpload: (...a: unknown[]) => autoEnqueueMock(...a),
}));

const sessionMock = vi.fn();
vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: () => sessionMock(),
}));

import { POST } from "./route";

function baseRow() {
  return {
    id: SESSION,
    media_id: MEDIA,
    s3_key: "media/k/f.png",
    upload_id: "up-1",
    owner_user_id: "doc-1",
    status: "completing",
    expected_size_bytes: "100",
    mime_type: "image/png",
    part_size_bytes: 100,
    expires_at: new Date(Date.now() + 3600_000),
  };
}

describe("POST /api/media/multipart/complete", () => {
  beforeEach(() => {
    claimTxMock.mockReset();
    getCompletingTxMock.mockReset();
    classifyRejectMock.mockReset();
    classifyRejectMock.mockResolvedValue("session_state_conflict");
    markFailedTxMock.mockReset();
    tryFinalizeTxMock.mockReset();
    deletePendingMock.mockReset();
    completeS3Mock.mockReset();
    abortS3Mock.mockReset();
    deleteObjMock.mockReset();
    headMock.mockReset();
    sessionMock.mockReset();
    autoEnqueueMock.mockReset();
    sessionMock.mockResolvedValue({ user: { userId: "doc-1", role: "doctor" } });
    completeS3Mock.mockResolvedValue(undefined);
    abortS3Mock.mockResolvedValue(undefined);
    deleteObjMock.mockResolvedValue(undefined);
    deletePendingMock.mockResolvedValue(true);
    headMock.mockResolvedValue({
      contentLength: 100,
      contentType: "image/png",
      metadata: {
        "media-id": MEDIA,
        "owner-user-id": "doc-1",
        "expected-size": "100",
      },
    });
    tryFinalizeTxMock.mockResolvedValue({
      kind: "finalized",
      result: { sessionRows: 1, mediaRows: 1 },
    });
  });

  it("returns 403 without doctor session", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost/api/media/multipart/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: SESSION, parts: [{ PartNumber: 1, ETag: '"a"' }] }),
      }),
    );
    expect(res.status).toBe(403);
    expect(autoEnqueueMock).not.toHaveBeenCalled();
  });

  it("returns 404 when session missing after claim miss", async () => {
    claimTxMock.mockResolvedValue(null);
    getCompletingTxMock.mockResolvedValue(null);
    classifyRejectMock.mockResolvedValue("session_not_found");
    const res = await POST(
      new Request("http://localhost/api/media/multipart/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: SESSION, parts: [{ PartNumber: 1, ETag: '"a"' }] }),
      }),
    );
    expect(res.status).toBe(404);
    const j = (await res.json()) as { error?: string };
    expect(j.error).toBe("session_not_found");
  });

  it("returns 409 session_expired when classify says expired", async () => {
    claimTxMock.mockResolvedValue(null);
    getCompletingTxMock.mockResolvedValue(null);
    classifyRejectMock.mockResolvedValue("session_expired");
    const res = await POST(
      new Request("http://localhost/api/media/multipart/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: SESSION, parts: [{ PartNumber: 1, ETag: '"a"' }] }),
      }),
    );
    expect(res.status).toBe(409);
    const j = (await res.json()) as { error?: string };
    expect(j.error).toBe("session_expired");
  });

  it("returns 409 session_state_conflict when classify says conflict", async () => {
    claimTxMock.mockResolvedValue(null);
    getCompletingTxMock.mockResolvedValue(null);
    classifyRejectMock.mockResolvedValue("session_state_conflict");
    const res = await POST(
      new Request("http://localhost/api/media/multipart/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: SESSION, parts: [{ PartNumber: 1, ETag: '"a"' }] }),
      }),
    );
    expect(res.status).toBe(409);
    const j = (await res.json()) as { error?: string };
    expect(j.error).toBe("session_state_conflict");
  });

  it("returns 200 happy path with S3 complete + finalize", async () => {
    claimTxMock.mockResolvedValue(baseRow());
    getCompletingTxMock.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost/api/media/multipart/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: SESSION, parts: [{ PartNumber: 1, ETag: '"a"' }] }),
      }),
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { ok: boolean; url?: string; mediaId?: string };
    expect(j.ok).toBe(true);
    expect(j.url).toBe(`/api/media/${MEDIA}`);
    expect(completeS3Mock).toHaveBeenCalled();
    expect(tryFinalizeTxMock).toHaveBeenCalled();
    expect(autoEnqueueMock).toHaveBeenCalledWith(MEDIA);
  });

  it("skips S3 complete when retrying stuck completing session", async () => {
    claimTxMock.mockResolvedValue(null);
    getCompletingTxMock.mockResolvedValue(baseRow());
    const res = await POST(
      new Request("http://localhost/api/media/multipart/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: SESSION, parts: [{ PartNumber: 1, ETag: '"a"' }] }),
      }),
    );
    expect(res.status).toBe(200);
    expect(completeS3Mock).not.toHaveBeenCalled();
    expect(headMock).toHaveBeenCalled();
    expect(autoEnqueueMock).toHaveBeenCalledWith(MEDIA);
  });

  it("returns 400 invalid_parts and marks session failed", async () => {
    claimTxMock.mockResolvedValue(baseRow());
    const res = await POST(
      new Request("http://localhost/api/media/multipart/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: SESSION,
          parts: [
            { PartNumber: 1, ETag: '"a"' },
            { PartNumber: 2, ETag: '"b"' },
          ],
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect(markFailedTxMock).toHaveBeenCalled();
    expect(completeS3Mock).not.toHaveBeenCalled();
  });

  it("returns 409 finalize_inconsistent_state when finalize partial", async () => {
    claimTxMock.mockResolvedValue(baseRow());
    tryFinalizeTxMock.mockResolvedValue({
      kind: "partial",
      result: { sessionRows: 0, mediaRows: 0 },
    });
    const res = await POST(
      new Request("http://localhost/api/media/multipart/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: SESSION, parts: [{ PartNumber: 1, ETag: '"a"' }] }),
      }),
    );
    expect(res.status).toBe(409);
    const j = (await res.json()) as { error?: string };
    expect(j.error).toBe("finalize_inconsistent_state");
    expect(autoEnqueueMock).not.toHaveBeenCalled();
  });

  it("returns 200 when finalize idempotent already_done", async () => {
    claimTxMock.mockResolvedValue(baseRow());
    tryFinalizeTxMock.mockResolvedValue({
      kind: "already_done",
      result: { sessionRows: 0, mediaRows: 0 },
    });
    const res = await POST(
      new Request("http://localhost/api/media/multipart/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: SESSION, parts: [{ PartNumber: 1, ETag: '"a"' }] }),
      }),
    );
    expect(res.status).toBe(200);
    expect(autoEnqueueMock).toHaveBeenCalledWith(MEDIA);
  });
});
