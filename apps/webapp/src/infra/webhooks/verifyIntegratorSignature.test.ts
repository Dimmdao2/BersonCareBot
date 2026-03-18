import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { integratorWebhookSecret } from "@/config/env";
import { verifyIntegratorSignature, verifyIntegratorGetSignature } from "./verifyIntegratorSignature";

describe("verifyIntegratorSignature", () => {
  it("returns true for valid signature", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = '{"foo":"bar"}';
    const payload = `${timestamp}.${body}`;
    const signature = createHmac("sha256", integratorWebhookSecret()).update(payload).digest("base64url");
    expect(verifyIntegratorSignature(timestamp, body, signature)).toBe(true);
  });

  it("returns false for wrong signature", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    expect(verifyIntegratorSignature(timestamp, "body", "wrong-sig")).toBe(false);
  });

  it("returns false when timestamp/body mismatch", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = "x";
    const signature = createHmac("sha256", integratorWebhookSecret()).update(`${timestamp}.${body}`).digest("base64url");
    expect(verifyIntegratorSignature(String(Number(timestamp) + 1), body, signature)).toBe(false);
    expect(verifyIntegratorSignature(timestamp, "y", signature)).toBe(false);
  });

  it("returns false for stale timestamp outside window", () => {
    const now = Math.floor(Date.now() / 1000);
    const oldTimestamp = String(now - 400);
    const body = "{}";
    const payload = `${oldTimestamp}.${body}`;
    const signature = createHmac("sha256", integratorWebhookSecret()).update(payload).digest("base64url");
    expect(verifyIntegratorSignature(oldTimestamp, body, signature)).toBe(false);
  });

  it("returns true for timestamp within window", () => {
    const now = Math.floor(Date.now() / 1000);
    const recentTimestamp = String(now - 60);
    const body = "{}";
    const payload = `${recentTimestamp}.${body}`;
    const signature = createHmac("sha256", integratorWebhookSecret()).update(payload).digest("base64url");
    expect(verifyIntegratorSignature(recentTimestamp, body, signature)).toBe(true);
  });
});

describe("verifyIntegratorGetSignature", () => {
  it("returns true for valid GET signature", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const canonicalGet = "GET /api/integrator/diary/symptom-trackings?userId=u1";
    const payload = `${timestamp}.${canonicalGet}`;
    const signature = createHmac("sha256", integratorWebhookSecret()).update(payload).digest("base64url");
    expect(verifyIntegratorGetSignature(timestamp, canonicalGet, signature)).toBe(true);
  });

  it("returns false for wrong signature", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const canonicalGet = "GET /api/integrator/diary/lfk-complexes?userId=u2";
    expect(verifyIntegratorGetSignature(timestamp, canonicalGet, "wrong-sig")).toBe(false);
  });

  it("returns false when canonical string mismatch", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const canonicalGet = "GET /api/integrator/diary/symptom-trackings?userId=u1";
    const signature = createHmac("sha256", integratorWebhookSecret())
      .update(`${timestamp}.${canonicalGet}`)
      .digest("base64url");
    expect(verifyIntegratorGetSignature(timestamp, "GET /other?userId=u1", signature)).toBe(false);
  });
});
