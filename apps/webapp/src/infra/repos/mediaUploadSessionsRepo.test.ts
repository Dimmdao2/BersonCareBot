/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzleSqlFragmentToApproximateSql } from "@/infra/db/drizzleSqlDebugText";

const runWebappSqlMock = vi.hoisted(() => vi.fn());
const insertValuesMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@/infra/db/runWebappSql", () => ({
  getWebappSqlDb: vi.fn(() => ({})),
  getWebappSqlFromPgClient: vi.fn(() => ({
    insert: () => ({
      values: insertValuesMock,
    }),
  })),
  runWebappSql: runWebappSqlMock,
}));

import {
  abortMultipartPendingTx,
  deletePendingMediaFileTx,
  insertUploadSessionTx,
  lockExpiredSessionForCleanupTx,
} from "./mediaUploadSessionsRepo";

function approxSql(fragment: unknown): string {
  return drizzleSqlFragmentToApproximateSql(fragment);
}

describe("mediaUploadSessionsRepo cleanup helpers", () => {
  beforeEach(() => {
    runWebappSqlMock.mockReset();
    insertValuesMock.mockClear();
  });

  it("lockExpiredSessionForCleanupTx selects only expired active sessions with FOR UPDATE", async () => {
    runWebappSqlMock.mockResolvedValueOnce({
      rows: [
        {
          id: "sess-1",
          media_id: "media-1",
          s3_key: "media/x/f.png",
          upload_id: "up-1",
        },
      ],
    });
    const client = {} as import("pg").PoolClient;
    const row = await lockExpiredSessionForCleanupTx(client, "sess-1");
    expect(row?.upload_id).toBe("up-1");
    const sql = approxSql(runWebappSqlMock.mock.calls[0]?.[1]);
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("expires_at <= now()");
    expect(sql).toContain("initiated");
  });

  it("deletePendingMediaFileTx deletes only pending media_files", async () => {
    runWebappSqlMock.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const client = {} as import("pg").PoolClient;
    const n = await deletePendingMediaFileTx(client, "media-1");
    expect(n).toBe(1);
    expect(approxSql(runWebappSqlMock.mock.calls[0]?.[1])).toContain("status = 'pending'");
  });

  it("abortMultipartPendingTx returns aborted only when pending media is deleted", async () => {
    runWebappSqlMock
      .mockResolvedValueOnce({
        rows: [
          {
            session_id: "sess-1",
            media_id: "media-1",
            s3_key: "media/x/f.png",
            upload_id: "up-1",
            session_status: "uploading",
            media_status: "pending",
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const client = {} as import("pg").PoolClient;
    const out = await abortMultipartPendingTx(client, "sess-1", "owner-1");
    expect(out).toEqual({ ok: "aborted", s3Key: "media/x/f.png", uploadId: "up-1" });
    expect(approxSql(runWebappSqlMock.mock.calls[1]?.[1])).toContain("status = 'pending'");
  });

  it("abortMultipartPendingTx returns already_completed when media is ready", async () => {
    runWebappSqlMock.mockResolvedValueOnce({
      rows: [
        {
          session_id: "sess-1",
          media_id: "media-1",
          s3_key: "media/x/f.png",
          upload_id: "up-1",
          session_status: "uploading",
          media_status: "ready",
        },
      ],
    });
    const client = {} as import("pg").PoolClient;
    const out = await abortMultipartPendingTx(client, "sess-1", "owner-1");
    expect(out).toEqual({ ok: "already_completed" });
  });
});

describe("insertUploadSessionTx", () => {
  beforeEach(() => {
    insertValuesMock.mockClear();
  });

  it("inserts initiated session via drizzle on PoolClient", async () => {
    const client = {} as import("pg").PoolClient;
    const expiresAt = new Date("2026-06-01T12:00:00.000Z");
    await insertUploadSessionTx(client, {
      sessionId: "55555555-5555-4555-8555-555555555555",
      mediaId: "66666666-6666-4666-8666-666666666666",
      s3Key: "media/k/a.png",
      uploadId: "up-new",
      ownerUserId: "77777777-7777-4777-8777-777777777777",
      expectedSizeBytes: 1024,
      mimeType: "image/png",
      partSizeBytes: 5_242_880,
      expiresAt,
    });
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "55555555-5555-4555-8555-555555555555",
        mediaId: "66666666-6666-4666-8666-666666666666",
        status: "initiated",
        uploadId: "up-new",
        expiresAt: expiresAt.toISOString(),
      }),
    );
  });
});
