import { describe, expect, it } from "vitest";
import { buildCabinetInfoLinkTiles } from "./cabinetInfoLinkTiles";

describe("buildCabinetInfoLinkTiles", () => {
  it("includes prep and services-pricing when canonical slugs published", () => {
    const tiles = buildCabinetInfoLinkTiles(new Set(["preparation", "services-pricing"]));
    expect(tiles.map((t) => t.label)).toEqual([
      "Адрес кабинета",
      "Записаться",
      "Как подготовиться",
      "Стоимость",
      "Справка и контакты",
    ]);
    expect(tiles[2]?.href).toBe("/app/patient/help/preparation");
    expect(tiles[3]?.href).toBe("/app/patient/help/services-pricing");
  });

  it("accepts legacy cost slug until CMS republish", () => {
    const tiles = buildCabinetInfoLinkTiles(new Set(["cost"]));
    expect(tiles.map((t) => t.href)).toContain("/app/patient/help/cost");
  });

  it("omits prep/cost when articles missing", () => {
    const tiles = buildCabinetInfoLinkTiles(new Set());
    expect(tiles.map((t) => t.label)).toEqual(["Адрес кабинета", "Записаться", "Справка и контакты"]);
  });
});
