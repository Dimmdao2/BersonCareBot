/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const clientQueryMock = vi.hoisted(() => vi.fn());
const poolReleaseMock = vi.hoisted(() => vi.fn());
const poolConnectMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
  runPgPoolPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
  getWebappSqlFromPgClient: (client: unknown) => client,
}));

import {
  collectPurgeArtifactKeys,
  deleteIntegratorPhoneData,
  runWebappPurgeCoreInTransaction,
} from "./platformUserFullPurge";

const uid = "00000000-0000-4000-8000-000000000099";

describe("platformUserFullPurge SQL bridge", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    clientQueryMock.mockReset();
    poolReleaseMock.mockReset();
    poolConnectMock.mockReset();
    clientQueryMock.mockImplementation(async (sql: string) => {
      const s = String(sql);
      if (s === "BEGIN" || s === "COMMIT" || s === "ROLLBACK") {
        return { rows: [], rowCount: null };
      }
      return { rows: [], rowCount: 0 };
    });
    poolConnectMock.mockResolvedValue({
      query: (...a: unknown[]) => clientQueryMock(...a),
      release: (...a: unknown[]) => poolReleaseMock(...a),
    });
  });

  it("collectPurgeArtifactKeys loads intake and media artifact keys via executor", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [{ s3_key: "intake/a.jpg" }] })
      .mockResolvedValueOnce({ rows: [{ id: "mf-1", s3_key: "media/v.mp4" }] });

    const client = { query: clientQueryMock, release: poolReleaseMock } as never;
    const keys = await collectPurgeArtifactKeys(client, uid);

    expect(keys.intakeS3Keys).toEqual(["intake/a.jpg"]);
    expect(keys.mediaFiles).toEqual([{ id: "mf-1", s3Key: "media/v.mp4" }]);
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain("online_intake_attachments");
    expect(String(runWebappPgTextMock.mock.calls[1]?.[0])).toContain("media_files");
    expect(clientQueryMock).not.toHaveBeenCalled();
  });

  it("runWebappPurgeCoreInTransaction ends with DELETE FROM platform_users", async () => {
    const sqlOrder: string[] = [];
    runWebappPgTextMock.mockImplementation(async (sql: string) => {
      sqlOrder.push(String(sql));
      return { rows: [], rowCount: 1 };
    });

    const client = { query: clientQueryMock, release: poolReleaseMock } as never;
    await runWebappPurgeCoreInTransaction(client, {
      id: uid,
      phone_normalized: null,
      integrator_user_id: null,
      role: "client",
    });

    expect(sqlOrder.length).toBeGreaterThan(0);
    expect(sqlOrder[sqlOrder.length - 1]).toContain("DELETE FROM platform_users");
    expect(clientQueryMock).not.toHaveBeenCalled();
  });

  it("runWebappPurgeCoreInTransaction runs phone-keyed deletes when phone_normalized is set", async () => {
    const sqlOrder: string[] = [];
    runWebappPgTextMock.mockImplementation(async (sql: string) => {
      sqlOrder.push(String(sql));
      return { rows: [], rowCount: 1 };
    });

    const client = { query: clientQueryMock, release: poolReleaseMock } as never;
    await runWebappPurgeCoreInTransaction(client, {
      id: uid,
      phone_normalized: "+79001234567",
      integrator_user_id: null,
      role: "client",
    });

    expect(sqlOrder.some((s) => s.includes("phone_otp_locks"))).toBe(true);
    expect(sqlOrder.some((s) => s.includes("phone_challenges"))).toBe(true);
    expect(sqlOrder[sqlOrder.length - 1]).toContain("DELETE FROM platform_users");
  });

  it("runWebappPurgeCoreInTransaction deletes integrator projection rows when integrator_user_id is numeric", async () => {
    const sqlOrder: string[] = [];
    runWebappPgTextMock.mockImplementation(async (sql: string) => {
      sqlOrder.push(String(sql));
      return { rows: [], rowCount: 1 };
    });

    const client = { query: clientQueryMock, release: poolReleaseMock } as never;
    await runWebappPurgeCoreInTransaction(client, {
      id: uid,
      phone_normalized: null,
      integrator_user_id: "42",
      role: "client",
    });

    expect(sqlOrder.some((s) => s.includes("reminder_delivery_events") && s.includes("integrator_user_id"))).toBe(
      true,
    );
    expect(sqlOrder.some((s) => s.includes("support_conversations") && s.includes("integrator_user_id"))).toBe(true);
  });

  it("deleteIntegratorPhoneData starts and commits through the transaction helper", async () => {
    runWebappPgTextMock.mockResolvedValue({ rows: [], rowCount: 0 });
    const integratorPool = { connect: () => poolConnectMock() } as never;

    await deleteIntegratorPhoneData(integratorPool, "79001234567", ["42"]);

    expect(clientQueryMock).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(clientQueryMock).toHaveBeenCalledWith("COMMIT");
    expect(poolReleaseMock).toHaveBeenCalledTimes(1);
    expect(runWebappPgTextMock.mock.calls.some((c) => String(c[0]).includes("DELETE FROM users"))).toBe(true);
  });

  it("deleteIntegratorPhoneData still purges message_retry_jobs and the integrator user row, and no longer references the dropped Rubitime raw tables (R7)", async () => {
    const sqlCalls: string[] = [];
    runWebappPgTextMock.mockImplementation(async (sql: string) => {
      sqlCalls.push(String(sql));
      return { rows: [], rowCount: 0 };
    });
    const integratorPool = { connect: () => poolConnectMock() } as never;

    await deleteIntegratorPhoneData(integratorPool, "79001234567", ["42"]);

    // Other purge targets remain intact.
    expect(sqlCalls.some((s) => s.includes("DELETE FROM message_retry_jobs"))).toBe(true);
    expect(sqlCalls.some((s) => s.includes("DELETE FROM users"))).toBe(true);

    // R7: rubitime_records / rubitime_events are dropped from the schema; the purge must no longer
    // issue any query against them.
    expect(sqlCalls.some((s) => s.includes("rubitime_records") || s.includes("rubitime_events"))).toBe(false);

    expect(clientQueryMock).toHaveBeenCalledWith("COMMIT");
  });
});
