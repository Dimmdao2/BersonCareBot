import type { SystemSetting, SystemSettingKey, SystemSettingScope } from "@/modules/system-settings/types";

export const NOTIF_TEMPLATE_EVENTS = ["created", "cancelled", "rescheduled"] as const;
export type NotifTemplateEvent = (typeof NOTIF_TEMPLATE_EVENTS)[number];

export const NOTIF_TEMPLATE_AUDIENCES = ["patient", "doctor"] as const;
export type NotifTemplateAudience = (typeof NOTIF_TEMPLATE_AUDIENCES)[number];

export const NOTIF_TEMPLATE_VARIABLES = ["date", "type", "city", "name", "phone", "reason"] as const;

export const NOTIF_TEMPLATE_MAX_LENGTH = 2000;

/** Mirrors defaults from integrator notifTemplatePort.ts (same keys, same texts). */
export const NOTIF_TEMPLATE_DEFAULTS: Record<NotifTemplateEvent, Record<NotifTemplateAudience, string>> = {
  created: {
    patient: "Запись подтверждена: {{date}}\n{{type}}{{city}}",
    doctor: "Новая запись: {{name}}, {{phone}}\nДата: {{date}}",
  },
  cancelled: {
    patient: "Запись на {{date}} отменена.{{reason}}",
    doctor: "Отмена записи: {{name}}\nДата: {{date}}",
  },
  rescheduled: {
    patient: "Запись перенесена на {{date}}\n{{type}}",
    doctor: "Перенос записи: {{name}}, {{phone}}\nНовая дата: {{date}}",
  },
};

export function notifTemplateSettingKey(event: NotifTemplateEvent, audience: NotifTemplateAudience): SystemSettingKey {
  return `notif_template:${event}:${audience}` as SystemSettingKey;
}

function extractTextFromValueJson(valueJson: unknown): string | null {
  if (!valueJson || typeof valueJson !== "object" || Array.isArray(valueJson)) return null;
  const v = (valueJson as Record<string, unknown>).value;
  if (typeof v !== "string" || v.trim() === "") return null;
  return v;
}

export type NotifTemplateEntry = {
  event: NotifTemplateEvent;
  audience: NotifTemplateAudience;
  text: string;
  isDefault: boolean;
};

type SystemSettingsReadOptionsLike = { organizationId?: string | null };
type SystemSettingsWriteOptionsLike = { organizationId?: string | null };

type SystemSettingsLike = {
  getSetting(
    key: SystemSettingKey,
    scope: SystemSettingScope,
    options?: SystemSettingsReadOptionsLike,
  ): Promise<SystemSetting | null>;
  updateSetting(
    key: string,
    scope: SystemSettingScope,
    value: unknown,
    updatedBy: string | null,
    options?: SystemSettingsWriteOptionsLike,
  ): Promise<SystemSetting>;
};

/**
 * Notification templates (`notif_template:*`) are PER-ORG (see `orgScopedKeys.ts`) — each clinic edits
 * its own wording. `organizationId` is org-first-then-global-fallback on read, and required by the
 * `system-settings` service chokepoint on write (throws `SystemSettingsOrgContextRequiredError` if
 * missing — the caller/route resolves it from the current session's organization membership).
 */
export function createNotifTemplatesService(systemSettings: SystemSettingsLike) {
  async function getTemplate(
    event: NotifTemplateEvent,
    audience: NotifTemplateAudience,
    options: SystemSettingsReadOptionsLike = {},
  ): Promise<NotifTemplateEntry> {
    const key = notifTemplateSettingKey(event, audience);
    const row = await systemSettings.getSetting(key, "admin", options);
    const stored = extractTextFromValueJson(row?.valueJson ?? null);
    return {
      event,
      audience,
      text: stored ?? NOTIF_TEMPLATE_DEFAULTS[event][audience],
      isDefault: stored === null,
    };
  }

  return {
    async getAllTemplates(options: SystemSettingsReadOptionsLike = {}): Promise<NotifTemplateEntry[]> {
      return Promise.all(
        NOTIF_TEMPLATE_EVENTS.flatMap((event) =>
          NOTIF_TEMPLATE_AUDIENCES.map((audience) => getTemplate(event, audience, options)),
        ),
      );
    },

    async saveTemplate(
      event: NotifTemplateEvent,
      audience: NotifTemplateAudience,
      text: string,
      userId: string,
      options: SystemSettingsWriteOptionsLike = {},
    ): Promise<NotifTemplateEntry> {
      const key = notifTemplateSettingKey(event, audience);
      await systemSettings.updateSetting(key, "admin", { value: text }, userId, options);
      return { event, audience, text, isDefault: false };
    },
  };
}

export type NotifTemplatesService = ReturnType<typeof createNotifTemplatesService>;
