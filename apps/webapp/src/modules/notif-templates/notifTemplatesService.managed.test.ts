import { describe, expect, it, vi } from "vitest";
import type { SystemSetting, SystemSettingKey, SystemSettingScope } from "@/modules/system-settings/types";
import {
  createDefaultManagedNotifTemplate,
  type ManagedNotifTemplateChannels,
} from "./managedNotifTemplate";
import { createNotifTemplatesService, notifTemplateSettingKey } from "./notifTemplatesService";

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function row(key: SystemSettingKey, organizationId: string | null, valueJson: unknown): SystemSetting {
  return { key, scope: "admin", organizationId, valueJson, updatedAt: "2026-07-21T10:00:00Z", updatedBy: "actor" };
}

function createFakeSettings(initial: SystemSetting[]) {
  const rows = new Map(initial.map((setting) => [`${setting.key}:${setting.organizationId ?? "global"}`, setting]));
  const updateSetting = vi.fn(async (
    key: string,
    scope: SystemSettingScope,
    valueJson: unknown,
    updatedBy: string | null,
    options?: { organizationId?: string | null },
  ) => {
    const organizationId = options?.organizationId ?? null;
    const saved = row(key as SystemSettingKey, organizationId, valueJson);
    saved.updatedBy = updatedBy;
    rows.set(`${key}:${organizationId ?? "global"}`, saved);
    return saved;
  });
  return {
    updateSetting,
    getSetting: vi.fn(async (
      key: SystemSettingKey,
      _scope: SystemSettingScope,
      options?: { organizationId?: string | null },
    ) => {
      const organizationId = options?.organizationId?.trim() || null;
      return rows.get(`${key}:${organizationId ?? "global"}`) ?? rows.get(`${key}:global`) ?? null;
    }),
  };
}

describe("managed notification template resolution", () => {
  it("resolves platform default then exact organization override without cross-org leakage", async () => {
    const key = notifTemplateSettingKey("created", "patient");
    const platform = createDefaultManagedNotifTemplate("created", "patient");
    const orgChannels: ManagedNotifTemplateChannels = {
      ...platform.channels,
      email: { ...platform.channels.email, subject: "Организация A" },
    };
    const settings = createFakeSettings([
      row(key, null, { value: "Старый глобальный текст", managed: { ...platform, revision: 1 } }),
      row(key, ORG_A, { value: "Старый текст A", managed: { version: 1, revision: 2, channels: orgChannels } }),
    ]);
    const service = createNotifTemplatesService(settings);
    const [entryA] = await service.getManagedTemplates({ organizationId: ORG_A });
    const [entryB] = await service.getManagedTemplates({ organizationId: ORG_B });
    expect(entryA?.managed.channels.email.subject).toBe("Организация A");
    expect(entryA?.legacyText).toBe("Старый текст A");
    expect(entryA?.metadata.effectiveSource).toBe("organization");
    expect(entryB?.managed.channels.email.subject).toBe(platform.channels.email.subject);
    expect(entryB?.legacyText).toBe("Старый глобальный текст");
    expect(entryB?.metadata.effectiveSource).toBe("platform");
  });

  it("keeps a legacy org value while falling back to the platform managed contract", async () => {
    const key = notifTemplateSettingKey("created", "patient");
    const platform = createDefaultManagedNotifTemplate("created", "patient");
    const settings = createFakeSettings([
      row(key, null, { value: "Глобальный legacy", managed: { ...platform, revision: 1 } }),
      row(key, ORG_A, { value: "Организационный legacy" }),
    ]);
    const service = createNotifTemplatesService(settings);
    const [entry] = await service.getManagedTemplates({ organizationId: ORG_A });
    expect(entry?.legacyText).toBe("Организационный legacy");
    expect(entry?.metadata.effectiveSource).toBe("platform");
  });

  it("preserves legacy value and uses the bounded global-fallback write option", async () => {
    const key = notifTemplateSettingKey("created", "patient");
    const settings = createFakeSettings([row(key, null, { value: "Не терять" })]);
    const service = createNotifTemplatesService(settings);
    const channels = createDefaultManagedNotifTemplate("created", "patient").channels;
    await service.saveManagedTemplate("created", "patient", channels, "platform-user", { organizationId: null });
    expect(settings.updateSetting).toHaveBeenCalledWith(
      key,
      "admin",
      expect.objectContaining({ value: "Не терять", managed: expect.objectContaining({ revision: 1 }) }),
      "platform-user",
      { organizationId: null, allowPlatformGlobalFallbackWrite: true },
    );
  });

  it("writes an organization override only to the server-resolved organization", async () => {
    const settings = createFakeSettings([]);
    const service = createNotifTemplatesService(settings);
    const channels = createDefaultManagedNotifTemplate("rescheduled", "doctor").channels;
    await service.saveManagedTemplate("rescheduled", "doctor", channels, "owner-a", { organizationId: ORG_A });
    expect(settings.updateSetting).toHaveBeenCalledWith(
      notifTemplateSettingKey("rescheduled", "doctor"),
      "admin",
      expect.objectContaining({ managed: expect.any(Object) }),
      "owner-a",
      { organizationId: ORG_A },
    );
  });

  it("does not snapshot unrelated platform presentation into a new org template override", async () => {
    const key = notifTemplateSettingKey("created", "patient");
    const platform = createDefaultManagedNotifTemplate("created", "patient");
    const settings = createFakeSettings([
      row(key, null, {
        value: "Глобальный legacy",
        managed: { ...platform, revision: 1 },
        presentation: {
          version: 1,
          revision: 3,
          layout: "organization",
          signature: "Платформенная подпись",
          contacts: "",
          logoAssetId: null,
          avatarAssetId: null,
        },
      }),
    ]);
    const service = createNotifTemplatesService(settings);
    await service.saveManagedTemplate("created", "patient", platform.channels, "owner-a", {
      organizationId: ORG_A,
    });
    const written = settings.updateSetting.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(written.value).toBe("Глобальный legacy");
    expect(written.managed).toBeDefined();
    expect(written.presentation).toBeUndefined();
  });
});
