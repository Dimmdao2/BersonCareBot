import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSystemSettingsService } from "./service";
import type { SystemSettingsPort } from "./ports";
import type { SystemSetting } from "./types";

const syncSettingToIntegratorMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("./syncToIntegrator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./syncToIntegrator")>();
  return {
    ...actual,
    syncSettingToIntegrator: syncSettingToIntegratorMock,
  };
});

function makePort(overrides: Partial<SystemSettingsPort> = {}): SystemSettingsPort {
  return {
    getByKey: vi.fn().mockResolvedValue(null),
    getByScope: vi.fn().mockResolvedValue([]),
    upsert: vi.fn().mockImplementation(
      async (key, scope, valueJson, updatedBy): Promise<SystemSetting> => ({
        key,
        scope,
        valueJson,
        updatedAt: new Date().toISOString(),
        updatedBy,
      })
    ),
    ...overrides,
  };
}

describe("SystemSettingsService", () => {
  beforeEach(() => {
    syncSettingToIntegratorMock.mockClear();
  });

  it("updateSetting — unknown key → ошибка", async () => {
    const service = createSystemSettingsService(makePort());
    await expect(service.updateSetting("unknown_key", "admin", true, null)).rejects.toThrow(
      "unknown_setting_key"
    );
  });

  it("updateSetting — valid key → success", async () => {
    const port = makePort();
    const service = createSystemSettingsService(port);
    const result = await service.updateSetting("dev_mode", "admin", false, "user-uuid");
    expect(result.key).toBe("dev_mode");
    expect(port.upsert).toHaveBeenCalledWith("dev_mode", "admin", false, "user-uuid");
  });

  it("updateSetting — вызывает syncSettingToIntegrator после upsert", async () => {
    const port = makePort();
    const service = createSystemSettingsService(port);
    await service.updateSetting("dev_mode", "admin", { value: true }, "user-uuid");
    expect(syncSettingToIntegratorMock).toHaveBeenCalledTimes(1);
    expect(syncSettingToIntegratorMock).toHaveBeenCalledWith({
      key: "dev_mode",
      scope: "admin",
      valueJson: { value: true },
      updatedBy: "user-uuid",
    });
  });

  it("shouldDispatch — dev_mode false → true для всех", async () => {
    const port = makePort({
      getByKey: vi.fn().mockImplementation(async (key) => {
        if (key === "dev_mode")
          return { key: "dev_mode", scope: "admin", valueJson: { value: false }, updatedAt: "", updatedBy: null };
        return null;
      }),
    });
    const service = createSystemSettingsService(port);
    expect(await service.shouldDispatch("any-user")).toBe(true);
  });

  it("shouldDispatch — dev_mode true, userId в списке → true", async () => {
    const port = makePort({
      getByKey: vi.fn().mockImplementation(async (key) => {
        if (key === "dev_mode")
          return { key: "dev_mode", scope: "admin", valueJson: { value: true }, updatedAt: "", updatedBy: null };
        if (key === "integration_test_ids")
          return {
            key: "integration_test_ids",
            scope: "admin",
            valueJson: { value: ["test-user-1", "test-user-2"] },
            updatedAt: "",
            updatedBy: null,
          };
        return null;
      }),
    });
    const service = createSystemSettingsService(port);
    expect(await service.shouldDispatch("test-user-1")).toBe(true);
  });

  it("shouldDispatch — dev_mode true, integration_test_ids отсутствует → false", async () => {
    const port = makePort({
      getByKey: vi.fn().mockImplementation(async (key) => {
        if (key === "dev_mode")
          return { key: "dev_mode", scope: "admin", valueJson: { value: true }, updatedAt: "", updatedBy: null };
        return null; // integration_test_ids отсутствует
      }),
    });
    const service = createSystemSettingsService(port);
    expect(await service.shouldDispatch("any-user")).toBe(false);
  });

  it("shouldDispatch — dev_mode true, userId не в списке → false", async () => {
    const port = makePort({
      getByKey: vi.fn().mockImplementation(async (key) => {
        if (key === "dev_mode")
          return { key: "dev_mode", scope: "admin", valueJson: { value: true }, updatedAt: "", updatedBy: null };
        if (key === "integration_test_ids")
          return {
            key: "integration_test_ids",
            scope: "admin",
            valueJson: { value: ["test-user-1"] },
            updatedAt: "",
            updatedBy: null,
          };
        return null;
      }),
    });
    const service = createSystemSettingsService(port);
    expect(await service.shouldDispatch("other-user")).toBe(false);
  });
});
