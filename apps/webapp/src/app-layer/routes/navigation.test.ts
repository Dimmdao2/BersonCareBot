import { describe, expect, it } from "vitest";
import {
  patientHomeBlocksByPlatform,
  patientNavByPlatform,
} from "@/app-layer/routes/navigation";
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
      expect(typeof cfg.showInstallPrompt).toBe("boolean");
    }
  });

  it("bot has help then settings, no sheet menu", () => {
    expect(patientNavByPlatform.bot.headerRightIcons).toEqual(["help", "settings"]);
    expect(patientNavByPlatform.bot.hasSheetMenu).toBe(false);
    expect(patientNavByPlatform.bot.showLogout).toBe(false);
  });

  it("mobile and desktop share header icons (browser: messages, help, hamburger menu)", () => {
    expect(patientNavByPlatform.mobile.headerRightIcons).toEqual([
      "messages",
      "help",
      "menu",
    ]);
    expect(patientNavByPlatform.desktop.headerRightIcons).toEqual(
      patientNavByPlatform.mobile.headerRightIcons,
    );
  });

  it("desktop hides install prompt vs mobile", () => {
    expect(patientNavByPlatform.mobile.showInstallPrompt).toBe(true);
    expect(patientNavByPlatform.desktop.showInstallPrompt).toBe(false);
  });
});

describe("patientHomeBlocksByPlatform", () => {
  it("defines blocks for every platform mode", () => {
    for (const mode of modes) {
      expect(Array.isArray(patientHomeBlocksByPlatform[mode])).toBe(true);
      expect(patientHomeBlocksByPlatform[mode].length).toBeGreaterThan(0);
    }
  });

  it("bot shows cabinet, materials, assistant, purchases, lfk-complexes, patient-card", () => {
    expect(patientHomeBlocksByPlatform.bot).toEqual([
      "cabinet",
      "materials",
      "assistant",
      "purchases",
      "lfk-complexes",
      "patient-card",
    ]);
  });

  it("bot includes cabinet block (diary + records) to compensate for missing reply keyboard in Max", () => {
    expect(patientHomeBlocksByPlatform.bot).toContain("cabinet");
  });

  it("mobile and desktop lists match", () => {
    expect(patientHomeBlocksByPlatform.mobile).toEqual(
      patientHomeBlocksByPlatform.desktop,
    );
  });
});
