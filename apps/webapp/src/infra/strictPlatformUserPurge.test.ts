/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const writeAuditLogMock = vi.fn();
const collectKeysMock = vi.fn();
const runCoreMock = vi.fn();
const deleteS3Mock = vi.fn();
const deleteIntegratorResultMock = vi.fn();
const resolveIntegratorIdsMock = vi.fn();
const poolQueryMock = vi.fn();
const clientQueryMock = vi.fn();

vi.mock("@/config/env", () => ({
  env: {},
  isS3MediaEnabled: () => true,
}));

vi.mock("@/infra/adminAuditLog", () => ({
  writeAuditLog: (...a: unknown[]) => writeAuditLogMock(...a),
}));

vi.mock("@/infra/platformUserFullPurge", async () => {
  const actual = await vi.importActual<typeof import("@/infra/platformUserFullPurge")>(
    "@/infra/platformUserFullPurge",
  );
  return {
    ...actual,
    collectPurgeArtifactKeys: (...a: unknown[]) => collectKeysMock(...a),
    runWebappPurgeCoreInTransaction: (...a: unknown[]) => runCoreMock(...a),
    deleteIntegratorPhoneDataWithResult: (...a: unknown[]) => deleteIntegratorResultMock(...a),
    resolveIntegratorUserIds: (...a: unknown[]) => resolveIntegratorIdsMock(...a),
    getIntegratorPoolForPurge: () => ({}),
  };
});

vi.mock("@/infra/s3/client", () => ({
  deleteS3ObjectsWithPerKeyResults: (...a: unknown[]) => deleteS3Mock(...a),
}));

vi.mock("@/infra/db/client", () => ({
  getPool: () => ({
    connect: () =>
      Promise.resolve({
        query: (...a: unknown[]) => clientQueryMock(...a),
        release: vi.fn(),
      }),
    query: (...a: unknown[]) => poolQueryMock(...a),
  }),
}));

const uid = "00000000-0000-4000-8000-000000000099";

