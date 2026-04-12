import { describe, expect, it } from "vitest";
import { isAppSupportPath } from "./isAppSupportPath";
import { isValidSupportContactSetting } from "./isValidSupportContactSetting";

describe("isAppSupportPath", () => {
  it("accepts /app/ prefix", () => {
    expect(isAppSupportPath("/app/patient/support")).toBe(true);
    expect(isAppSupportPath("  /app/foo  ")).toBe(true);
  });

  it("rejects other roots", () => {
    expect(isAppSupportPath("/evil")).toBe(false);
    expect(isAppSupportPath("https://x.com/app/foo")).toBe(false);
  });
});

describe("isValidSupportContactSetting", () => {
  it("allows empty, /app paths, and http(s) URLs", () => {
    expect(isValidSupportContactSetting("")).toBe(true);
    expect(isValidSupportContactSetting("  ")).toBe(true);
    expect(isValidSupportContactSetting("/app/patient/support")).toBe(true);
    expect(isValidSupportContactSetting("https://t.me/bot")).toBe(true);
  });

  it("rejects arbitrary paths", () => {
    expect(isValidSupportContactSetting("/login")).toBe(false);
    expect(isValidSupportContactSetting("//evil.com")).toBe(false);
  });
});
