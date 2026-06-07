import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isPrepaymentPending } from "./pgBookingCalendar";

const repoDir = dirname(fileURLToPath(import.meta.url));

describe("pgBookingCalendar prepayment flag", () => {
  it("marks awaiting_payment appointments", () => {
    expect(isPrepaymentPending("awaiting_payment", null)).toBe(true);
  });

  it("marks pending payment intents", () => {
    expect(isPrepaymentPending("confirmed", "pending")).toBe(true);
    expect(isPrepaymentPending("confirmed", "requires_action")).toBe(true);
  });

  it("is false for captured payments", () => {
    expect(isPrepaymentPending("paid", "succeeded")).toBe(false);
  });
});

describe("pgBookingCalendar purge filter", () => {
  it("listAppointmentsInRange post-filters staff-purged canonical rows", () => {
    const src = readFileSync(join(repoDir, "pgBookingCalendar.ts"), "utf8");
    expect(src).toContain("filterCanonicalRowsNotPurged");
    expect(src).toMatch(/visibleRows = await filterCanonicalRowsNotPurged/);
  });
});
