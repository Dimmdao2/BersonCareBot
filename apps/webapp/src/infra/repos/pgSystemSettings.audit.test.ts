/**
 * Unit tests for the system_settings audit trail.
 * Verifies that upsert + upsertManyInTransaction always emit an audit INSERT
 * with the correct old→new values and changed_by, without touching a real DB.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { runWebappPgTextMock, runWebappTransactionMock } = vi.hoisted(() => ({
  runWebappPgTextMock: vi.fn(),
  runWebappTransactionMock: vi.fn(),
}));

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
  runWebappTransaction: (...args: unknown[]) => runWebappTransactionMock(...args),
}));

import { createPgSystemSettingsPort } from "./pgSystemSettings";

/** Fake transaction executor: just passes the mock context as `tx` */
function setupTransactionMock() {
  runWebappTransactionMock.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => fn({ _fakeTransaction: true }),
  );
}

/** Build the sequence of runWebappPgText mock responses for a single upsertWithAudit call:
 *  1) SELECT (old value read) → returns `oldRow`
 *  2) INSERT … RETURNING → returns `newRow`
 *  3) INSERT audit → void
 */
function mockSingleUpsertSequence(
  oldRow: { value_json: unknown } | null,
  newRow: {
    key: string;
    scope: string;
    value_json: unknown;
    updated_at: string;
    updated_by: string | null;
  },
) {
  runWebappPgTextMock
    .mockResolvedValueOnce({ rows: oldRow ? [oldRow] : [] }) // SELECT current
    .mockResolvedValueOnce({ rows: [newRow] })               // INSERT … RETURNING
    .mockResolvedValueOnce({ rows: [] });                    // INSERT audit
}

describe("pgSystemSettings audit trail — upsert (single)", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    runWebappTransactionMock.mockReset();
    setupTransactionMock();
  });

  it("first-set: audit INSERT has old_value_json = NULL", async () => {
    const newRow = {
      key: "dev_mode",
      scope: "admin",
      value_json: { value: true },
      updated_at: "2026-06-21T00:00:00.000Z",
      updated_by: "user-uuid-123",
    };
    mockSingleUpsertSequence(null, newRow); // no existing row → old is NULL

    const port = createPgSystemSettingsPort();
    const result = await port.upsert("dev_mode", "admin", { value: true }, "user-uuid-123");

    expect(result.key).toBe("dev_mode");

    // The 3rd call must be the audit INSERT
    const auditCall = runWebappPgTextMock.mock.calls[2];
    expect(auditCall).toBeDefined();
    const [auditSql, auditParams] = auditCall as [string, unknown[]];

    expect(auditSql).toMatch(/INSERT INTO system_settings_audit/i);
    expect(auditParams[0]).toBe("dev_mode");           // key
    expect(auditParams[1]).toBe("admin");              // scope
    expect(auditParams[2]).toBeNull();                 // old_value_json — NULL on first-set
    expect(auditParams[3]).toBe(JSON.stringify({ value: true })); // new_value_json
    expect(auditParams[4]).toBe("user-uuid-123");      // changed_by
    expect(auditParams[5]).toBe("system_settings_repo"); // source
  });

  it("update: audit INSERT carries old value and new value", async () => {
    const oldValue = { value: false };
    const newValue = { value: true };
    const newRow = {
      key: "dev_mode",
      scope: "admin",
      value_json: newValue,
      updated_at: "2026-06-21T00:00:00.000Z",
      updated_by: "admin-uuid",
    };
    mockSingleUpsertSequence({ value_json: oldValue }, newRow);

    const port = createPgSystemSettingsPort();
    await port.upsert("dev_mode", "admin", newValue, "admin-uuid");

    const auditCall = runWebappPgTextMock.mock.calls[2];
    expect(auditCall).toBeDefined();
    const [, auditParams] = auditCall as [string, unknown[]];

    expect(auditParams[2]).toBe(JSON.stringify(oldValue)); // old_value_json
    expect(auditParams[3]).toBe(JSON.stringify(newValue)); // new_value_json
    expect(auditParams[4]).toBe("admin-uuid");             // changed_by
  });

  it("update by anonymous: changed_by = null passes through", async () => {
    const newRow = {
      key: "patient_label",
      scope: "doctor",
      value_json: { value: "клиент" },
      updated_at: "2026-06-21T00:00:00.000Z",
      updated_by: null,
    };
    mockSingleUpsertSequence({ value_json: { value: "пациент" } }, newRow);

    const port = createPgSystemSettingsPort();
    await port.upsert("patient_label", "doctor", { value: "клиент" }, null);

    const auditCall = runWebappPgTextMock.mock.calls[2];
    const [, auditParams] = auditCall as [string, unknown[]];
    expect(auditParams[4]).toBeNull(); // changed_by = null
  });

  it("upsert runs inside a transaction (runWebappTransaction called)", async () => {
    const newRow = {
      key: "dev_mode",
      scope: "admin",
      value_json: { value: false },
      updated_at: "2026-06-21T00:00:00.000Z",
      updated_by: null,
    };
    mockSingleUpsertSequence(null, newRow);

    const port = createPgSystemSettingsPort();
    await port.upsert("dev_mode", "admin", { value: false }, null);

    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
  });

  it("exactly 3 SQL calls per single upsert (SELECT + INSERT upsert + INSERT audit)", async () => {
    const newRow = {
      key: "dev_mode",
      scope: "admin",
      value_json: { value: true },
      updated_at: "2026-06-21T00:00:00.000Z",
      updated_by: "u1",
    };
    mockSingleUpsertSequence(null, newRow);

    const port = createPgSystemSettingsPort();
    await port.upsert("dev_mode", "admin", { value: true }, "u1");

    expect(runWebappPgTextMock).toHaveBeenCalledTimes(3);
  });
});

