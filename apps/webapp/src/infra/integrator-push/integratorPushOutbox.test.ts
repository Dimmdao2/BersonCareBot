import { describe, expect, it } from "vitest";
import { isRecoverableIntegratorPushFailure } from "./integratorPushOutbox";

describe("isRecoverableIntegratorPushFailure", () => {
  it("treats 5xx and network-style messages as recoverable", () => {
    expect(isRecoverableIntegratorPushFailure(new Error("integrator settings/sync 503: x"))).toBe(true);
    expect(isRecoverableIntegratorPushFailure(new Error("integrator_m2m_unconfigured"))).toBe(true);
    expect(isRecoverableIntegratorPushFailure(new Error("fetch failed"))).toBe(true);
  });

  it("treats 4xx (except 408/429) as non-recoverable", () => {
    expect(isRecoverableIntegratorPushFailure(new Error("integrator reminders/rules 400: bad"))).toBe(false);
    expect(isRecoverableIntegratorPushFailure(new Error("integrator reminders/rules 408: timeout"))).toBe(true);
    expect(isRecoverableIntegratorPushFailure(new Error("integrator reminders/rules 429: rate"))).toBe(true);
  });
});
