import { describe, expect, it } from "vitest";
import { encodeBase64Url, decodeBase64Url } from "./base64url";

describe("base64url", () => {
  it("encodes string to base64url (no +, /, =)", () => {
    const out = encodeBase64Url("hello");
    expect(out).not.toContain("+");
    expect(out).not.toContain("/");
    expect(out).not.toContain("=");
    expect(out).toBe("aGVsbG8");
  });

  it("round-trips", () => {
    const input = "Hello, 世界";
    expect(decodeBase64Url(encodeBase64Url(input))).toBe(input);
  });

  it("decodes padded and unpadded", () => {
    expect(decodeBase64Url("YQ")).toBe("a");
    expect(decodeBase64Url("YWE")).toBe("aa");
    expect(decodeBase64Url("YWFh")).toBe("aaa");
  });
});
