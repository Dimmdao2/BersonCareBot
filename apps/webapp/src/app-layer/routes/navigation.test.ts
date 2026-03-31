import { describe, expect, it } from "vitest";
import {
  patientHomeBlocksByPlatform,
  patientHomeBlocksCanonical,
  patientHomeBlocksForEntry,
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

  it("bot has only settings icon and no sheet menu", () => {
    expect(patientNavByPlatform.bot.headerRightIcons).toEqual(["settings"]);
    expect(patientNavByPlatform.bot.hasSheetMenu).toBe(false);
    expect(patientNavByPlatform.bot.showLogout).toBe(false);
  });

  it("mobile and desktop share header icons (browser: messages, hamburger menu)", () => {
    expect(patientNavByPlatform.mobile.headerRightIcons).toEqual(["messages", "menu"]);
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
  it("canonical blocks list does not include purchases", () => {
    expect(patientHomeBlocksCanonical).not.toContain("purchases");
  });

  it("defines blocks for every platform mode", () => {
    for (const mode of modes) {
      expect(Array.isArray(patientHomeBlocksByPlatform[mode])).toBe(true);
      expect(patientHomeBlocksByPlatform[mode].length).toBeGreaterThan(0);
    }
  });

  it("bot is canonical list minus blocks hidden in mini-app (news, mailings, motivation, channels)", () => {
    expect(patientHomeBlocksByPlatform.bot).toEqual(
      patientHomeBlocksCanonical.filter((id) =>
        !["news", "mailings", "motivation", "channels"].includes(id),
      ),
    );
  });

  it("bot includes cabinet block (как на веб-главной)", () => {
    expect(patientHomeBlocksByPlatform.bot).toContain("cabinet");
  });

  it("mobile and desktop lists match canonical", () => {
    expect(patientHomeBlocksByPlatform.mobile).toEqual(patientHomeBlocksCanonical);
    expect(patientHomeBlocksByPlatform.desktop).toEqual(patientHomeBlocksCanonical);
  });

  it("patientHomeBlocksForEntry mirrors bot vs standalone", () => {
    expect(patientHomeBlocksForEntry("standalone")).toEqual(patientHomeBlocksCanonical);
    expect(patientHomeBlocksForEntry("bot")).toEqual(patientHomeBlocksByPlatform.bot);
  });
});
