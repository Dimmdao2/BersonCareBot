import { describe, expect, it } from "vitest";
import { normalizePhone } from "./phoneNormalize";

const expected = "+79189000782";

describe("normalizePhone (RU +7)", () => {
  it("normalizes 10-digit mobile without country code", () => {
    expect(normalizePhone("9189000782")).toBe(expected);
  });

  it("normalizes 10-digit city code format without country code", () => {
    expect(normalizePhone("4951234567")).toBe("+74951234567");
  });

  it("normalizes 11 digits starting with 8", () => {
    expect(normalizePhone("89189000782")).toBe(expected);
  });

  it("normalizes 8 with parentheses and hyphens (EXEC H.1.1)", () => {
    expect(normalizePhone("8(918)900-07-82")).toBe(expected);
  });

  it("keeps +7 with 11 digits", () => {
    expect(normalizePhone("+79189000782")).toBe(expected);
  });

  it("strips parentheses and hyphens", () => {
    expect(normalizePhone("+7(918)900-07-82")).toBe(expected);
  });

  it("normalizes 8 with spaces", () => {
    expect(normalizePhone("8 918 900 07 82")).toBe(expected);
  });

  it("strips mixed formatting for classic 8 (999) pattern", () => {
    expect(normalizePhone("8 (999) 123-45-67")).toBe("+79991234567");
  });

  it("normalizes 11 digits starting with 7 without plus", () => {
    expect(normalizePhone("79189000782")).toBe(expected);
  });

  it("normalizes trunk 8 + city code format", () => {
    expect(normalizePhone("8 (495) 123-45-67")).toBe("+74951234567");
  });

  it("normalizes toll-free 8-800 format", () => {
    expect(normalizePhone("8 800 555 35 35")).toBe("+78005553535");
  });

  it("normalizes 00 international prefix for +7", () => {
    expect(normalizePhone("007 918 900 07 82")).toBe(expected);
  });

  it("handles tab and unicode space as separators", () => {
    expect(normalizePhone("+7\u00a0918\t900-07-82")).toBe(expected);
  });

  it("returns shortest +digits for incomplete input (validated elsewhere)", () => {
    expect(normalizePhone("912")).toBe("+912");
  });

  it("treats any 10-digit local input as RU national number", () => {
    expect(normalizePhone("2025550123")).toBe("+72025550123");
  });

  it("keeps explicit international prefix as-is after cleanup", () => {
    expect(normalizePhone("+1 (202) 555-01-23")).toBe("+12025550123");
  });

  it("returns '+' for empty or symbol-only input", () => {
    expect(normalizePhone("")).toBe("+");
    expect(normalizePhone("() - +")).toBe("+");
  });
});
