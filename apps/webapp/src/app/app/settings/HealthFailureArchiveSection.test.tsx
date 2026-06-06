/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { archiveRowReasonLabel, archiveRowTypeLabel } from "./HealthFailureArchiveSection";

describe("HealthFailureArchiveSection row labels", () => {
  it("prefers queue_kind for outgoing rows", () => {
    expect(archiveRowTypeLabel({ queue_kind: "doctor_broadcast", event_type: "x" })).toBe("doctor_broadcast");
  });

  it("falls back to event_type for projection rows", () => {
    expect(archiveRowTypeLabel({ event_type: "appointment.record.upserted" })).toBe("appointment.record.upserted");
  });

  it("shows reason_ru when present", () => {
    expect(
      archiveRowReasonLabel({
        summaryJson: { reason_ru: "Таймаут" },
        rawErrorTruncated: "err",
      }),
    ).toBe("Таймаут");
  });

  it("falls back to rawErrorTruncated for projection rows", () => {
    expect(
      archiveRowReasonLabel({
        summaryJson: {},
        rawErrorTruncated: "column does not exist",
      }),
    ).toBe("column does not exist");
  });
});
