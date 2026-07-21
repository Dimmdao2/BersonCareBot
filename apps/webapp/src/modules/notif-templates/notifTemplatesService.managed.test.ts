import { describe, expect, it, vi } from "vitest";
import type { SystemSetting, SystemSettingKey, SystemSettingScope } from "@/modules/system-settings/types";
import {
  createDefaultManagedNotifTemplate,
  parseManagedNotifTemplateFor,
  type ManagedNotifTemplateChannels,
} from "./managedNotifTemplate";
import {
  NotifTemplateConflictError,
  createNotifTemplatesService,
  notifTemplateSettingKey,
} from "./notifTemplatesService";

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function row(key: SystemSettingKey, organizationId: string | null, valueJson: unknown): SystemSetting {
  return { key, scope: "admin", organizationId, valueJson, updatedAt: "2026-07-21T10:00:00Z", updatedBy: "actor" };
}

function createFakeSettings(initial: SystemSetting[]) {
  const rows = new Map(initial.map((setting) => [`${setting.key}:${setting.organizationId ?? "global"}`, setting]));
  let writeSequence = 0;
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
  const updateSettingIfUnchanged = vi.fn(async (
    key: string,
    scope: SystemSettingScope,
    valueJson: unknown,
    updatedBy: string | null,
    expectedUpdatedAt: string | null,
    options?: { organizationId?: string | null },
  ) => {
    const organizationId = options?.organizationId ?? null;
    const identity = `${key}:${organizationId ?? "global"}`;
    const current = rows.get(identity) ?? null;
    if ((current?.updatedAt ?? null) !== expectedUpdatedAt) return null;
    writeSequence += 1;
    const saved = row(key as SystemSettingKey, organizationId, valueJson);
    saved.updatedAt = `2026-07-21T10:00:${String(writeSequence).padStart(2, "0")}.000Z`;
    saved.updatedBy = updatedBy;
    rows.set(identity, saved);
    return saved;
  });
  return {
    updateSetting,
    updateSettingIfUnchanged,
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
    expect(entry?.metadata.effectiveSource).toBe("organization");
    expect(entry?.managed.channels.email.plainText).toBe("Организационный legacy");
  });

  it("preserves legacy value and uses the bounded global-fallback write option", async () => {
    const key = notifTemplateSettingKey("created", "patient");
    const settings = createFakeSettings([row(key, null, { value: "Не терять" })]);
    const service = createNotifTemplatesService(settings);
    const channels = createDefaultManagedNotifTemplate("created", "patient").channels;
    await service.saveManagedTemplate(
      "created", "patient", channels, "platform-user", "2026-07-21T10:00:00Z", { organizationId: null },
    );
    expect(settings.updateSettingIfUnchanged).toHaveBeenCalledWith(
      key,
      "admin",
      expect.objectContaining({ value: "Не терять", managed: expect.objectContaining({ revision: 1 }) }),
      "platform-user",
      "2026-07-21T10:00:00Z",
      { organizationId: null, allowPlatformGlobalFallbackWrite: true },
    );
  });

  it("writes an organization override only to the server-resolved organization", async () => {
    const settings = createFakeSettings([]);
    const service = createNotifTemplatesService(settings);
    const channels = createDefaultManagedNotifTemplate("rescheduled", "doctor").channels;
    await service.saveManagedTemplate("rescheduled", "doctor", channels, "owner-a", null, { organizationId: ORG_A });
    expect(settings.updateSettingIfUnchanged).toHaveBeenCalledWith(
      notifTemplateSettingKey("rescheduled", "doctor"),
      "admin",
      expect.objectContaining({ managed: expect.any(Object) }),
      "owner-a",
      null,
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
    await service.saveManagedTemplate("created", "patient", platform.channels, "owner-a", null, {
      organizationId: ORG_A,
    });
    const written = settings.updateSettingIfUnchanged.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(written.value).toBe("Глобальный legacy");
    expect(written.managed).toBeDefined();
    expect(written.presentation).toBeUndefined();
  });

  it("surfaces an incompatible legacy template without deleting its original text", async () => {
    const key = notifTemplateSettingKey("cancelled", "patient");
    const legacy = "Запись отменена: {{reason}}";
    const settings = createFakeSettings([row(key, ORG_A, { value: legacy })]);
    const service = createNotifTemplatesService(settings);
    const entries = await service.getManagedTemplates({ organizationId: ORG_A });
    const entry = entries.find((candidate) => candidate.event === "cancelled" && candidate.audience === "patient");
    expect(entry?.legacyCompatibility).toEqual({
      status: "incompatible",
      preservedText: legacy,
      forbiddenVariables: ["reason"],
    });
    expect(entry?.managed.channels.email.plainText).not.toContain("{{reason}}");
  });

  it("rejects one of two stale concurrent channel saves instead of losing a neighboring edit", async () => {
    const key = notifTemplateSettingKey("created", "patient");
    const original = { ...createDefaultManagedNotifTemplate("created", "patient"), revision: 1 };
    const settings = createFakeSettings([row(key, ORG_A, { value: "legacy", managed: original })]);
    const service = createNotifTemplatesService(settings);
    const initial = (await service.getManagedTemplates({ organizationId: ORG_A }))[0]!;
    const emailEdit: ManagedNotifTemplateChannels = {
      ...initial.managed.channels,
      email: { ...initial.managed.channels.email, subject: "Email edit" },
    };
    const pushEdit: ManagedNotifTemplateChannels = {
      ...initial.managed.channels,
      web_push: { ...initial.managed.channels.web_push, title: "Push edit" },
    };
    const results = await Promise.allSettled([
      service.saveManagedTemplate("created", "patient", emailEdit, "owner-a", initial.metadata.writeToken, {
        organizationId: ORG_A,
      }),
      service.saveManagedTemplate("created", "patient", pushEdit, "owner-b", initial.metadata.writeToken, {
        organizationId: ORG_A,
      }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(NotifTemplateConflictError);
    const stored = await settings.getSetting(key, "admin", { organizationId: ORG_A });
    const persisted = parseManagedNotifTemplateFor("created", "patient", stored?.valueJson);
    const emailWon = persisted?.channels.email.subject === "Email edit";
    const pushWon = persisted?.channels.web_push.title === "Push edit";
    expect(Number(emailWon) + Number(pushWon)).toBe(1);
  });

  it("rejects a stale presentation/template race and preserves both neighboring envelopes", async () => {
    const key = notifTemplateSettingKey("created", "patient");
    const original = { ...createDefaultManagedNotifTemplate("created", "patient"), revision: 1 };
    const originalPresentation = {
      version: 1 as const,
      revision: 1,
      layout: "neutral" as const,
      signature: "Old signature",
      contacts: "Old contacts",
      logoAssetId: null,
      avatarAssetId: null,
    };
    const settings = createFakeSettings([
      row(key, ORG_A, { value: "legacy", managed: original, presentation: originalPresentation }),
    ]);
    const service = createNotifTemplatesService(settings);
    const template = (await service.getManagedTemplates({ organizationId: ORG_A }))[0]!;
    const presentation = await service.getManagedPresentation({ organizationId: ORG_A });
    const editedChannels: ManagedNotifTemplateChannels = {
      ...template.managed.channels,
      email: { ...template.managed.channels.email, subject: "Changed template" },
    };
    const results = await Promise.allSettled([
      service.saveManagedTemplate(
        "created", "patient", editedChannels, "owner-a", template.metadata.writeToken, { organizationId: ORG_A },
      ),
      service.saveManagedPresentation(
        { layout: "organization", signature: "New signature", contacts: "Contacts" },
        "owner-b",
        presentation.metadata.writeToken,
        { organizationId: ORG_A },
      ),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const stored = await settings.getSetting(key, "admin", { organizationId: ORG_A });
    expect(stored?.valueJson).toEqual(expect.objectContaining({
      managed: expect.any(Object),
      presentation: expect.any(Object),
    }));
  });
});
