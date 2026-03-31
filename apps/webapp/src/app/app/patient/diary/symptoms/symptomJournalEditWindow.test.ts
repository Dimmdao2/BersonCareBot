import { describe, expect, it } from "vitest";
import {
  isSymptomJournalEntryEditable,
  SYMPTOM_JOURNAL_EDIT_WINDOW_MS,
} from "./symptomJournalEditWindow";

describe("isSymptomJournalEntryEditable", () => {
  it("returns true for recordedAt within the last 24h", () => {
    const now = Date.parse("2026-03-29T12:00:00.000Z");
    const recorded = new Date(now - SYMPTOM_JOURNAL_EDIT_WINDOW_MS + 60_000).toISOString();
    expect(isSymptomJournalEntryEditable(recorded, now)).toBe(true);
  });

  it("returns false when recordedAt is older than 24h", () => {
    const now = Date.parse("2026-03-29T12:00:00.000Z");
    const recorded = new Date(now - SYMPTOM_JOURNAL_EDIT_WINDOW_MS - 60_000).toISOString();
    expect(isSymptomJournalEntryEditable(recorded, now)).toBe(false);
  });
});
