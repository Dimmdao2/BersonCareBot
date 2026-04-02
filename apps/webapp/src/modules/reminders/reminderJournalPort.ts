export type ReminderJournalAction = "done" | "skipped" | "snoozed";

export type ReminderJournalEntry = {
  id: string;
  ruleId: string;
  occurrenceId: string | null;
  action: ReminderJournalAction;
  snoozeUntil: string | null;
  skipReason: string | null;
  createdAt: string;
};

export type ReminderJournalPort = {
  logAction(params: {
    ruleIntegratorId: string;
    platformUserId: string;
    occurrenceId: string | null;
    action: ReminderJournalAction;
    snoozeUntil?: string | null;
    skipReason?: string | null;
  }): Promise<void>;
  listByRule(ruleIntegratorId: string, platformUserId: string): Promise<ReminderJournalEntry[]>;
  statsForUser(
    platformUserId: string,
    days: number,
  ): Promise<{ done: number; skipped: number; snoozed: number }>;
  recordSnooze(
    platformUserId: string,
    integratorOccurrenceId: string,
    minutes: 30 | 60 | 120,
  ): Promise<
    | { ok: true; occurrenceId: string; snoozedUntil: string }
    | { ok: false; error: "not_found" | "conflict" }
  >;
  recordSkip(
    platformUserId: string,
    integratorOccurrenceId: string,
    reason: string | null,
  ): Promise<
    | { ok: true; occurrenceId: string; skippedAt: string }
    | { ok: false; error: "not_found" }
  >;
};
