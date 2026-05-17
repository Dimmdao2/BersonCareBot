import { describe, expect, it } from "vitest";
import {
  humanizeIntegratorPushOutboxLastError,
  humanizeOutgoingDeliveryLastError,
  maskPhoneForHealthArchive,
} from "./humanizeOutgoingDeliveryLastError";

describe("humanizeOutgoingDeliveryLastError", () => {
  it("maps BAD_PAYLOAD", () => {
    const r = humanizeOutgoingDeliveryLastError("BAD_PAYLOAD");
    expect(r.reason_code).toBe("BAD_PAYLOAD");
    expect(r.reason_ru).toContain("payload");
  });

  it("maps missing broadcast audit id", () => {
    const r = humanizeOutgoingDeliveryLastError("prefix MISSING_BROADCAST_AUDIT_ID suffix");
    expect(r.reason_code).toBe("MISSING_BROADCAST_AUDIT_ID");
  });

  it("handles empty last error", () => {
    const r = humanizeOutgoingDeliveryLastError(null);
    expect(r.reason_code).toBe("unknown_delivery_error");
  });

  it("extracts http status", () => {
    const r = humanizeOutgoingDeliveryLastError("dispatch failed HTTP 502 gateway");
    expect(r.reason_code).toBe("http_502");
  });
});

describe("humanizeIntegratorPushOutboxLastError", () => {
  it("returns generic when empty", () => {
    const r = humanizeIntegratorPushOutboxLastError("");
    expect(r.reason_ru.length).toBeGreaterThan(3);
  });
});

describe("maskPhoneForHealthArchive", () => {
  it("masks e164", () => {
    expect(maskPhoneForHealthArchive("+79991234567")).toBe("+•••4567");
  });
});
