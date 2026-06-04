import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzleSqlFragmentToApproximateSql } from "@/infra/db/drizzleSqlDebugText";

const runWebappSqlMock = vi.hoisted(() => vi.fn());
const rollbackMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  getWebappSqlDb: vi.fn(() => ({})),
  runWebappSql: runWebappSqlMock,
  runWebappTransaction: vi.fn(async (fn: (tx: { rollback: () => void }) => Promise<unknown>) => {
    const tx = { rollback: rollbackMock };
    return fn(tx);
  }),
}));

import { createPgReminderJournalPort } from "./pgReminderJournal";

function approxSqlAt(callIndex: number): string {
  const fragment = runWebappSqlMock.mock.calls[callIndex]?.[1];
  return drizzleSqlFragmentToApproximateSql(fragment);
}

describe("createPgReminderJournalPort (pg SQL)", () => {
  beforeEach(() => {
    runWebappSqlMock.mockClear();
    rollbackMock.mockClear();
    runWebappSqlMock.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it("logAction throws when INSERT returns no row (rule not found)", async () => {
    const port = createPgReminderJournalPort();
    await expect(
      port.logAction({
        ruleIntegratorId: "missing-rule",
        platformUserId: "platform-1",
        occurrenceId: "occ-1",
        action: "done",
      }),
    ).rejects.toThrow(/no row inserted/);
    expect(approxSqlAt(0)).toContain("INSERT INTO reminder_journal");
  });

  it("recordSnooze returns not_found and rolls back when occurrence is not owned", async () => {
    const port = createPgReminderJournalPort();
    const result = await port.recordSnooze("platform-user-1", "occ-missing", 15);
    expect(result).toEqual({ ok: false, error: "not_found" });
    expect(rollbackMock).toHaveBeenCalledTimes(1);
  });

  it("recordSnooze returns existing snooze_until without UPDATE when until unchanged", async () => {
    const existingUntil = "2026-06-05T12:00:00.000Z";
    runWebappSqlMock
      .mockResolvedValueOnce({
        rows: [{ rule_pk: "rule-pk", snoozed_until: existingUntil, skipped_at: null }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [{ until: existingUntil }],
        rowCount: 1,
      });
    const port = createPgReminderJournalPort();
    const result = await port.recordSnooze("platform-user-1", "occ-1", 15);
    expect(result).toEqual({
      ok: true,
      occurrenceId: "occ-1",
      snoozedUntil: existingUntil,
    });
    expect(rollbackMock).not.toHaveBeenCalled();
    const calls = runWebappSqlMock.mock.calls.length;
    expect(calls).toBe(2);
    expect(approxSqlAt(1)).toContain("make_interval");
  });

  it("recordDone returns not_found and rolls back when occurrence is not owned", async () => {
    const port = createPgReminderJournalPort();
    const result = await port.recordDone("platform-user-1", "occ-missing", "Europe/Moscow");
    expect(result).toEqual({ ok: false, error: "not_found" });
    expect(rollbackMock).toHaveBeenCalledTimes(1);
  });

  it("recordDone treats duplicate done journal as idempotent (reuses existing created_at)", async () => {
    const doneAt = "2026-06-05T10:00:00.000Z";
    runWebappSqlMock
      .mockResolvedValueOnce({
        rows: [
          {
            rule_pk: "rule-pk",
            integrator_user_id: "99",
            occurred_at: "2026-06-05T08:00:00.000Z",
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ created_at: doneAt }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ day_sent_total: 1, day_done_count: 1 }],
        rowCount: 1,
      });
    const port = createPgReminderJournalPort();
    const result = await port.recordDone("platform-user-1", "occ-dup", "Europe/Moscow");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.firstDoneForOccurrence).toBe(false);
    expect(result.doneAt).toBe(doneAt);
    expect(approxSqlAt(1)).toContain("WHERE NOT EXISTS");
    expect(approxSqlAt(2)).toContain("action = 'done'");
  });

  it("recordSkip returns ok with skippedAt when UPDATE succeeds", async () => {
    const skippedAt = "2026-06-05T11:00:00.000Z";
    runWebappSqlMock
      .mockResolvedValueOnce({ rows: [{ rule_pk: "rule-pk" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ skipped_at: skippedAt }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const port = createPgReminderJournalPort();
    const result = await port.recordSkip("platform-user-1", "occ-skip", "busy");
    expect(result).toEqual({
      ok: true,
      occurrenceId: "occ-skip",
      skippedAt,
    });
    expect(approxSqlAt(2)).toContain("action = 'skipped'");
    expect(approxSqlAt(2)).toContain("WHERE NOT EXISTS");
  });

  it("recordSkip rolls back when UPDATE returns no skipped_at", async () => {
    runWebappSqlMock
      .mockResolvedValueOnce({ rows: [{ rule_pk: "rule-pk" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const port = createPgReminderJournalPort();
    const result = await port.recordSkip("platform-user-1", "occ-bad", "busy");
    expect(result).toEqual({ ok: false, error: "not_found" });
    expect(rollbackMock).toHaveBeenCalled();
  });
});
