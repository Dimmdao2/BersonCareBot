import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { env } from "@/config/env";
import { verifyIntegratorSignature } from "./verifyIntegratorSignature";

describe("verifyIntegratorSignature", () => {
  it("returns true for valid signature", () => {
    const timestamp = "1234567890";
    const body = '{"foo":"bar"}';
    const payload = `${timestamp}.${body}`;
    const signature = createHmac("sha256", env.INTEGRATOR_SHARED_SECRET).update(payload).digest("base64url");
    expect(verifyIntegratorSignature(timestamp, body, signature)).toBe(true);
  });

  it("returns false for wrong signature", () => {
    expect(verifyIntegratorSignature("123", "body", "wrong-sig")).toBe(false);
  });

  it("returns false when timestamp/body mismatch", () => {
    const timestamp = "123";
    const body = "x";
    const signature = createHmac("sha256", env.INTEGRATOR_SHARED_SECRET).update(`${timestamp}.${body}`).digest("base64url");
    expect(verifyIntegratorSignature("124", body, signature)).toBe(false);
    expect(verifyIntegratorSignature(timestamp, "y", signature)).toBe(false);
  });
});
