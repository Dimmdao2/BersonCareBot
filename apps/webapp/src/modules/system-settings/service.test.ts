import { describe, it, expect, vi, beforeEach } from "vitest";
import { createBoundedRuntimeReadTelemetry, createSystemSettingsService } from "./service";
import type {
  RuntimeReadTelemetry,
  RuntimeSettingsRepository,
  RuntimeWrite,
  SettingsWriteUnitOfWork,
  SystemSettingsPort,
  SystemSettingsUpsertRow,
} from "./ports";
import type { SystemSetting } from "./types";
import { SystemSettingsOrgContextRequiredError } from "./orgScopedKeys";

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
    getWebPushVapidPublicKeyOnly: vi.fn().mockResolvedValue(null),
    isCurrentPatientTestAccount: vi.fn().mockResolvedValue(false),
    upsert: vi.fn().mockImplementation(
      async (key, scope, valueJson, updatedBy, options): Promise<SystemSetting> => ({
        key,
        scope,
        organizationId: options?.organizationId ?? null,
        valueJson,
        updatedAt: new Date().toISOString(),
        updatedBy,
      })
    ),
    upsertManyInTransaction: vi.fn().mockImplementation(async (rows: SystemSettingsUpsertRow[]) =>
      rows.map((r: SystemSettingsUpsertRow) => ({
        key: r.key,
        scope: r.scope,
        organizationId: r.organizationId ?? null,
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
    expect(port.upsert).toHaveBeenCalledWith("dev_mode", "admin", false, "user-uuid", { organizationId: null });
  });

  it("updateSetting — вызывает syncSettingToIntegrator после upsert", async () => {
    const port = makePort();
    const service = createSystemSettingsService(port);
    await service.updateSetting("dev_mode", "admin", { value: true }, "user-uuid");
    expect(syncSettingToIntegratorMock).toHaveBeenCalledTimes(1);
    expect(syncSettingToIntegratorMock).toHaveBeenCalledWith({
      key: "dev_mode",
      scope: "admin",
      organizationId: null,
      valueJson: { value: true },
      updatedBy: "user-uuid",
    });
  });

  it("routes a runtime setting through the committed write UoW before compatibility sync", async () => {
    const events: string[] = [];
    const writeUnitOfWork: SettingsWriteUnitOfWork = {
      write: vi.fn(async (input): Promise<SystemSetting[]> => {
        events.push("commit");
        expect(input.authoritativeRuntimeRows).toEqual([{
          key: "patient_program_discussion_ui_enabled", scope: "admin", organizationId: null,
          audience: "authenticated_client", valueJson: { value: true }, updatedBy: "u1",
        }]);
        return [{
          key: "patient_program_discussion_ui_enabled", scope: "admin", organizationId: null,
          valueJson: { value: true }, updatedAt: "", updatedBy: "u1",
        }];
      }),
    };
    syncSettingToIntegratorMock.mockImplementation(async () => { events.push("sync"); });
    const service = createSystemSettingsService(makePort(), { writeUnitOfWork });
    await service.updateSetting("patient_program_discussion_ui_enabled", "admin", { value: true }, "u1");
    expect(events).toEqual(["commit", "sync"]);
  });

  it("uses the dual-write compare-and-swap boundary and syncs only a committed result", async () => {
    const compareAndSwap = vi.fn(async (input: {
      legacyRow: SystemSettingsUpsertRow;
      authoritativeRuntimeRows: RuntimeWrite[];
      expectedUpdatedAt: string | null;
    }): Promise<SystemSetting | null> => ({
      key: input.legacyRow.key,
      scope: input.legacyRow.scope,
      organizationId: input.legacyRow.organizationId ?? null,
      valueJson: input.legacyRow.valueJson,
      updatedAt: "2026-07-21T11:00:00.000Z",
      updatedBy: input.legacyRow.updatedBy,
    }));
    const writeUnitOfWork: SettingsWriteUnitOfWork = {
      write: vi.fn(),
      compareAndSwap,
    };
    const service = createSystemSettingsService(makePort(), { writeUnitOfWork });
    const result = await service.updateSettingIfUnchanged(
      "notif_template:created:patient",
      "admin",
      { value: "safe" },
      "owner-a",
      "2026-07-21T10:00:00.000Z",
      { organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    );
    expect(result?.updatedAt).toBe("2026-07-21T11:00:00.000Z");
    expect(compareAndSwap).toHaveBeenCalledWith(expect.objectContaining({
      expectedUpdatedAt: "2026-07-21T10:00:00.000Z",
      authoritativeRuntimeRows: [expect.objectContaining({
        key: "notif_template:created:patient",
        organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      })],
    }));
    expect(syncSettingToIntegratorMock).toHaveBeenCalledTimes(1);

    compareAndSwap.mockResolvedValueOnce(null);
    syncSettingToIntegratorMock.mockClear();
    await expect(service.updateSettingIfUnchanged(
      "notif_template:created:patient",
      "admin",
      { value: "stale" },
      "owner-b",
      "2026-07-21T10:00:00.000Z",
      { organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    )).resolves.toBeNull();
    expect(syncSettingToIntegratorMock).not.toHaveBeenCalled();
  });

  it("keeps mixed payment credentials legacy-authoritative for the trigger-owned projection", async () => {
    const writeUnitOfWork: SettingsWriteUnitOfWork = {
      write: vi.fn(async (input): Promise<SystemSetting[]> => {
        expect(input.authoritativeRuntimeRows).toEqual([]);
        return [{ key: "booking_payment_providers", scope: "admin", organizationId: "org-1", valueJson: input.legacyRows[0]!.valueJson, updatedAt: "", updatedBy: "u1" }];
      }),
    };
    const service = createSystemSettingsService(makePort(), { writeUnitOfWork });
    await service.updateSetting("booking_payment_providers", "admin", {
      value: { enabled: true, defaultProviderId: "p", providers: [{ id: "p", label: "P", enabled: true, apiKey: "private-token" }] },
    }, "u1", { organizationId: "org-1" });
  });

  it("emits only bounded PII-free key/source/count telemetry", () => {
    const emit = vi.fn();
    const telemetry = createBoundedRuntimeReadTelemetry({ maxEntries: 1, emitEvery: 3, emit });
    telemetry.record({ key: "patient_program_discussion_ui_enabled", source: "runtime" });
    telemetry.record({ key: "patient_program_discussion_ui_enabled", source: "runtime" });
    telemetry.record({ key: "patient_program_discussion_ui_enabled", source: "runtime" });
    telemetry.record({ key: "booking_payment_enabled", source: "legacy_fallback" });

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit.mock.calls).toEqual([
      [{ key: "patient_program_discussion_ui_enabled", source: "runtime", count: 1 }],
      [{ key: "patient_program_discussion_ui_enabled", source: "runtime", count: 3 }],
    ]);
    for (const [event] of emit.mock.calls) {
      expect(Object.keys(event as object).sort()).toEqual(["count", "key", "source"]);
    }
  });

  it("reads runtime first, falls back only when absent, and records bounded value-free telemetry", async () => {
    const telemetry: RuntimeReadTelemetry = { record: vi.fn() };
    const runtimeRepository: RuntimeSettingsRepository = {
      getSnapshotRows: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
      getEffective: vi.fn()
        .mockResolvedValueOnce({ key: "patient_program_discussion_ui_enabled", scope: "admin", organizationId: null, audience: "authenticated_client", valueJson: { value: true } })
        .mockResolvedValueOnce(null),
    };
    const port = makePort({ getByKey: vi.fn().mockResolvedValue({ key: "patient_program_discussion_ui_enabled", scope: "admin", organizationId: null, valueJson: { value: false }, updatedAt: "", updatedBy: null }) });
    const service = createSystemSettingsService(port, { runtimeRepository, runtimeReadTelemetry: telemetry });
    await expect(service.getSetting("patient_program_discussion_ui_enabled", "admin")).resolves.toMatchObject({ valueJson: { value: true } });
    await service.getSetting("patient_program_discussion_ui_enabled", "admin");
    expect(telemetry.record).toHaveBeenCalledWith({ key: "patient_program_discussion_ui_enabled", source: "runtime" });
    expect(telemetry.record).toHaveBeenCalledWith({ key: "patient_program_discussion_ui_enabled", source: "mismatch" });
    expect(telemetry.record).toHaveBeenCalledWith({ key: "patient_program_discussion_ui_enabled", source: "legacy_fallback" });
  });

  it("updateSetting operator_health_alert_config — mirror в integrator после upsert", async () => {
    const port = makePort();
    const service = createSystemSettingsService(port);
    const value = {
      topics: { critical_enabled: true, digest_enabled: true, account_conflicts: true },
      digestTime: "09:00",
      channels: {
        critical: { telegram: true, max: true, web_push: true },
        digest: { telegram: true, max: false, web_push: true },
        account_conflicts: { telegram: true, max: true, web_push: false },
      },
    };
    await service.updateSetting("operator_health_alert_config", "admin", { value }, "admin-uuid");
    expect(port.upsert).toHaveBeenCalledWith(
      "operator_health_alert_config",
      "admin",
      { value },
      "admin-uuid",
      { organizationId: null },
    );
    expect(syncSettingToIntegratorMock).toHaveBeenCalledWith({
      key: "operator_health_alert_config",
      scope: "admin",
      organizationId: null,
      valueJson: { value },
      updatedBy: "admin-uuid",
    });
  });

  it("updateSetting passes organization context to port and mirror sync (PER-ORG key)", async () => {
    // P0.11.3: this test's original intent is the org-PRESERVING path — the port must actually receive
    // the caller's organizationId. `support_contact_url` was reclassified GLOBAL (see `orgScopedKeys.ts`),
    // so it's forced to null now; `patient_label` (PER-ORG) is the key that still exercises this path.
    const port = makePort();
    const service = createSystemSettingsService(port);
    await service.updateSetting("patient_label", "doctor", { value: "Клиенты" }, "user-uuid", {
      organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });

    expect(port.upsert).toHaveBeenCalledWith(
      "patient_label",
      "doctor",
      { value: "Клиенты" },
      "user-uuid",
      { organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    );
    expect(syncSettingToIntegratorMock).toHaveBeenCalledWith({
      key: "patient_label",
      scope: "doctor",
      organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      valueJson: { value: "Клиенты" },
      updatedBy: "user-uuid",
    });
  });

  it("persistAdminModesBatch — upsertManyInTransaction и sync по каждому ключу", async () => {
    const upsertManyInTransaction = vi.fn().mockResolvedValue([
      { key: "dev_mode", scope: "admin", organizationId: null, valueJson: { value: false }, updatedAt: "", updatedBy: "u1" },
      { key: "debug_forward_to_admin", scope: "admin", organizationId: null, valueJson: { value: true }, updatedAt: "", updatedBy: "u1" },
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
      { key: "dev_mode", scope: "admin", organizationId: null, valueJson: { value: false }, updatedBy: "u1" },
      { key: "debug_forward_to_admin", scope: "admin", organizationId: null, valueJson: { value: true }, updatedBy: "u1" },
    ]);
    expect(syncSettingToIntegratorMock).toHaveBeenCalledTimes(2);
  });

  describe("P0.11.3 org-aware write chokepoint (resolveWriteOrganizationId)", () => {
    it("updateSetting — PER-ORG key without organizationId → rejects with SystemSettingsOrgContextRequiredError", async () => {
      const service = createSystemSettingsService(makePort());
      await expect(
        service.updateSetting("patient_label", "doctor", { value: "Клиенты" }, "user-uuid"),
      ).rejects.toThrow(SystemSettingsOrgContextRequiredError);
      await expect(
        service.updateSetting("patient_label", "doctor", { value: "Клиенты" }, "user-uuid"),
      ).rejects.toMatchObject({ name: "SystemSettingsOrgContextRequiredError" });
    });

    it("updateSetting — PER-ORG key with organizationId → port.upsert receives it", async () => {
      const port = makePort();
      const service = createSystemSettingsService(port);
      await service.updateSetting("patient_label", "doctor", { value: "Клиенты" }, "user-uuid", {
        organizationId: "org-1",
      });
      expect(port.upsert).toHaveBeenCalledWith(
        "patient_label",
        "doctor",
        { value: "Клиенты" },
        "user-uuid",
        { organizationId: "org-1" },
      );
    });

    it("allows an explicit platform NULL fallback only for notification-template keys", async () => {
      const port = makePort();
      const service = createSystemSettingsService(port);
      await service.updateSetting(
        "notif_template:created:patient",
        "admin",
        { value: "Platform default" },
        "platform-user",
        { organizationId: null, allowPlatformGlobalFallbackWrite: true },
      );
      expect(port.upsert).toHaveBeenCalledWith(
        "notif_template:created:patient",
        "admin",
        { value: "Platform default" },
        "platform-user",
        { organizationId: null },
      );
    });

    it("does not turn the explicit platform fallback option into a generic per-org bypass", async () => {
      const service = createSystemSettingsService(makePort());
      await expect(service.updateSetting(
        "patient_label",
        "doctor",
        { value: "Клиенты" },
        "platform-user",
        { organizationId: null, allowPlatformGlobalFallbackWrite: true },
      )).rejects.toThrow(SystemSettingsOrgContextRequiredError);
    });

    it("updateSetting — GLOBAL key forces organizationId: null at the port even when caller passes one", async () => {
      const port = makePort();
      const service = createSystemSettingsService(port);
      await service.updateSetting("dev_mode", "admin", { value: true }, "user-uuid", {
        organizationId: "org-1",
      });
      expect(port.upsert).toHaveBeenCalledWith(
        "dev_mode",
        "admin",
        { value: true },
        "user-uuid",
        { organizationId: null },
      );
    });

    it("persistAdminModesBatch — mixed PER-ORG + GLOBAL batch resolves organizationId per-row", async () => {
      const upsertManyInTransaction = vi.fn().mockResolvedValue([
        {
          key: "patient_booking_url",
          scope: "admin",
          organizationId: "org-1",
          valueJson: { value: "https://example.com/book" },
          updatedAt: "",
          updatedBy: "u1",
        },
        { key: "dev_mode", scope: "admin", organizationId: null, valueJson: { value: false }, updatedAt: "", updatedBy: "u1" },
      ]);
      const port = makePort({ upsertManyInTransaction });
      const service = createSystemSettingsService(port);
      await service.persistAdminModesBatch(
        [
          { key: "patient_booking_url", valueJson: { value: "https://example.com/book" } },
          { key: "dev_mode", valueJson: { value: false } },
        ],
        "u1",
        { organizationId: "org-1" },
      );
      expect(upsertManyInTransaction).toHaveBeenCalledWith([
        {
          key: "patient_booking_url",
          scope: "admin",
          organizationId: "org-1",
          valueJson: { value: "https://example.com/book" },
          updatedBy: "u1",
        },
        { key: "dev_mode", scope: "admin", organizationId: null, valueJson: { value: false }, updatedBy: "u1" },
      ]);
    });

    it("persistAdminModesBatch — PER-ORG key in batch without organizationId → rejects with SystemSettingsOrgContextRequiredError", async () => {
      const service = createSystemSettingsService(makePort());
      await expect(
        service.persistAdminModesBatch(
          [
            { key: "patient_booking_url", valueJson: { value: "https://example.com/book" } },
            { key: "dev_mode", valueJson: { value: false } },
          ],
          "u1",
        ),
      ).rejects.toThrow(SystemSettingsOrgContextRequiredError);
    });
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

  it("getRelayDevContext — dev_mode off → devMode false", async () => {
    const port = makePort({
      getByKey: vi.fn().mockImplementation(async (key) => {
        if (key === "dev_mode")
          return { key: "dev_mode", scope: "admin", valueJson: { value: false }, updatedAt: "", updatedBy: null };
        return null;
      }),
    });
    const service = createSystemSettingsService(port);
    await expect(service.getRelayDevContext()).resolves.toEqual({ devMode: false, testAccounts: null });
  });

  it("getRelayDevContext — dev_mode on → testAccounts loaded", async () => {
    const port = makePort({
      getByKey: vi.fn().mockImplementation(async (key) => {
        if (key === "dev_mode")
          return { key: "dev_mode", scope: "admin", valueJson: { value: true }, updatedAt: "", updatedBy: null };
        if (key === "test_account_identifiers")
          return {
            key: "test_account_identifiers",
            scope: "admin",
            valueJson: { value: { phones: [], telegramIds: ["9"], maxIds: [] } },
            updatedAt: "",
            updatedBy: null,
          };
        return null;
      }),
    });
    const service = createSystemSettingsService(port);
    const ctx = await service.getRelayDevContext();
    expect(ctx.devMode).toBe(true);
    expect(ctx.testAccounts?.telegramIds).toEqual(["9"]);
  });

  it("isCurrentPatientTestAccount — delegates to the boolean-only capability", async () => {
    const port = makePort({
      isCurrentPatientTestAccount: vi.fn().mockResolvedValue(true),
    });
    const service = createSystemSettingsService(port);
    await expect(service.isCurrentPatientTestAccount()).resolves.toBe(true);
    expect(port.isCurrentPatientTestAccount).toHaveBeenCalledWith();
    expect(port.getByKey).not.toHaveBeenCalled();
  });
});
