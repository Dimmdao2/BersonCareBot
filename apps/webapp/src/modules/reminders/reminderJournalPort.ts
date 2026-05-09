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

export type ReminderJournalRuleStats = {
  done: number;
  skipped: number;
  snoozed: number;
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
  /** Counts per `integrator_rule_id` for the user, rolling window in days. */
  statsPerRuleForUser(
    platformUserId: string,
    days: number,
  ): Promise<Record<string, ReminderJournalRuleStats>>;
  /** Done + skipped rows with `created_at` in `[rangeStart, rangeEnd)` (half-open). */
  countDoneSkippedInUtcRange(platformUserId: string, rangeStart: Date, rangeEnd: Date): Promise<number>;
  recordSnooze(
    platformUserId: string,
    integratorOccurrenceId: string,
    minutes: number,
  ): Promise<
    | { ok: true; occurrenceId: string; snoozedUntil: string }
    | { ok: false; error: "not_found" | "conflict" }
  >;
  recordDone(
    platformUserId: string,
    integratorOccurrenceId: string,
  ): Promise<
    | { ok: true; occurrenceId: string; doneAt: string }
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
