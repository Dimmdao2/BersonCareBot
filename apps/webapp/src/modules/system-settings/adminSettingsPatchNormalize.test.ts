import { describe, expect, it } from "vitest";
import { normalizeModesFormBatchItems, normalizeModesFormPatchItem } from "./adminSettingsPatchNormalize";

describe("normalizeModesFormPatchItem", () => {
  it("normalizes patient_booking_url empty string", () => {
    const r = normalizeModesFormPatchItem("patient_booking_url", { value: "" });
    expect(r).toEqual({ ok: true, valueJson: { value: "" } });
  });

  it("rejects patient_booking_url ftp", () => {
    expect(normalizeModesFormPatchItem("patient_booking_url", { value: "ftp://x" })).toEqual({ ok: false });
  });

  it("rejects maintenance message over 500 chars", () => {
    const r = normalizeModesFormPatchItem("patient_app_maintenance_message", { value: "x".repeat(501) });
    expect(r).toEqual({ ok: false });
  });

  it("passes dev_mode through", () => {
    const r = normalizeModesFormPatchItem("dev_mode", { value: true });
    expect(r).toEqual({ ok: true, valueJson: { value: true } });
  });
});

describe("normalizeModesFormBatchItems", () => {
  it("returns atIndex on first invalid item", () => {
    const r = normalizeModesFormBatchItems([
      { key: "dev_mode", value: { value: false } },
      { key: "integrator_linked_phone_source", value: { value: "nope" } },
    ]);
    expect(r).toEqual({ ok: false, atIndex: 1, key: "integrator_linked_phone_source" });
  });
});
