import { describe, expect, it } from "vitest";
import { createInMemoryReminderJournalPort } from "./inMemoryReminderJournal";

describe("createInMemoryReminderJournalPort", () => {
  it("statsForUser counts actions in journal", async () => {
    const j = createInMemoryReminderJournalPort();
    await j.logAction({
      ruleIntegratorId: "r1",
      platformUserId: "u1",
      occurrenceId: "o1",
      action: "done",
    });
    await j.logAction({
      ruleIntegratorId: "r1",
      platformUserId: "u1",
      occurrenceId: "o2",
      action: "skipped",
      skipReason: "x",
    });
    await j.logAction({
      ruleIntegratorId: "r1",
      platformUserId: "u1",
      occurrenceId: "o3",
      action: "snoozed",
      snoozeUntil: "2026-04-03T12:00:00.000Z",
    });
    const s = await j.statsForUser("u1", 30);
    expect(s).toEqual({ done: 1, skipped: 1, snoozed: 1 });
  });

  it("statsPerRuleForUser aggregates by rule within window", async () => {
    const j = createInMemoryReminderJournalPort();
    await j.logAction({
      ruleIntegratorId: "rule-a",
      platformUserId: "u1",
      occurrenceId: "o1",
      action: "done",
    });
    await j.logAction({
      ruleIntegratorId: "rule-b",
      platformUserId: "u1",
      occurrenceId: "o2",
      action: "skipped",
    });
    const byRule = await j.statsPerRuleForUser("u1", 30);
    expect(byRule["rule-a"]).toEqual({ done: 1, skipped: 0, snoozed: 0 });
    expect(byRule["rule-b"]).toEqual({ done: 0, skipped: 1, snoozed: 0 });
  });
});
