import { describe, expect, it } from "vitest";
import { normalizeClientNameForCompare, rubitimeNameIfDifferent } from "./appointmentRubitimeNameMismatch";

describe("normalizeClientNameForCompare", () => {
  it("returns null for null/undefined/blank", () => {
    expect(normalizeClientNameForCompare(null)).toBeNull();
    expect(normalizeClientNameForCompare(undefined)).toBeNull();
    expect(normalizeClientNameForCompare("")).toBeNull();
    expect(normalizeClientNameForCompare("   ")).toBeNull();
  });

  it("trims and collapses internal whitespace", () => {
    expect(normalizeClientNameForCompare("  Иван  ")).toBe("Иван");
    expect(normalizeClientNameForCompare("Иван\t Петров")).toBe("Иван Петров");
  });
});

describe("rubitimeNameIfDifferent", () => {
  it("returns null when equal after normalization", () => {
    expect(rubitimeNameIfDifferent("Иван", "  Иван  ")).toBeNull();
    expect(rubitimeNameIfDifferent("Иван Петров", "Иван  Петров")).toBeNull();
  });

  it("returns trimmed Rubitime name when profile differs", () => {
    expect(rubitimeNameIfDifferent("Иван", "Пётр")).toBe("Пётр");
    expect(rubitimeNameIfDifferent("Иван", "  Пётр  ")).toBe("Пётр");
  });

  it("returns null when profile is empty but Rubitime has name (no duplicate line)", () => {
    expect(rubitimeNameIfDifferent(null, "Иван")).toBeNull();
    expect(rubitimeNameIfDifferent("", "Иван")).toBeNull();
    expect(rubitimeNameIfDifferent("   ", "Иван")).toBeNull();
  });

  it("returns null when Rubitime name missing", () => {
    expect(rubitimeNameIfDifferent("Иван", null)).toBeNull();
    expect(rubitimeNameIfDifferent("Иван", "")).toBeNull();
  });

  it("returns null when only one side normalizes (edge)", () => {
    expect(rubitimeNameIfDifferent("Иван", "   ")).toBeNull();
  });
});
