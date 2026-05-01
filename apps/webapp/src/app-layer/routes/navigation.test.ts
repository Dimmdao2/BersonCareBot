import { describe, expect, it } from "vitest";
import { PATIENT_PRIMARY_NAV_ITEMS, patientNavByPlatform } from "@/app-layer/routes/navigation";
import type { PlatformMode } from "@/shared/lib/platform";

const modes: PlatformMode[] = ["bot", "mobile", "desktop"];

describe("patientNavByPlatform", () => {
  it("defines config for every platform mode", () => {
    for (const mode of modes) {
      const cfg = patientNavByPlatform[mode];
      expect(cfg).toBeDefined();
      expect(Array.isArray(cfg.headerRightIcons)).toBe(true);
      expect(typeof cfg.hasSheetMenu).toBe("boolean");
      expect(typeof cfg.showLogout).toBe("boolean");
    }
  });

  it("bot has only profile icon and no sheet menu", () => {
    expect(patientNavByPlatform.bot.headerRightIcons).toEqual(["profile"]);
    expect(patientNavByPlatform.bot.hasSheetMenu).toBe(false);
    expect(patientNavByPlatform.bot.showLogout).toBe(false);
  });

  it("mobile and desktop match bot header (profile only, no sheet menu)", () => {
    expect(patientNavByPlatform.mobile).toEqual(patientNavByPlatform.bot);
    expect(patientNavByPlatform.desktop).toEqual(patientNavByPlatform.bot);
  });

});

describe("PATIENT_PRIMARY_NAV_ITEMS", () => {
  it("lists Сегодня, Запись, Дневник, План, Профиль in order (без разминок)", () => {
    expect(PATIENT_PRIMARY_NAV_ITEMS.map((i) => i.label)).toEqual([
      "Сегодня",
      "Запись",
      "Дневник",
      "План",
      "Профиль",
    ]);
  });
});
