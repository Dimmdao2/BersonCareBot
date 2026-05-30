import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SystemSetting } from "@/modules/system-settings/types";
import {
  isOperationalVerboseLogEnabled,
  resetOperationalVerboseLogCacheForTests,
} from "./operationalVerboseLog";

function depsWithGetSetting(getSetting: ReturnType<typeof vi.fn>) {
  return { systemSettings: { getSetting } } as unknown as {
    systemSettings: {
      getSetting(key: "debug_forward_to_admin", scope: "admin"): Promise<SystemSetting | null>;
    };
  };
}

function settingRow(valueJson: unknown): SystemSetting {
  return {
    key: "debug_forward_to_admin",
    scope: "admin",
    valueJson,
    updatedAt: "",
    updatedBy: null,
  };
}

describe("isOperationalVerboseLogEnabled", () => {
  beforeEach(() => {
    resetOperationalVerboseLogCacheForTests();
  });

  it("defaults to false when row is missing", async () => {
    const getSetting = vi.fn().mockResolvedValue(null);
    expect(await isOperationalVerboseLogEnabled(depsWithGetSetting(getSetting))).toBe(false);
  });

  it("is true for { value: true } and { value: 'true' }", async () => {
    const getSettingTrue = vi.fn().mockResolvedValue(settingRow({ value: true }));
    expect(await isOperationalVerboseLogEnabled(depsWithGetSetting(getSettingTrue))).toBe(true);
    resetOperationalVerboseLogCacheForTests();
    const getSettingStr = vi.fn().mockResolvedValue(settingRow({ value: "true" }));
    expect(await isOperationalVerboseLogEnabled(depsWithGetSetting(getSettingStr))).toBe(true);
  });

  it("is false for { value: false }", async () => {
    const getSetting = vi.fn().mockResolvedValue(settingRow({ value: false }));
    expect(await isOperationalVerboseLogEnabled(depsWithGetSetting(getSetting))).toBe(false);
  });

  it("caches within TTL (second call does not re-read)", async () => {
    const getSetting = vi.fn().mockResolvedValue(settingRow({ value: true }));
    expect(await isOperationalVerboseLogEnabled(depsWithGetSetting(getSetting))).toBe(true);
    expect(await isOperationalVerboseLogEnabled(depsWithGetSetting(getSetting))).toBe(true);
    expect(getSetting).toHaveBeenCalledTimes(1);
  });

  it("fails safe to false when getSetting throws", async () => {
    const getSetting = vi.fn().mockRejectedValue(new Error("db down"));
    expect(await isOperationalVerboseLogEnabled(depsWithGetSetting(getSetting))).toBe(false);
  });
});
