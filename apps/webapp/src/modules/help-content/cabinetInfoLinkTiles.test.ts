import { describe, expect, it } from "vitest";
import { buildCabinetInfoLinkTiles } from "./cabinetInfoLinkTiles";

describe("buildCabinetInfoLinkTiles", () => {
  it("includes prep and cost when canonical slugs published", () => {
    const tiles = buildCabinetInfoLinkTiles(new Set(["preparation", "cost"]));
    expect(tiles.map((t) => t.label)).toEqual([
      "Адрес кабинета",
      "Записаться",
      "Как подготовиться",
      "Стоимость",
      "Справка и контакты",
    ]);
    expect(tiles[2]?.href).toBe("/app/patient/help/preparation");
  });

  it("omits prep/cost when articles missing", () => {
    const tiles = buildCabinetInfoLinkTiles(new Set());
    expect(tiles.map((t) => t.label)).toEqual(["Адрес кабинета", "Записаться", "Справка и контакты"]);
  });
});
