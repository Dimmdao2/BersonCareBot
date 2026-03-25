import { describe, expect, it } from "vitest";
import {
  countCancellations30d,
  isCountedCancellation,
  lastVisitLabelFromHistory,
} from "./appointmentStatsFromHistory";

describe("appointmentStatsFromHistory", () => {
  const nowMs = Date.parse("2025-03-25T12:00:00.000Z");

  it("isCountedCancellation matches canceled + last_event exclusion", () => {
    expect(isCountedCancellation("canceled", "event-updated")).toBe(true);
    expect(isCountedCancellation("canceled", "event-remove-record")).toBe(false);
    expect(isCountedCancellation("canceled", "event-delete-record")).toBe(false);
    expect(isCountedCancellation("created", "event-updated")).toBe(false);
  });

  it("countCancellations30d counts canceled rows in window by updatedAt", () => {
    const n = countCancellations30d(
      [
        {
          status: "canceled",
          lastEvent: "event-cancel",
          updatedAt: "2025-03-20T10:00:00.000Z",
          recordAt: null,
          label: "",
        },
        {
          status: "canceled",
          lastEvent: "event-remove-record",
          updatedAt: "2025-03-20T10:00:00.000Z",
          recordAt: null,
          label: "",
        },
        {
          status: "canceled",
          lastEvent: "event-cancel",
          updatedAt: "2025-02-01T10:00:00.000Z",
          recordAt: null,
          label: "",
        },
      ],
      nowMs
    );
    expect(n).toBe(1);
  });

  it("lastVisitLabelFromHistory picks latest past recordAt", () => {
    const label = lastVisitLabelFromHistory(
      [
        {
          status: "updated",
          lastEvent: "x",
          updatedAt: "2025-03-01T00:00:00.000Z",
          recordAt: "2025-03-10T15:00:00.000Z",
          label: "A",
        },
        {
          status: "updated",
          lastEvent: "x",
          updatedAt: "2025-03-01T00:00:00.000Z",
          recordAt: "2025-03-20T16:00:00.000Z",
          label: "B",
        },
        {
          status: "updated",
          lastEvent: "x",
          updatedAt: "2025-03-25T00:00:00.000Z",
          recordAt: "2025-03-26T10:00:00.000Z",
          label: "future",
        },
      ],
      nowMs
    );
    expect(label).toBe("B");
  });
});
