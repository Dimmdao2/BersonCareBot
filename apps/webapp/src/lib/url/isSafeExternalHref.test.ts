import { describe, expect, it } from "vitest";
import { isSafeExternalHref } from "./isSafeExternalHref";

describe("isSafeExternalHref", () => {
  it("allows http(s)", () => {
    expect(isSafeExternalHref("https://example.com/x")).toBe(true);
    expect(isSafeExternalHref("http://localhost:3000")).toBe(true);
  });

  it("rejects javascript and data", () => {
    expect(isSafeExternalHref("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalHref("data:text/html,base64")).toBe(false);
  });
});