describe("pgSystemSettings audit trail — upsertManyInTransaction", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    runWebappTransactionMock.mockReset();
    setupTransactionMock();
  });

  it("emits one audit row per setting in the batch", async () => {
    // Two settings: dev_mode (first-set) + patient_label (update)
    const rows = [
      { key: "dev_mode" as const,     scope: "admin" as const, valueJson: { value: true },       updatedBy: "u1" },
      { key: "patient_label" as const, scope: "doctor" as const, valueJson: { value: "клиент" }, updatedBy: "u1" },
    ];

    // Mock sequence for dev_mode (first-set):
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [] })                          // SELECT — no prior row
      .mockResolvedValueOnce({ rows: [{ key: "dev_mode", scope: "admin", value_json: { value: true }, updated_at: "", updated_by: "u1" }] })
      .mockResolvedValueOnce({ rows: [] })                          // audit INSERT
      // Mock sequence for patient_label (update):
      .mockResolvedValueOnce({ rows: [{ value_json: { value: "пациент" } }] }) // SELECT — has prior
      .mockResolvedValueOnce({ rows: [{ key: "patient_label", scope: "doctor", value_json: { value: "клиент" }, updated_at: "", updated_by: "u1" }] })
      .mockResolvedValueOnce({ rows: [] });                         // audit INSERT

    const port = createPgSystemSettingsPort();
    const out = await port.upsertManyInTransaction(rows);

    expect(out).toHaveLength(2);
    expect(runWebappTransactionMock).toHaveBeenCalledTimes(1);
    // 3 calls per setting × 2 settings = 6 total
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(6);

    // First audit row (dev_mode, first-set): old = null
    const audit1 = runWebappPgTextMock.mock.calls[2] as [string, unknown[]];
    expect(audit1[0]).toMatch(/INSERT INTO system_settings_audit/i);
    expect(audit1[1][2]).toBeNull(); // old_value_json null

    // Second audit row (patient_label, update): old = пациент
    const audit2 = runWebappPgTextMock.mock.calls[5] as [string, unknown[]];
    expect(audit2[0]).toMatch(/INSERT INTO system_settings_audit/i);
    expect(audit2[1][2]).toBe(JSON.stringify({ value: "пациент" })); // old_value_json
    expect(audit2[1][3]).toBe(JSON.stringify({ value: "клиент" }));  // new_value_json
  });

  it("empty batch: no DB calls", async () => {
    const port = createPgSystemSettingsPort();
    const out = await port.upsertManyInTransaction([]);
    expect(out).toHaveLength(0);
    expect(runWebappPgTextMock).not.toHaveBeenCalled();
    expect(runWebappTransactionMock).not.toHaveBeenCalled();
  });
});
