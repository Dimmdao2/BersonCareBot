import { describe, expect, it } from "vitest";
import { buildVisitLocationOptions } from "./NewVisitPanel";

describe("NewVisitPanel location options", () => {
  it("combines active branch catalog, appointment history, Online and removes duplicates", () => {
    const options = buildVisitLocationOptions(
      [
        { branchName: "Мск" },
        { location: "Домашний визит" },
        { branchName: "Закрытый филиал" },
      ],
      [
        { title: "Москва. Точка здоровья", shortTitle: "Мск", isActive: true },
        { title: "Санкт-Петербург", shortTitle: null, isActive: true },
        { title: "Закрытый филиал", shortTitle: null, isActive: false },
      ],
    );

    expect(options).toEqual([
      "Москва. Точка здоровья",
      "Мск",
      "Санкт-Петербург",
      "Домашний визит",
      "Закрытый филиал",
      "Онлайн",
    ]);
  });
});
