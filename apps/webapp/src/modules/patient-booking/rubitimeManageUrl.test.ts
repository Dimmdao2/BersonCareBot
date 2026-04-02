import { describe, expect, it } from "vitest";
import { extractRubitimeManageUrlFromIntegratorCreateRaw } from "./rubitimeManageUrl";

describe("extractRubitimeManageUrlFromIntegratorCreateRaw", () => {
  it("reads url from nested data", () => {
    expect(
      extractRubitimeManageUrlFromIntegratorCreateRaw({
        ok: true,
        data: { id: 1, url: "https://rubitime.ru/record/1" },
      }),
    ).toBe("https://rubitime.ru/record/1");
  });

  it("returns null when no https link", () => {
    expect(extractRubitimeManageUrlFromIntegratorCreateRaw({ ok: true, data: {} })).toBeNull();
  });
});
