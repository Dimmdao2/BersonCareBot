/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzleSqlFragmentToApproximateSql } from "@/infra/db/drizzleSqlDebugText";

const runWebappSqlMock = vi.hoisted(() => vi.fn());
const insertValuesMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const getPoolMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/client", () => ({
  getPool: getPoolMock,
}));

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
  claimUploadSessionForCompleting,
  deletePendingMediaFileTx,
  finalizeMultipartSuccess,
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

describe("mediaUploadSessionsRepo pool wrappers", () => {
  beforeEach(() => {
    runWebappSqlMock.mockReset();
    getPoolMock.mockReset();
  });

  function mockPool() {
    const client = {
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
      release: vi.fn(),
    };
    getPoolMock.mockReturnValue({
      connect: vi.fn(async () => client),
    });
    return client;
  }

  it("claimUploadSessionForCompleting runs claim in a shared transaction helper", async () => {
    const client = mockPool();
    runWebappSqlMock.mockResolvedValueOnce({
      rows: [
        {
          id: "sess-1",
          media_id: "media-1",
          s3_key: "media/x/f.png",
          upload_id: "up-1",
          owner_user_id: "owner-1",
          status: "completing",
          expected_size_bytes: "10",
          mime_type: "image/png",
          part_size_bytes: 5_242_880,
          expires_at: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    });

    await expect(claimUploadSessionForCompleting("sess-1", "owner-1")).resolves.toMatchObject({
      id: "sess-1",
    });

    expect(client.query.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      "BEGIN",
      "COMMIT",
      "SELECT set_config('app.org', $1, false)",
      "SELECT set_config('app.patient_user_id', $1, false)",
      "SELECT set_config('app.integrator_user_id', $1, false)",
    ]);
  });

  it("finalizeMultipartSuccess commits before validating updated row counts", async () => {
    const client = mockPool();
    runWebappSqlMock
      .mockResolvedValueOnce({ rows: [{ owner_user_id: "owner-1" }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(finalizeMultipartSuccess("sess-1", "media-1")).resolves.toBeUndefined();

    expect(client.query.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      "BEGIN",
      "COMMIT",
      "SELECT set_config('app.org', $1, false)",
      "SELECT set_config('app.patient_user_id', $1, false)",
      "SELECT set_config('app.integrator_user_id', $1, false)",
    ]);
  });
});
