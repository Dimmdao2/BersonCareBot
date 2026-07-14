import { describe, expect, it } from "vitest";
import {
  buildHistoricalFallbackPayload,
  isNonConfirmedLegacyAppointment,
  phoneTail10,
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

  it("treats legacy canceled status as cleanup-eligible even when payload looks active", () => {
    expect(resolveNonConfirmedCleanupStatus({ status: "canceled", payloadJson: { status: "1" } })).toBe(
      "canceled",
    );
    expect(isNonConfirmedLegacyAppointment({ status: "canceled", payloadJson: { status: "1" } })).toBe(true);
  });
});

describe("Rubitime legacy historical owner fallback helpers", () => {
  it("normalizes owner phone to last 10 digits only", () => {
    expect(phoneTail10("+1 (234) 567-8901")).toBe("2345678901");
  });

  it("adds Rubitime branch id for historical payloads missing branch scope", () => {
    expect(buildHistoricalFallbackPayload({ source: "legacy" }, "123")).toEqual({
      source: "legacy",
      branch_id: "123",
    });
  });

  it("does not overwrite existing branch scope in historical payloads", () => {
    expect(buildHistoricalFallbackPayload({ branch_id: "existing" }, "123")).toEqual({
      branch_id: "existing",
    });
  });

  it("keeps non-object payloads safe when adding historical branch scope", () => {
    expect(buildHistoricalFallbackPayload(null, "123")).toEqual({ branch_id: "123" });
  });
});
