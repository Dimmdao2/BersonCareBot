import { describe, expect, it } from "vitest";
import { isRecoverableWebappEmitFailure } from "./ingestErrorClassification";

describe("isRecoverableWebappEmitFailure", () => {
  it("treats 503 and network-ish (status 0) as recoverable", () => {
    expect(isRecoverableWebappEmitFailure({ ok: false, status: 503 })).toBe(true);
    expect(isRecoverableWebappEmitFailure({ ok: false, status: 0, error: "fetch failed" })).toBe(true);
  });

  it("treats 422/400-class as permanent (non-recoverable)", () => {
    expect(isRecoverableWebappEmitFailure({ ok: false, status: 422 })).toBe(false);
    expect(isRecoverableWebappEmitFailure({ ok: false, status: 400 })).toBe(false);
  });

  it("treats 5xx as recoverable", () => {
    expect(isRecoverableWebappEmitFailure({ ok: false, status: 502 })).toBe(true);
  });
});
