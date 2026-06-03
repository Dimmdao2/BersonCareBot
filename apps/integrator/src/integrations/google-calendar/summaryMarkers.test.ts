import { describe, expect, it } from "vitest";
import {
  buildGoogleCalendarSummary,
  GCAL_SUMMARY_CANCELLED_PREFIX,
  GCAL_SUMMARY_RESCHEDULE_PENDING_PREFIX,
  stripGoogleCalendarSummaryMarkers,
} from "./summaryMarkers.js";

describe("google calendar summary markers", () => {
  it("prefixes cancelled and reschedule markers before client name only", () => {
    expect(buildGoogleCalendarSummary("Иван Иванов", "Приём", "cancelled")).toBe(
      `${GCAL_SUMMARY_CANCELLED_PREFIX}Иван Иванов`,
    );
    expect(buildGoogleCalendarSummary("Иван Иванов", undefined, "reschedule_pending")).toBe(
      `${GCAL_SUMMARY_RESCHEDULE_PENDING_PREFIX}Иван Иванов`,
    );
  });

  it("strips existing markers idempotently", () => {
    expect(
      stripGoogleCalendarSummaryMarkers(`${GCAL_SUMMARY_CANCELLED_PREFIX}${GCAL_SUMMARY_RESCHEDULE_PENDING_PREFIX}Петр`),
    ).toBe("Петр");
    expect(buildGoogleCalendarSummary("Иван Иванов", undefined, "none", true)).toBe(
      "✅ Иван Иванов",
    );
    expect(buildGoogleCalendarSummary("Иван Иванов", undefined, "cancelled", true)).toBe(
      "❌ ✅ Иван Иванов",
    );
    expect(buildGoogleCalendarSummary(`${GCAL_SUMMARY_CANCELLED_PREFIX}Петр`, "Услуга", "none")).toBe(
      "Петр",
    );
  });
});
