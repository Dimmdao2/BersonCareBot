import { describe, expect, it } from "vitest";
import { normalizeContactValue } from "./normalizeContactValue";

describe("normalizeContactValue", () => {
  it("normalizes RU phone and whatsapp to E.164", () => {
    expect(normalizeContactValue("phone", "8 (900) 123-45-67")).toBe("+79001234567");
    expect(normalizeContactValue("whatsapp", "89001234567")).toBe("+79001234567");
  });

  it("normalizes email case-insensitively", () => {
    expect(normalizeContactValue("email", "  User@Example.COM ")).toBe("user@example.com");
  });

  it("normalizes messenger handles as opaque lowercase", () => {
    expect(normalizeContactValue("telegram", " @MyHandle ")).toBe("@myhandle");
  });

  it("returns null for blank input", () => {
    expect(normalizeContactValue("phone", "   ")).toBeNull();
  });

  it("returns null for invalid phone input", () => {
    expect(normalizeContactValue("phone", "abc")).toBeNull();
    expect(normalizeContactValue("whatsapp", "123")).toBeNull();
  });

  it("returns null for invalid email", () => {
    expect(normalizeContactValue("email", "not-an-email")).toBeNull();
  });
});
