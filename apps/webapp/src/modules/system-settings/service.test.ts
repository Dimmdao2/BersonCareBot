import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSystemSettingsService } from "./service";
import type { SystemSettingsPort, SystemSettingsUpsertRow } from "./ports";
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
    upsertManyInTransaction: vi.fn().mockImplementation(async (rows: SystemSettingsUpsertRow[]) =>
      rows.map((r: SystemSettingsUpsertRow) => ({
        key: r.key,
        scope: r.scope,
        valueJson: r.valueJson,
        updatedAt: new Date().toISOString(),
        updatedBy: r.updatedBy,
      }))
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

  it("persistAdminModesBatch — upsertManyInTransaction и sync по каждому ключу", async () => {
    const upsertManyInTransaction = vi.fn().mockResolvedValue([
      { key: "dev_mode", scope: "admin", valueJson: { value: false }, updatedAt: "", updatedBy: "u1" },
      { key: "debug_forward_to_admin", scope: "admin", valueJson: { value: true }, updatedAt: "", updatedBy: "u1" },
    ]);
    const port = makePort({ upsertManyInTransaction });
    const service = createSystemSettingsService(port);
    await service.persistAdminModesBatch(
      [
        { key: "dev_mode", valueJson: { value: false } },
        { key: "debug_forward_to_admin", valueJson: { value: true } },
      ],
      "u1",
    );
    expect(upsertManyInTransaction).toHaveBeenCalledWith([
      { key: "dev_mode", scope: "admin", valueJson: { value: false }, updatedBy: "u1" },
      { key: "debug_forward_to_admin", scope: "admin", valueJson: { value: true }, updatedBy: "u1" },
    ]);
    expect(syncSettingToIntegratorMock).toHaveBeenCalledTimes(2);
  });

  it("shouldDispatchRelayToRecipient — dev_mode false → true для любого recipient", async () => {
    const port = makePort({
      getByKey: vi.fn().mockImplementation(async (key) => {
        if (key === "dev_mode")
          return { key: "dev_mode", scope: "admin", valueJson: { value: false }, updatedAt: "", updatedBy: null };
        return null;
      }),
    });
    const service = createSystemSettingsService(port);
    expect(await service.shouldDispatchRelayToRecipient({ channel: "telegram", recipient: "999" })).toBe(true);
  });

  it("shouldDispatchRelayToRecipient — dev_mode true, telegram recipient в списке → true", async () => {
    const port = makePort({
      getByKey: vi.fn().mockImplementation(async (key) => {
        if (key === "dev_mode")
          return { key: "dev_mode", scope: "admin", valueJson: { value: true }, updatedAt: "", updatedBy: null };
        if (key === "test_account_identifiers")
          return {
            key: "test_account_identifiers",
            scope: "admin",
            valueJson: { value: { phones: [], telegramIds: ["111"], maxIds: [] } },
            updatedAt: "",
            updatedBy: null,
          };
        return null;
      }),
    });
    const service = createSystemSettingsService(port);
    expect(await service.shouldDispatchRelayToRecipient({ channel: "telegram", recipient: "111" })).toBe(true);
  });

  it("shouldDispatchRelayToRecipient — dev_mode true, test_account_identifiers отсутствует → false", async () => {
    const port = makePort({
      getByKey: vi.fn().mockImplementation(async (key) => {
        if (key === "dev_mode")
          return { key: "dev_mode", scope: "admin", valueJson: { value: true }, updatedAt: "", updatedBy: null };
        return null;
      }),
    });
    const service = createSystemSettingsService(port);
    expect(await service.shouldDispatchRelayToRecipient({ channel: "telegram", recipient: "any" })).toBe(false);
  });

  it("shouldDispatchRelayToRecipient — dev_mode true, recipient не в списке → false", async () => {
    const port = makePort({
      getByKey: vi.fn().mockImplementation(async (key) => {
        if (key === "dev_mode")
          return { key: "dev_mode", scope: "admin", valueJson: { value: true }, updatedAt: "", updatedBy: null };
        if (key === "test_account_identifiers")
          return {
            key: "test_account_identifiers",
            scope: "admin",
            valueJson: { value: { phones: [], telegramIds: ["111"], maxIds: [] } },
            updatedAt: "",
            updatedBy: null,
          };
        return null;
      }),
    });
    const service = createSystemSettingsService(port);
    expect(await service.shouldDispatchRelayToRecipient({ channel: "telegram", recipient: "222" })).toBe(false);
  });

  it("shouldDispatchRelayToRecipient — dev_mode true, max recipient в списке → true", async () => {
    const port = makePort({
      getByKey: vi.fn().mockImplementation(async (key) => {
        if (key === "dev_mode")
          return { key: "dev_mode", scope: "admin", valueJson: { value: true }, updatedAt: "", updatedBy: null };
        if (key === "test_account_identifiers")
          return {
            key: "test_account_identifiers",
            scope: "admin",
            valueJson: { value: { phones: [], telegramIds: [], maxIds: ["m1"] } },
            updatedAt: "",
            updatedBy: null,
          };
        return null;
      }),
    });
    const service = createSystemSettingsService(port);
    expect(await service.shouldDispatchRelayToRecipient({ channel: "max", recipient: "m1" })).toBe(true);
  });

  it("isTestPatientSession — совпадение по телефону", async () => {
    const port = makePort({
      getByKey: vi.fn().mockImplementation(async (key) => {
        if (key === "test_account_identifiers")
          return {
            key: "test_account_identifiers",
            scope: "admin",
            valueJson: { value: { phones: ["+79990000001"], telegramIds: [], maxIds: [] } },
            updatedAt: "",
            updatedBy: null,
          };
        return null;
      }),
    });
    const service = createSystemSettingsService(port);
    expect(await service.isTestPatientSession({ phone: "+7 999 000 00 01" })).toBe(true);
  });

  it("isTestPatientSession — ключ отсутствует → false", async () => {
    const port = makePort({ getByKey: vi.fn().mockResolvedValue(null) });
    const service = createSystemSettingsService(port);
    expect(await service.isTestPatientSession({ phone: "+79990000001" })).toBe(false);
  });
});
