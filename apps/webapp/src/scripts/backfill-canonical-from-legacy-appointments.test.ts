import { describe, expect, it } from "vitest";
import {
  isNonConfirmedLegacyAppointment,
  resolveNonConfirmedCleanupStatus,
} from "../../scripts/backfill-canonical-from-legacy-appointments";

describe("Rubitime legacy non-confirmed cleanup classification", () => {
  it.each(["recorded", "in_service", "completed", "awaiting_prepayment"])(
    "keeps valid appointment status %s",
    (status) => {
      expect(
        isNonConfirmedLegacyAppointment({
          status,
          payloadJson: { rubitime_normalized_status: status },
        }),
      ).toBe(false);
    },
  );

  it.each(["canceled", "awaiting_confirmation", "in_cart", "moved_awaiting"])(
    "allows cleanup for non-confirmed status %s",
    (status) => {
      expect(
        isNonConfirmedLegacyAppointment({
          status,
          payloadJson: { rubitime_normalized_status: status },
        }),
      ).toBe(true);
    },
  );

  it("treats Rubitime moved status code as cleanup-eligible", () => {
    expect(resolveNonConfirmedCleanupStatus({ status: "updated", payloadJson: { status: "7" } })).toBe(
      "moved_awaiting",
    );
    expect(isNonConfirmedLegacyAppointment({ status: "updated", payloadJson: { status: "7" } })).toBe(true);
  });

  it("keeps ambiguous legacy updated rows without normalized status", () => {
    expect(resolveNonConfirmedCleanupStatus({ status: "updated", payloadJson: {} })).toBeNull();
    expect(isNonConfirmedLegacyAppointment({ status: "updated", payloadJson: {} })).toBe(false);
  });
});