describe("runStrictPurgePlatformUser", () => {
  beforeEach(() => {
    writeAuditLogMock.mockResolvedValue(undefined);
    collectKeysMock.mockResolvedValue({ intakeS3Keys: [], mediaFiles: [] });
    runCoreMock.mockResolvedValue(undefined);
    deleteS3Mock.mockResolvedValue([]);
    deleteIntegratorResultMock.mockResolvedValue({ ok: true, skipped: true });
    resolveIntegratorIdsMock.mockResolvedValue([]);
    poolQueryMock.mockImplementation((sql: string) => {
      if (String(sql).includes("FROM platform_users WHERE id")) {
        return Promise.resolve({
          rows: [
            {
              id: uid,
              phone_normalized: "+70000000000",
              integrator_user_id: "42",
              role: "client",
            },
          ],
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    clientQueryMock.mockImplementation((sql: string) => Promise.resolve({ rows: [], rowCount: 0 }));
  });

  it("writes audit with error when webapp transaction fails — separate from rolled-back tx", async () => {
    const { runStrictPurgePlatformUser } = await import("@/infra/strictPlatformUserPurge");
    clientQueryMock.mockImplementation((sql: string) => {
      if (sql === "COMMIT") return Promise.reject(new Error("forced_fail"));
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const r = await runStrictPurgePlatformUser({
      targetId: uid,
      actorId: "00000000-0000-4000-8000-0000000000a1",
      audit: { enabled: true },
    });

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected failure");
    expect(r.error).toBe("transaction_failed");
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "user_purge",
        status: "error",
        targetId: uid,
      }),
    );
  });

  it("runs BEGIN → exclusive lock → collect keys → core → COMMIT", async () => {
    const { runStrictPurgePlatformUser } = await import("@/infra/strictPlatformUserPurge");
    const order: string[] = [];
    clientQueryMock.mockImplementation((sql: string) => {
      order.push(sql);
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const r = await runStrictPurgePlatformUser({ targetId: uid, actorId: null, audit: { enabled: false } });

    expect(r.ok).toBe(true);
    const beginIdx = order.indexOf("BEGIN");
    const lockIdx = order.findIndex((s) => s.includes("pg_advisory_xact_lock") && !s.includes("shared"));
    const commitIdx = order.indexOf("COMMIT");
    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(lockIdx).toBeGreaterThan(beginIdx);
    expect(commitIdx).toBeGreaterThan(lockIdx);
    expect(collectKeysMock).toHaveBeenCalled();
    expect(runCoreMock).toHaveBeenCalled();
  });

  it("post-commit: S3 and integrator both run even when S3 has failures (no short-circuit)", async () => {
    const { runStrictPurgePlatformUser } = await import("@/infra/strictPlatformUserPurge");
    collectKeysMock.mockResolvedValue({
      intakeS3Keys: ["k1"],
      mediaFiles: [{ id: "00000000-0000-4000-8000-0000000000aa", s3Key: "k2" }],
    });
    deleteS3Mock.mockResolvedValue([
      { key: "k1", ok: false, error: "s3_down" },
      { key: "k2", ok: true },
    ]);
    deleteIntegratorResultMock.mockResolvedValue({ ok: false, message: "integrator_down" });
    resolveIntegratorIdsMock.mockResolvedValue(["1"]);

    const r = await runStrictPurgePlatformUser({ targetId: uid, actorId: null, audit: { enabled: false } });

    expect(deleteS3Mock).toHaveBeenCalled();
    expect(deleteIntegratorResultMock).toHaveBeenCalled();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.outcome).toBe("partial_failed");
  });

  it("deletes media_files rows without s3_key as DB-only artifacts", async () => {
    const { runStrictPurgePlatformUser } = await import("@/infra/strictPlatformUserPurge");
    collectKeysMock.mockResolvedValue({
      intakeS3Keys: [],
      mediaFiles: [{ id: "00000000-0000-4000-8000-0000000000bb", s3Key: null }],
    });
    poolQueryMock.mockImplementation((sql: string) => {
      if (String(sql).includes("FROM platform_users WHERE id")) {
        return Promise.resolve({
          rows: [
            {
              id: uid,
              phone_normalized: "+70000000000",
              integrator_user_id: "42",
              role: "client",
            },
          ],
        });
      }
      if (String(sql).includes("DELETE FROM media_files WHERE id")) {
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const r = await runStrictPurgePlatformUser({ targetId: uid, actorId: null, audit: { enabled: false } });

    expect(deleteS3Mock).toHaveBeenCalledWith([]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.details.mediaRowsDeleted).toBe(1);
  });

  it("integrator-only failure yields needs_retry when S3 path is clean", async () => {
    const { runStrictPurgePlatformUser } = await import("@/infra/strictPlatformUserPurge");
    collectKeysMock.mockResolvedValue({ intakeS3Keys: [], mediaFiles: [] });
    deleteS3Mock.mockResolvedValue([]);
    deleteIntegratorResultMock.mockResolvedValue({ ok: false, message: "db_down" });
    resolveIntegratorIdsMock.mockResolvedValue(["1"]);

    const r = await runStrictPurgePlatformUser({ targetId: uid, actorId: null, audit: { enabled: false } });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.outcome).toBe("needs_retry");
  });

  it("stores retry payload in purge audit details", async () => {
    const { runStrictPurgePlatformUser } = await import("@/infra/strictPlatformUserPurge");
    collectKeysMock.mockResolvedValue({
      intakeS3Keys: ["intake-k1"],
      mediaFiles: [{ id: "00000000-0000-4000-8000-0000000000cc", s3Key: "media-k1" }],
    });
    resolveIntegratorIdsMock.mockResolvedValue(["42", "84"]);
    deleteS3Mock.mockResolvedValue([
      { key: "intake-k1", ok: true },
      { key: "media-k1", ok: true },
    ]);
    poolQueryMock.mockImplementation((sql: string) => {
      if (String(sql).includes("FROM platform_users WHERE id")) {
        return Promise.resolve({
          rows: [
            {
              id: uid,
              phone_normalized: "+70000000000",
              integrator_user_id: "42",
              role: "client",
            },
          ],
        });
      }
      if (String(sql).includes("DELETE FROM media_files WHERE id")) {
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const r = await runStrictPurgePlatformUser({
      targetId: uid,
      actorId: "00000000-0000-4000-8000-0000000000a1",
      audit: { enabled: true },
    });

    expect(r.ok).toBe(true);
    expect(writeAuditLogMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "user_purge",
        status: "ok",
        details: expect.objectContaining({
          phoneNormalized: "+70000000000",
          webappIntegratorUserId: "42",
          resolvedIntegratorUserIds: ["42", "84"],
          artifact: {
            intakeS3Keys: ["intake-k1"],
            mediaFiles: [{ id: "00000000-0000-4000-8000-0000000000cc", s3Key: "media-k1" }],
          },
        }),
      }),
    );
  });
});

describe("retryStrictPurgeExternalCleanup", () => {
  beforeEach(() => {
    writeAuditLogMock.mockResolvedValue(undefined);
    deleteS3Mock.mockResolvedValue([]);
    deleteIntegratorResultMock.mockResolvedValue({ ok: true, skipped: true });
    resolveIntegratorIdsMock.mockResolvedValue([]);
    poolQueryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it("smoke: runs post-commit helpers", async () => {
    const { retryStrictPurgeExternalCleanup } = await import("@/infra/strictPlatformUserPurge");
    const r = await retryStrictPurgeExternalCleanup({
      phoneNormalized: "+70000000000",
      webappIntegratorUserId: "1",
      artifact: { intakeS3Keys: [], mediaFiles: [] },
      actorId: null,
      audit: { enabled: false },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.outcome).toBe("completed");
  });
});
