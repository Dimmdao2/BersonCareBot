import { describe, expect, it } from "vitest";
import {
  getPatientPrimaryNavActiveId,
  PATIENT_PRIMARY_NAV_ITEMS,
  patientNavByPlatform,
} from "@/app-layer/routes/navigation";
import { routePaths } from "@/app-layer/routes/paths";
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

  it("Запись points at merged booking hub", () => {
    expect(PATIENT_PRIMARY_NAV_ITEMS.find((i) => i.id === "booking")?.href).toBe(routePaths.bookingNew);
  });
});

describe("getPatientPrimaryNavActiveId", () => {
  it("marks plan active on /app/patient/treatment and instance subpaths", () => {
    expect(getPatientPrimaryNavActiveId("/app/patient/treatment")).toBe("plan");
    expect(getPatientPrimaryNavActiveId("/app/patient/treatment/")).toBe("plan");
    expect(getPatientPrimaryNavActiveId("/app/patient/treatment/11111111-1111-4111-8111-111111111111")).toBe(
      "plan",
    );
  });

  it("does not mark plan active on legacy /treatment-programs path (prefix collision)", () => {
    expect(getPatientPrimaryNavActiveId("/app/patient/treatment-programs")).toBe(null);
    expect(getPatientPrimaryNavActiveId("/app/patient/treatment-programs/11111111-1111-4111-8111-111111111111")).toBe(
      null,
    );
  });

  it("marks booking active on /cabinet and /booking/new", () => {
    expect(getPatientPrimaryNavActiveId(routePaths.cabinet)).toBe("booking");
    expect(getPatientPrimaryNavActiveId(routePaths.bookingNew)).toBe("booking");
  });
});
