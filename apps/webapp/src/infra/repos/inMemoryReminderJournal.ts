import type {
  ReminderJournalEntry,
  ReminderJournalPort,
  ReminderJournalRuleStats,
} from "@/modules/reminders/reminderJournalPort";

type OccState = {
  snoozedUntil: string | null;
  skippedAt: string | null;
  skipReason: string | null;
  /** Synthetic key aligned with `logAction.ruleId` / listByRule filter (no DB join in tests). */
  journalRuleIntegratorId: string;
};

/**
 * In-memory журнал для unit-тестов сервиса напоминаний (без PostgreSQL).
 */
export function createInMemoryReminderJournalPort(): ReminderJournalPort {
  const journal: ReminderJournalEntry[] = [];
  const occById = new Map<string, OccState>();

  return {
    async logAction(params) {
      journal.unshift({
        id: `j-${journal.length}`,
        ruleId: params.ruleIntegratorId,
        occurrenceId: params.occurrenceId,
        action: params.action,
        snoozeUntil: params.snoozeUntil ?? null,
        skipReason: params.skipReason ?? null,
        createdAt: new Date().toISOString(),
      });
    },

    async listByRule(ruleIntegratorId, _platformUserId) {
      return journal.filter((e) => e.ruleId === ruleIntegratorId);
    },

    async statsForUser(_platformUserId, _days) {
      return {
        done: journal.filter((e) => e.action === "done").length,
        skipped: journal.filter((e) => e.action === "skipped").length,
        snoozed: journal.filter((e) => e.action === "snoozed").length,
      };
    },

    async statsPerRuleForUser(_platformUserId, days) {
      const cutoff = Date.now() - days * 86_400_000;
      const out: Record<string, ReminderJournalRuleStats> = {};
      for (const e of journal) {
        if (new Date(e.createdAt).getTime() < cutoff) continue;
        if (!out[e.ruleId]) out[e.ruleId] = { done: 0, skipped: 0, snoozed: 0 };
        if (e.action === "done") out[e.ruleId].done += 1;
        else if (e.action === "skipped") out[e.ruleId].skipped += 1;
        else if (e.action === "snoozed") out[e.ruleId].snoozed += 1;
      }
      return out;
    },

    async recordSnooze(platformUserId, integratorOccurrenceId, minutes) {
      const key = `${platformUserId}:${integratorOccurrenceId}`;
      if (!occById.has(key)) {
        occById.set(key, {
          snoozedUntil: null,
          skippedAt: null,
          skipReason: null,
          journalRuleIntegratorId: `inmem-rule-${integratorOccurrenceId}`,
        });
      }
      const st = occById.get(key)!;
      if (st.skippedAt) {
        return { ok: false, error: "not_found" };
      }
      const until = new Date(Date.now() + minutes * 60_000).toISOString();
      if (st.snoozedUntil === until) {
        return { ok: true, occurrenceId: integratorOccurrenceId, snoozedUntil: until };
      }
      st.snoozedUntil = until;
      journal.unshift({
        id: `j-${journal.length}`,
        ruleId: st.journalRuleIntegratorId,
        occurrenceId: integratorOccurrenceId,
        action: "snoozed",
        snoozeUntil: until,
        skipReason: null,
        createdAt: new Date().toISOString(),
      });
      return { ok: true, occurrenceId: integratorOccurrenceId, snoozedUntil: until };
    },

    async recordSkip(platformUserId, integratorOccurrenceId, reason) {
      const key = `${platformUserId}:${integratorOccurrenceId}`;
      if (!occById.has(key)) {
        occById.set(key, {
          snoozedUntil: null,
          skippedAt: null,
          skipReason: null,
          journalRuleIntegratorId: `inmem-rule-${integratorOccurrenceId}`,
        });
      }
      const st = occById.get(key)!;
      if (!st.skippedAt) {
        st.skippedAt = new Date().toISOString();
        st.skipReason = reason;
        journal.unshift({
          id: `j-${journal.length}`,
          ruleId: st.journalRuleIntegratorId,
          occurrenceId: integratorOccurrenceId,
          action: "skipped",
          snoozeUntil: null,
          skipReason: reason,
          createdAt: new Date().toISOString(),
        });
      }
      return { ok: true, occurrenceId: integratorOccurrenceId, skippedAt: st.skippedAt! };
    },
  };
}
