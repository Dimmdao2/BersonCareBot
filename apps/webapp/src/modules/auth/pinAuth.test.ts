import { describe, expect, it } from "vitest";
import { hashPin } from "@/modules/auth/pinHash";
import { inMemoryUserPinsPort } from "@/infra/repos/inMemoryUserPins";
import { PIN_MAX_ATTEMPTS, isValidPinFormat, verifyPinForLogin } from "./pinAuth";

describe("isValidPinFormat", () => {
  it("accepts 4–6 digits", () => {
    expect(isValidPinFormat("1234")).toBe(true);
    expect(isValidPinFormat("123456")).toBe(true);
  });
  it("rejects wrong length", () => {
    expect(isValidPinFormat("123")).toBe(false);
    expect(isValidPinFormat("1234567")).toBe(false);
    expect(isValidPinFormat("12ab")).toBe(false);
  });
});

describe("verifyPinForLogin", () => {
  it("returns ok for matching PIN", async () => {
    const uid = "pin-test-user-1";
    const h = await hashPin("4242");
    await inMemoryUserPinsPort.upsertPinHash(uid, h);
    const r = await verifyPinForLogin(uid, "4242", inMemoryUserPinsPort);
    expect(r).toEqual({ ok: true });
  });

  it("returns invalid_pin and locks after max attempts", async () => {
    const uid = "pin-test-user-2";
    const h = await hashPin("9999");
    await inMemoryUserPinsPort.upsertPinHash(uid, h);
    for (let i = 0; i < PIN_MAX_ATTEMPTS - 1; i++) {
      const r = await verifyPinForLogin(uid, "0000", inMemoryUserPinsPort);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("invalid_pin");
    }
    const last = await verifyPinForLogin(uid, "0000", inMemoryUserPinsPort);
    expect(last.ok).toBe(false);
    if (!last.ok) {
      expect(last.code).toBe("locked");
      expect(last.lockedUntilIso).toBeDefined();
    }
    const locked = await verifyPinForLogin(uid, "9999", inMemoryUserPinsPort);
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.code).toBe("locked");
  });
});
